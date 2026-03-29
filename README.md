# 🕷️ Spider Solitaire

A classic Spider Solitaire card game playable directly in your browser — no install needed.

**[▶ Play Now](https://jared.github.io/spyder_solitaire/)** *(update URL after enabling GitHub Pages)*

## Features

- **Three difficulty levels** — 1 suit (beginner), 2 suits (intermediate), 4 suits (expert)
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
4. Your game will be live at `https://<username>.github.io/spyder_solitaire/`

## License

MIT
