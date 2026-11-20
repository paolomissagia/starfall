import {
  BlendMode,
  BlurStyle,
  ClipOp,
  PaintStyle,
  Skia,
  TileMode,
  type SkColor,
  type SkCanvas,
  type SkFont,
  type SkMaskFilter,
  type SkPaint,
  type SkPath,
  type SkPicture,
  type SkPictureRecorder,
  type SkShader,
} from '@shopify/react-native-skia';

import { clamp, LINE_HEIGHT, PAD_Y, REVEAL_SECONDS, type Engine, type Meteor } from './engine';

/**
 * Draws the engine state into an SkPicture each frame.
 *
 * On web, Skia objects live in WebAssembly memory and are not garbage
 * collected, so everything here is either cached and reused, or explicitly
 * disposed when it is no longer needed.
 */

export interface Fonts {
  text: SkFont;
  small: SkFont;
  score: SkFont;
}

type Disposable = { dispose(): void };

const colorCache = new Map<string, SkColor>();
function color(hex: string): SkColor {
  let c = colorCache.get(hex);
  if (!c) {
    c = Skia.Color(hex);
    colorCache.set(hex, c);
  }
  return c;
}

interface MeteorCache {
  key: string;
  flame: SkPath;
  flameShader: SkShader;
  body: SkShader;
}

export class Renderer {
  private recorder: SkPictureRecorder = Skia.PictureRecorder();
  private fill: SkPaint = Skia.Paint();
  private stroke: SkPaint = Skia.Paint();
  private glow: SkPaint = Skia.Paint();
  private additive: SkPaint = Skia.Paint();
  private shaded: SkPaint = Skia.Paint();
  private blurs = new Map<number, SkMaskFilter>();
  private sized: Disposable[] = [];
  private bg: SkShader | null = null;
  private atmosphere: SkShader | null = null;
  private surface: SkShader | null = null;
  private meteorCache = new Map<number, MeteorCache>();
  private sizedFor = '';
  /** Pictures stay alive for two frames so the one on screen is never freed. */
  private retired: SkPicture[] = [];

  constructor(private readonly fonts: Fonts) {
    for (const p of [this.fill, this.stroke, this.glow, this.additive, this.shaded]) p.setAntiAlias(true);
    this.stroke.setStyle(PaintStyle.Stroke);
    this.additive.setBlendMode(BlendMode.Plus);
  }

  dispose(): void {
    for (const p of this.retired) p.dispose();
    this.retired = [];
    this.disposeSized();
    for (const id of [...this.meteorCache.keys()]) this.dropMeteor(id);
    for (const b of this.blurs.values()) b.dispose();
    this.blurs.clear();
    for (const p of [this.fill, this.stroke, this.glow, this.additive, this.shaded]) p.dispose();
    this.recorder.dispose();
  }

  draw(engine: Engine): SkPicture {
    const { w, h } = engine;
    this.ensureSized(engine);
    const canvas = this.recorder.beginRecording(Skia.XYWHRect(0, 0, w, h));

    this.shaded.setShader(this.bg);
    this.shaded.setAlphaf(1);
    canvas.drawRect(Skia.XYWHRect(0, 0, w, h), this.shaded);

    canvas.save();
    if (engine.shake > 0) {
      canvas.translate((Math.random() - 0.5) * engine.shake, (Math.random() - 0.5) * engine.shake);
    }
    this.drawStars(canvas, engine);
    this.drawPlanet(canvas, engine);
    this.drawParticles(canvas, engine);
    for (const m of engine.meteors) this.drawMeteor(canvas, engine, m);
    this.drawFloaters(canvas, engine);
    canvas.restore();

    if (engine.flash > 0) {
      this.fill.setColor(color('#ff463c'));
      this.fill.setAlphaf(engine.flash * 0.28);
      canvas.drawRect(Skia.XYWHRect(0, 0, w, h), this.fill);
    }

    // Free cached rock resources for rocks that are gone.
    const alive = new Set(engine.meteors.map((m) => m.id));
    for (const id of [...this.meteorCache.keys()]) if (!alive.has(id)) this.dropMeteor(id);

    const picture = this.recorder.finishRecordingAsPicture();
    this.retired.push(picture);
    while (this.retired.length > 3) this.retired.shift()?.dispose();
    return picture;
  }

