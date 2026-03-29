# Copilot Instructions

## Architecture

This is a zero-dependency Spider Solitaire game using vanilla HTML, CSS, and JavaScript. There is no build system, bundler, or package manager — edit files and open `index.html` directly.

All game code lives in `game.js`, split into two classes:

- **`SpiderSolitaire`** — Pure game logic (no DOM access). Manages the tableau (10 columns), stock pile, completed sequences, score, move count, and undo history. All state mutations go through public methods (`moveCards`, `dealStock`, `undo`).
- **`GameUI`** — Rendering and user interaction. Owns the `SpiderSolitaire` instance. Handles pointer events for both click-to-select and drag-and-drop, keyboard shortcuts, hints, and toast messages.

These two classes must stay separated: game logic should never touch the DOM, and UI code should use `SpiderSolitaire`'s public API for all state changes.

## Key Conventions

- **Card model**: `{ suit: string, rank: number, faceUp: boolean }` — `rank` is 1 (Ace) through 13 (King), `suit` is one of `'spades'`, `'hearts'`, `'diamonds'`, `'clubs'`.
- **Full re-render**: The UI calls `this.render()` after every state change, rebuilding all tableau DOM elements. There is no incremental/diff-based update.
- **Undo via snapshots**: `_saveState()` deep-copies the entire game state before each mutation. History is capped at 200 entries.
- **CSS custom properties**: Card dimensions (`--card-width`, `--card-height`), overlap values (`--fd-overlap`, `--fu-overlap`), and border radius are defined as CSS variables in `:root` and overridden in `@media` breakpoints for responsive sizing.
- **Pointer events**: Both click (selection model) and drag-and-drop use `pointerdown`/`pointermove`/`pointerup` — a move threshold of 5px distinguishes clicks from drags.

## Deployment

Static site deployed via GitHub Pages from the `main` branch root. No build step required.
