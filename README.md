# 🕷️ Spider Solitaire

A classic Spider Solitaire card game playable directly in your browser — no install needed.

**[▶ Play Now](https://jaredegolf.github.io/spyder/)**

## Features

- **Four difficulty levels** — 1 suit (beginner), 2 suits (intermediate), 3 suits (advanced), 4 suits (expert)
- **Guaranteed solvable deals** — 1-suit, 2-suit, and 3-suit games are drawn from a curated library of pre-verified seeds, so every deal you're given has a known winning solution
- **Shareable seeds** — the seed number is shown in the header; click it to copy a link-friendly ID so you can replay or share any specific deal
- **Drag & drop** — click or drag cards to move them
- **Undo** — unlimited undo (Ctrl+Z)
- **Hints** — press H or click 💡 for a suggested move
- **Responsive** — works on desktop, tablet, and mobile
- **No dependencies** — pure HTML, CSS, and JavaScript

## How to Play

1. Build descending sequences of cards (King → Ace) of the **same suit**
2. Complete sequences are automatically removed from the tableau
3. Any card can be placed on a card one rank higher (regardless of suit)
4. Only **same-suit** descending runs can be moved as a group
5. Deal from the stock pile when stuck (all columns must have at least one card)
6. Win by completing all 8 suit sequences!

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `N` | New game |
| `H` | Show hint |
| `Ctrl+Z` | Undo |
| `Esc` | Deselect |

## Deploy with GitHub Pages

1. Push this repo to GitHub
2. Go to **Settings → Pages**
3. Set source to **Deploy from a branch** → `main` / `/ (root)`
4. Your game will be live at `https://<username>.github.io/spyder/`

## Seed Library

1-suit, 2-suit, and 3-suit deals are drawn from a curated list of pre-verified seeds stored in `VERIFIED_SEEDS` inside `game.js`. Every seed in the list has been confirmed solvable by an offline beam-search solver before being committed.

To grow the library, trigger one of the manual GitHub Actions workflows:

| Workflow | Default count | Notes |
|---|---|---|
| **Verify Seeds – 1 Suit** | 50 | Completes in < 1 minute |
| **Verify Seeds – 2 Suit** | 50 | ~15–20 minutes |
| **Verify Seeds – 3 Suit** | 50 | ~30–60 minutes |
| **Verify Seeds – 4 Suit** | 20 | Up to 4 hours; hard to verify |

Each run automatically continues from where the last one left off and merges new seeds into `game.js` via a commit. You can also run the tool locally:

```bash
node tools/verify-seeds.js --suits 2 --count 50 --start 0 --output seeds.json
node tools/patch-seeds.js  --suits 2 --seeds seeds.json --merge
```

## License

MIT