  // ---------------------------------------------------------------- resources

  private blur(sigma: number): SkMaskFilter {
    const key = Math.max(1, Math.round(sigma));
    let f = this.blurs.get(key);
    if (!f) {
      f = Skia.MaskFilter.MakeBlur(BlurStyle.Normal, key, true);
      this.blurs.set(key, f);
    }
    return f;
  }

  private disposeSized(): void {
    for (const d of this.sized) d.dispose();
    this.sized = [];
  }

  private ensureSized(engine: Engine): void {
    const { w, h, planet } = engine;
    const key = `${w}x${h}`;
    if (key === this.sizedFor) return;
    this.sizedFor = key;
    this.disposeSized();
    this.bg = Skia.Shader.MakeLinearGradient(
      Skia.Point(0, 0),
      Skia.Point(0, h),
      [color('#05060f'), color('#0d0f2b'), color('#241a45')],
      [0, 0.55, 1],
      TileMode.Clamp,
    );
    this.atmosphere = Skia.Shader.MakeRadialGradient(
      Skia.Point(planet.cx, planet.cy),
      planet.r + 70,
      [color('rgba(90,220,255,0.45)'), color('rgba(90,220,255,0.45)'), color('rgba(90,160,255,0.18)'), color('rgba(90,160,255,0)')],
      [0, (planet.r - 10) / (planet.r + 70), (planet.r + 10) / (planet.r + 70), 1],
      TileMode.Clamp,
    );
    this.surface = Skia.Shader.MakeLinearGradient(
      Skia.Point(0, planet.top),
      Skia.Point(0, h),
      [color('#2fb3a3'), color('#1d6f7a'), color('#123049')],
      [0, 0.35, 1],
      TileMode.Clamp,
    );
    this.sized.push(this.bg, this.atmosphere, this.surface);
    // Flame lengths depend on fall speed, which depends on height.
    for (const id of [...this.meteorCache.keys()]) this.dropMeteor(id);
  }

  private meteorResources(engine: Engine, m: Meteor): MeteorCache {
    const { w, h } = m.face;
    const len = Math.round(50 + engine.speed(m) * 0.35);
    const key = `${w}|${h}|${len}`;
    const cached = this.meteorCache.get(m.id);
    if (cached?.key === key) return cached;
    if (cached) this.dropMeteor(m.id);

    // Everything is in rock-local coordinates: (0, 0) is the rock's top-left.
    const builder = Skia.PathBuilder.Make();
    builder
      .moveTo(4, h * 0.5)
      .quadTo(w * 0.25, -len * 0.4, w / 2, -len)
      .quadTo(w * 0.75, -len * 0.4, w - 4, h * 0.5)
      .close();
    const flame = builder.detach();
    builder.dispose();
    const flameShader = Skia.Shader.MakeLinearGradient(
      Skia.Point(0, -len),
      Skia.Point(0, h * 0.5),
      [color('rgba(255,120,60,0)'), color('rgba(255,150,80,0.55)')],
      null,
      TileMode.Clamp,
    );
    const body = Skia.Shader.MakeLinearGradient(
      Skia.Point(0, 0),
      Skia.Point(0, h),
      [color('#776459'), color('#3b2f2b')],
      null,
      TileMode.Clamp,
    );
    const entry = { key, flame, flameShader, body };
    this.meteorCache.set(m.id, entry);
    return entry;
  }

  private dropMeteor(id: number): void {
    const c = this.meteorCache.get(id);
    if (!c) return;
    c.flame.dispose();
    c.flameShader.dispose();
    c.body.dispose();
    this.meteorCache.delete(id);
  }

  // ---------------------------------------------------------------- layers

