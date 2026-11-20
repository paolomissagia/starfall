# Starfall

A typing game for studying flashcards. Prompts fall toward a planet and you type the answer before they hit the ground.

Built with Expo (React Native), so one codebase runs on Android and in the browser. iOS works too.

## Run it

```sh
npm install
npm start          # Expo dev server: press a for Android, w for web
npm run web        # web only
npm test           # parser, answer checking, card picker and game engine tests
npm run typecheck
npm run lint
npm run build:web  # static site in dist/ (what Vercel deploys)
```

To try it on an Android phone during development, install **Expo Go** from the Play Store and scan the QR code that `npm start` prints. Every library used is included in Expo Go.

## Android builds (EAS)

Builds run in Expo's cloud, so Android Studio isn't needed:

```sh
npx eas-cli@latest login
npx eas-cli@latest build -p android --profile preview      # installable .apk for your own phone
npx eas-cli@latest build -p android --profile production   # .aab for the Play Store
npx eas-cli@latest submit -p android                       # upload to Google Play
```

The profiles are in `eas.json`. The app id is `com.paolomissagia.starfall`, set in `app.json`.

## Decks

Import a deck from the home screen. On Android you choose a file; on the web you drop or choose one. You can also paste text.

- **Anki**: File → Export → *Notes in Plain Text (.txt)*. Starfall reads Anki's `#separator`, `#html`, `#deck column`, `#notetype column`, `#tags column` and `#guid column` headers, strips HTML, media and cloze markup, and takes the deck name from the file.
- **CSV / TSV / semicolon / pipe**: one card per line, with the separator detected automatically. Quoted fields are supported.

The first remaining column is the front and the second is the back. You can swap them on the preview screen. `public/samples/anki-spanish-space.txt` is an example Anki export.

Decks, settings and best scores are saved on the device: AsyncStorage on Android, localStorage on the web.

## How it plays

- Rocks fall in a centred lane, away from the edges: 86% of the width on phones, 60% (at most 720 px) on larger screens.
- Type an answer and press Enter. It destroys the matching rock; if several match, the lowest one goes.
- If a rock hits the planet, you lose a shield and must retype the correct answer before play continues.
- Missed cards come back soon and appear more often for the rest of the run.
- Every 8 correct answers is a new level: rocks fall faster and more are on screen at once. Every third level gives back a shield.
- Stuck? Tap or click a falling rock to see its answer for 2.5 seconds. You still have to type it, it scores half points, and the card goes on your review list.
- Forgiving answers (on by default) ignores case, accents and punctuation, accepts any of several answers separated by `,` `;` or ` / `, treats `(parenthesised)` words as optional, and allows one typo on answers of 6 or more characters.
- On phones: the play area shrinks when the keyboard opens and the rocks keep their place, the screen stays awake during a run, impacts and wrong answers vibrate, and the back button pauses.

## Code

| Path | What it does |
| --- | --- |
| `src/app/` | Screens (Expo Router): home, import preview, deck setup, play, results |
| `src/core/` | Deck parser, answer checking, card picker. Plain TypeScript |
| `src/game/engine.ts` | Game rules and simulation. Plain TypeScript, no rendering |
| `src/game/renderer.ts` | Draws each frame with Skia |
| `src/game/GameView.tsx` | Game screen: canvas, game loop, HUD, answer box, input handling |
| `src/game/Game.web.tsx` | Web only: loads Skia's WebAssembly runtime before the game |
| `src/state/` | Decks store and persistence |
| `src/files/` | Picking and reading deck files (native and web versions) |
| `src/ui/` | Shared UI components and theme |

On the web, Skia runs on CanvasKit (WebAssembly). `npm run build:web` copies `canvaskit.wasm` into `public/` first. That file is generated, so it isn't committed.
