# Magnus

A chess coach that explains **why**. Play a bot or review a game, and every move gets a grade plus a plain-language breakdown: what it does, what it gives up, what happens in the next few moves, what was better, and a habit to build so you stop repeating the mistake.

Everything runs in the browser. There's no server and no API key: Stockfish 17.1 (WASM) does the analysis locally.

## Features

- **Review**: paste a PGN or import your chess.com games by username. You get accuracy for both sides, your key moments, a move-by-move explanation, and replays of the punishment line and the better line.
- **Find a better move**: retry your own mistakes as puzzles, and Magnus checks your idea and explains it.
- **Play**: 9 levels from Beginner (≈400) to Maximum (≈3200). Optional safety net (warns before you hang a piece or allow mate), live grades, a two-step hint, and take back.
- **Patterns**: tracks which kinds of mistakes you make most and gives you one thing to focus on next game.
- **Learn the terms gradually**: plain words first, with chess terms attached. Tap any term for a definition. After you've seen a term enough times, it replaces the plain wording.
- Light/dark themes, animation settings (Full / Reduced / Off), and vibration on moves (Android; light taps on iOS 18+).

## Run locally

Any static file server works:

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000.

## Deploy

It's a static site: enable GitHub Pages on the `main` branch (root folder).

## Credits and licenses

- [Stockfish](https://stockfishchess.org/) 17.1 via [stockfish.js](https://github.com/nmrugg/stockfish.js), GPLv3 (see `vendor/STOCKFISH-LICENSE.txt`).
- [chess.js](https://github.com/jhlywa/chess.js), BSD-2-Clause.
- Chess pieces by Colin M.L. Burnett (cburnett), GPLv2+, via lichess.
- Icons: [Phosphor Icons](https://phosphoricons.com/), MIT.

Because Stockfish is GPLv3, this project is distributed under GPLv3 as well.