  private drawStars(canvas: SkCanvas, engine: Engine): void {
    const { h, time } = engine;
    this.fill.setColor(color('#dce4ff'));
    for (const s of engine.stars) {
      const y = (s.y + ((time * (4 + s.depth * 10)) % h)) % h;
      const twinkle = 0.5 + 0.5 * Math.sin(time * (0.8 + s.depth * 2) + s.phase);
      this.fill.setAlphaf(0.35 + 0.65 * twinkle * (0.4 + s.depth * 0.6));
      canvas.drawCircle(s.x, y, s.r, this.fill);
    }
  }

  private drawPlanet(canvas: SkCanvas, engine: Engine): void {
    const { cx, cy, r } = engine.planet;

    this.shaded.setShader(this.atmosphere);
    this.shaded.setAlphaf(1);
    canvas.drawCircle(cx, cy, r + 70, this.shaded);

    this.shaded.setShader(this.surface);
    canvas.drawCircle(cx, cy, r, this.shaded);

    canvas.save();
    canvas.clipRRect(Skia.RRectXY(Skia.XYWHRect(cx - r, cy - r, r * 2, r * 2), r, r), ClipOp.Intersect, true);
    // Subtle continents.
    this.fill.setColor(color('#a0e6aa'));
    this.fill.setAlphaf(0.16);
    for (let i = 0; i < 7; i++) {
      const x = ((i * 197 + 60) % (engine.w + 200)) - 100;
      const y = engine.surfaceY(x) + 18 + (i % 3) * 14;
      const rx = 60 + (i % 4) * 25;
      const ry = 10 + (i % 2) * 6;
      canvas.drawOval(Skia.XYWHRect(x - rx, y - ry, rx * 2, ry * 2), this.fill);
    }
    // Impact scars: soft glowing ovals.
    for (const s of engine.scars) {
      const y = engine.surfaceY(s.x) + 4;
      const a = Math.min(1, s.life / 2);
      this.glow.setMaskFilter(this.blur(10));
      this.glow.setColor(color('#8c3228'));
      this.glow.setAlphaf(0.6 * a);
      canvas.drawOval(Skia.XYWHRect(s.x - 46, y - 18, 92, 36), this.glow);
      this.glow.setColor(color('#ff8c50'));
      this.glow.setAlphaf(0.85 * a);
      canvas.drawOval(Skia.XYWHRect(s.x - 20, y - 8, 40, 16), this.glow);
    }
    canvas.restore();

    this.stroke.setColor(color('#aaf5ff'));
    this.stroke.setAlphaf(0.7);
    this.stroke.setStrokeWidth(2);
    canvas.drawCircle(cx, cy, r, this.stroke);
  }

  private drawParticles(canvas: SkCanvas, engine: Engine): void {
    for (const p of engine.particles) {
      const t = p.life / p.max;
      this.additive.setColor(color(p.color));
      this.additive.setAlphaf(t);
      canvas.drawCircle(p.x, p.y, p.size * (0.4 + 0.6 * t), this.additive);
    }
  }

