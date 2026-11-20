# Starfall

A typing game for studying flashcards. Prompts fall toward a planet and you type the answer before they hit the ground.

## Run it

```sh
npm install
npm run dev      # http://localhost:5173
npm test         # parser, answer-checking and card-picking tests
npm run build    # static site in dist/, host anywhere
```

## Decks

Import a deck from the home screen by dropping or choosing a file, or by pasting text:

- **Anki**: File → Export → *Notes in Plain Text (.txt)*. Starfall reads Anki's `#separator`, `#html`, `#deck column`, `#notetype column`, `#tags column` and `#guid column` headers, strips HTML, media and cloze markup, and takes the deck name from the file.
- **CSV / TSV / semicolon / pipe**: one card per line, with the separator detected automatically. Quoted fields are supported.

The first remaining column is the front and the second is the back. You can swap them on the preview screen.
`public/samples/anki-spanish-space.txt` is an example Anki export.

Decks, settings and best scores are saved in the browser's `localStorage`.

## How it plays

- Rocks fall in a centred lane (60% of the screen width, at most 720 px), away from the edges.
- Type an answer and press Enter. It destroys the matching prompt; if several match, the lowest one goes.
- If a prompt hits the planet, you lose a shield and must retype the correct answer before play continues.
- Missed cards come back soon and appear more often for the rest of the run.
- Every 8 correct answers is a new level: prompts fall faster and more are on screen at once. Every third level gives back a shield.
- Stuck? Click or tap a falling rock to see its answer for 2.5 seconds. You still have to type it, it scores half points, and the card goes on your review list.
- You score more for answering fast and for keeping a streak.
- Forgiving answers (on by default) ignores case, accents and punctuation, accepts any of several answers separated by `,` `;` or ` / `, treats `(parenthesised)` words as optional, and allows one typo on answers of 6 or more characters.

## Code

| File | What it does |
| --- | --- |
| `src/parser.ts` | Parses Anki, CSV and TSV files into cards |
| `src/answer.ts` | Normalises and checks answers |
| `src/picker.ts` | Chooses the next card, favouring missed ones |
| `src/game.ts` | Game rules, loop and canvas rendering |
| `src/main.ts` | Screens, import flow, HUD and storage wiring |