  private drawMeteor(canvas: SkCanvas, engine: Engine, m: Meteor): void {
    const { w, h, lines } = m.face;
    const res = this.meteorResources(engine, m);
    const danger = clamp(m.progress, 0, 1);
    const revealed = m.revealLeft > 0;
    const rim = revealed ? [79, 214, 196] : mix([255, 178, 92], [255, 72, 60], danger);
    const rimColor = `rgb(${rim[0]},${rim[1]},${rim[2]})`;
    const radius = Math.min(16, h / 2);
    const left = m.x - w / 2;
    const top = engine.bottom(m) - h;
    const rrect = Skia.RRectXY(Skia.XYWHRect(0, 0, w, h), radius, radius);

    canvas.save();
    canvas.translate(left, top);

    // Flame cone behind the rock.
    this.shaded.setShader(res.flameShader);
    this.shaded.setAlphaf(1);
    canvas.drawPath(res.flame, this.shaded);

    // Glow, then the rock body.
    this.glow.setMaskFilter(this.blur(8 + danger * 9));
    this.glow.setColor(color(rimColor));
    this.glow.setAlphaf(0.55 + danger * 0.35);
    canvas.drawRRect(rrect, this.glow);
    this.shaded.setShader(res.body);
    canvas.drawRRect(rrect, this.shaded);

    // Craters.
    canvas.save();
    canvas.clipRRect(rrect, ClipOp.Intersect, true);
    this.fill.setColor(color('#191210'));
    this.fill.setAlphaf(0.35);
    const rand = seeded(m.seed);
    const craters = 3 + Math.floor(w / 60);
    for (let i = 0; i < craters; i++) {
      const cx = rand() * w;
      const cy = rand() * h;
      const rx = 4 + rand() * 9;
      const ry = 3 + rand() * 6;
      canvas.drawOval(Skia.XYWHRect(cx - rx, cy - ry, rx * 2, ry * 2), this.fill);
    }
    canvas.restore();

    this.stroke.setColor(color(rimColor));
    this.stroke.setAlphaf(0.9);
    this.stroke.setStrokeWidth(1.5);
    canvas.drawRRect(Skia.RRectXY(Skia.XYWHRect(0.75, 0.75, w - 1.5, h - 1.5), radius, radius), this.stroke);

    if (revealed) {
      const t = clamp(m.revealLeft / REVEAL_SECONDS, 0, 1);
      this.fill.setColor(color('#4fd6c4'));
      this.fill.setAlphaf(0.85);
      canvas.drawRect(Skia.XYWHRect(radius, h - 4, (w - radius * 2) * t, 2), this.fill);
      this.fill.setColor(color('#9ff0e4'));
      this.fill.setAlphaf(1);
      this.centerText(canvas, 'ANSWER', w / 2, -5, this.fonts.small, this.fill);
    }

    // Text with a soft shadow for legibility.
    const metrics = this.fonts.text.getMetrics();
    const baselineOffset = (LINE_HEIGHT - (metrics.descent - metrics.ascent)) / 2 - metrics.ascent;
    lines.forEach((line, i) => {
      const y = PAD_Y + LINE_HEIGHT * i + baselineOffset;
      this.glow.setMaskFilter(this.blur(2));
      this.glow.setColor(color('#000000'));
      this.glow.setAlphaf(0.6);
      this.centerText(canvas, line, w / 2, y + 1, this.fonts.text, this.glow);
      this.fill.setColor(color(revealed ? '#d9fff8' : '#fff8ef'));
      this.fill.setAlphaf(1);
      this.centerText(canvas, line, w / 2, y, this.fonts.text, this.fill);
    });

    canvas.restore();
  }

  private drawFloaters(canvas: SkCanvas, engine: Engine): void {
    for (const f of engine.floaters) {
      const t = f.life / f.max;
      const alpha = Math.min(1, t * 1.5);
      if (f.kind === 'ring') {
        this.stroke.setColor(color(f.color));
        this.stroke.setAlphaf(alpha);
        this.stroke.setStrokeWidth(Math.max(0.1, 3 * t));
        canvas.drawCircle(f.x, f.y, 10 + (1 - t) * 70, this.stroke);
      } else if (f.text) {
        this.fill.setColor(color(f.color));
        this.fill.setAlphaf(alpha);
        this.centerText(canvas, f.text, f.x, f.y, this.fonts.score, this.fill);
      }
    }
  }

  private centerText(canvas: SkCanvas, text: string, x: number, baseline: number, font: SkFont, paint: SkPaint): void {
    canvas.drawText(text, x - font.measureText(text).width / 2, baseline, paint, font);
  }
}

function mix(a: number[], b: number[], t: number): number[] {
  return a.map((v, i) => Math.round(v + (b[i] - v) * t));
}

function seeded(seed: number): () => number {
  let s = Math.floor(seed * 9301) % 233280;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}
