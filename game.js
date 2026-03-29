// ============================================================
//  Spider Solitaire – Pure JS (no dependencies)
// ============================================================

const RANKS = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
const SUIT_SYM = { spades: '♠', hearts: '♥', diamonds: '♦', clubs: '♣' };

// ========================  Game Logic  ========================

class SpiderSolitaire {
  constructor(numSuits = 1) {
    this.numSuits = numSuits;
    this.reset();
  }

  reset() {
    this.tableau  = Array.from({ length: 10 }, () => []);
    this.stock    = [];
    this.completed = 0;
    this.score     = 500;
    this.moveCount = 0;
    this.history   = [];
    this.gameWon   = false;

    const deck = this._buildDeck();
    this._shuffle(deck);
    this._deal(deck);
  }

  // --- deck helpers ---

  _buildDeck() {
    const suitsArr = this._suitSets();
    const deck = [];
    for (const suit of suitsArr) {
      for (let rank = 1; rank <= 13; rank++) {
        deck.push({ suit, rank, faceUp: false });
      }
    }
    return deck;
  }

  _suitSets() {
    if (this.numSuits === 1) return Array(8).fill('spades');
    if (this.numSuits === 2) return [...Array(4).fill('spades'), ...Array(4).fill('hearts')];
    return ['spades','spades','hearts','hearts','diamonds','diamonds','clubs','clubs'];
  }

  _shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  }

  _deal(deck) {
    let idx = 0;
    for (let col = 0; col < 10; col++) {
      const n = col < 4 ? 6 : 5;
      for (let i = 0; i < n; i++) {
        const c = { ...deck[idx++] };
        c.faceUp = i === n - 1;
        this.tableau[col].push(c);
      }
    }
    this.stock = deck.slice(idx).map(c => ({ ...c }));
  }

  // --- queries ---

  canPickUp(col, idx) {
    const pile = this.tableau[col];
    if (idx < 0 || idx >= pile.length) return false;
    if (!pile[idx].faceUp) return false;
    for (let i = idx; i < pile.length - 1; i++) {
      if (pile[i].suit !== pile[i + 1].suit) return false;
      if (pile[i].rank !== pile[i + 1].rank + 1) return false;
    }
    return true;
  }

  canPlace(card, destCol) {
    const pile = this.tableau[destCol];
    if (pile.length === 0) return true;
    return pile[pile.length - 1].rank === card.rank + 1;
  }

  canDealStock() {
    return this.stock.length > 0 && this.tableau.every(c => c.length > 0);
  }

  stockDealsLeft() {
    return Math.ceil(this.stock.length / 10);
  }

  // --- mutations ---

  moveCards(srcCol, cardIdx, destCol) {
    if (srcCol === destCol) return false;
    if (!this.canPickUp(srcCol, cardIdx)) return false;
    if (!this.canPlace(this.tableau[srcCol][cardIdx], destCol)) return false;

    this._saveState();

    const cards = this.tableau[srcCol].splice(cardIdx);
    this.tableau[destCol].push(...cards);
    this._flipTop(srcCol);
    this.moveCount++;
    this.score = Math.max(0, this.score - 1);

    const completedDest = this._checkComplete(destCol);
    const completedSrc  = this._checkComplete(srcCol);
    this._checkWin();
    return { completed: completedDest || completedSrc };
  }

  dealStock() {
    if (!this.canDealStock()) return false;
    this._saveState();
    for (let col = 0; col < 10; col++) {
      const c = this.stock.pop();
      c.faceUp = true;
      this.tableau[col].push(c);
    }
    this.moveCount++;
    this.score = Math.max(0, this.score - 1);

    const completions = [];
    for (let col = 0; col < 10; col++) {
      if (this._checkComplete(col)) completions.push(col);
    }
    this._checkWin();
    return completions;
  }

  undo() {
    if (this.history.length === 0) return false;
    const s = this.history.pop();
    this.tableau  = s.tableau;
    this.stock    = s.stock;
    this.completed = s.completed;
    this.score     = s.score;
    this.moveCount = s.moveCount;
    this.gameWon   = false;
    return true;
  }

  // --- hint: returns { srcCol, cardIdx, destCol } or null ---

  getHint() {
    let best = null;
    let bestScore = -Infinity;

    for (let src = 0; src < 10; src++) {
      const pile = this.tableau[src];
      for (let idx = pile.length - 1; idx >= 0; idx--) {
        if (!this.canPickUp(src, idx)) break;
        const card = pile[idx];
        for (let dest = 0; dest < 10; dest++) {
          if (dest === src) continue;
          if (!this.canPlace(card, dest)) continue;

          let score = 0;
          const destPile = this.tableau[dest];
          if (destPile.length === 0) {
            // Moving to empty column – only good if we expose a face-down card
            if (idx > 0 && !pile[idx - 1].faceUp) score = 1;
            else score = -5;
          } else {
            const destTop = destPile[destPile.length - 1];
            // Same suit continuation is great
            if (destTop.suit === card.suit) score = 10;
            else score = 2;
            // Exposing face-down card is valuable
            if (idx > 0 && !pile[idx - 1].faceUp) score += 5;
          }

          // Check if this move would complete a sequence
          const mergedLen = (destPile.length + (pile.length - idx));
          if (mergedLen >= 13) {
            const merged = [...destPile, ...pile.slice(idx)];
            if (this._wouldComplete(merged)) score += 100;
          }

          if (score > bestScore) {
            bestScore = score;
            best = { srcCol: src, cardIdx: idx, destCol: dest };
          }
        }
      }
    }
    return best;
  }

  // --- internal ---

  _flipTop(col) {
    const pile = this.tableau[col];
    if (pile.length > 0 && !pile[pile.length - 1].faceUp) {
      pile[pile.length - 1].faceUp = true;
    }
  }

  _checkComplete(col) {
    let found = false;
    // Loop to catch stacked completed sequences
    while (true) {
      const pile = this.tableau[col];
      if (pile.length < 13) break;
      const start = pile.length - 13;
      const suit = pile[start].suit;
      if (pile[start].rank !== 13) break;
      let valid = true;
      for (let i = 0; i < 13; i++) {
        if (pile[start + i].rank !== 13 - i || pile[start + i].suit !== suit || !pile[start + i].faceUp) {
          valid = false;
          break;
        }
      }
      if (!valid) break;
      this.tableau[col] = pile.slice(0, start);
      this.completed++;
      this.score += 100;
      this._flipTop(col);
      found = true;
    }
    return found;
  }

  _wouldComplete(pile) {
    if (pile.length < 13) return false;
    const start = pile.length - 13;
    const suit = pile[start].suit;
    if (pile[start].rank !== 13) return false;
    for (let i = 0; i < 13; i++) {
      if (pile[start + i].rank !== 13 - i) return false;
      if (pile[start + i].suit !== suit) return false;
    }
    return true;
  }

  _checkWin() {
    if (this.completed >= 8) this.gameWon = true;
  }

  _saveState() {
    this.history.push({
      tableau:   this.tableau.map(c => c.map(card => ({ ...card }))),
      stock:     this.stock.map(c => ({ ...c })),
      completed: this.completed,
      score:     this.score,
      moveCount: this.moveCount,
    });
    // Limit history to prevent memory issues
    if (this.history.length > 200) this.history.splice(0, 50);
  }
}

// ========================  UI / Renderer  ========================

class GameUI {
  constructor() {
    this.game = null;
    this.numSuits = 1;
    this.dragState = null;
    this.selection = null;   // { col, cardIdx }
    this.hintTimeout = null;
    this.timerInterval = null;
    this.timerStartTime = null;

    this._onPointerMove = this._onPointerMove.bind(this);
    this._onPointerUp   = this._onPointerUp.bind(this);

    this._setupControls();
    this.newGame(1);
  }

  // ---- controls ----

  _setupControls() {
    document.getElementById('new-game-btn').addEventListener('click', () => this.newGame(this.numSuits));
    document.getElementById('undo-btn').addEventListener('click', () => this._undo());
    document.getElementById('hint-btn').addEventListener('click', () => this._showHint());
    document.getElementById('play-again-btn').addEventListener('click', () => {
      document.getElementById('win-overlay').classList.add('hidden');
      this.newGame(this.numSuits);
    });
    document.getElementById('stock-area').addEventListener('click', () => this._dealStock());

    // Event delegation for column clicks (handles empty-column drops)
    document.getElementById('tableau').addEventListener('click', (e) => {
      const colEl = e.target.closest('.column');
      if (!colEl) return;
      // Only handle clicks on the column itself (not on cards)
      if (e.target !== colEl) return;
      if (!this.selection) return;
      const colIdx = parseInt(colEl.id.replace('col-', ''));
      this._moveSelection(colIdx);
    });

    document.querySelectorAll('.suit-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const n = parseInt(btn.dataset.suits);
        document.querySelectorAll('.suit-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.numSuits = n;
        this.newGame(n);
      });
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if (e.key === 'z' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); this._undo(); }
      if (e.key === 'h' || e.key === 'H') this._showHint();
      if (e.key === 'n' || e.key === 'N') this.newGame(this.numSuits);
      if (e.key === 'Escape') this._clearSelection();
    });
  }

  newGame(numSuits) {
    this.numSuits = numSuits;
    this.game = new SpiderSolitaire(numSuits);
    this.selection = null;
    this.dragState = null;
    this._clearHint();
    this._resetTimer();
    this.render();
  }

  // ---- timer ----

  _resetTimer() {
    this._stopTimer();
    this.timerStartTime = null;
    this._renderTimer();
  }

  _startTimer() {
    if (this.timerStartTime) return;
    this.timerStartTime = Date.now();
    this.timerInterval = setInterval(() => this._renderTimer(), 1000);
  }

  _stopTimer() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  _getElapsed() {
    if (!this.timerStartTime) return 0;
    return Math.floor((Date.now() - this.timerStartTime) / 1000);
  }

  _renderTimer() {
    const total = this._getElapsed();
    const mins = Math.floor(total / 60);
    const secs = total % 60;
    document.getElementById('timer-display').textContent =
      `Time: ${mins}:${secs.toString().padStart(2, '0')}`;
  }

  _formatTime() {
    const total = this._getElapsed();
    const mins = Math.floor(total / 60);
    const secs = total % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  // ---- rendering ----

  render() {
    this._renderTableau();
    this._renderStock();
    this._renderCompleted();
    this._renderStats();
  }

  _renderTableau() {
    const styles = getComputedStyle(document.documentElement);
    const fuOverlap = parseInt(styles.getPropertyValue('--fu-overlap'));
    const fdOverlap = parseInt(styles.getPropertyValue('--fd-overlap'));
    const cardH     = parseInt(styles.getPropertyValue('--card-height'));

    for (let col = 0; col < 10; col++) {
      const colEl = document.getElementById(`col-${col}`);
      colEl.innerHTML = '';
      const pile = this.game.tableau[col];

      colEl.classList.toggle('empty-col', pile.length === 0);

      let top = 0;
      pile.forEach((card, idx) => {
        const el = this._createCardEl(card, col, idx);
        el.style.top = top + 'px';
        el.style.zIndex = idx + 1;
        colEl.appendChild(el);
        top += card.faceUp ? fuOverlap : fdOverlap;
      });

      colEl.style.height = (top + cardH) + 'px';
    }
  }

  _createCardEl(card, colIdx, cardIdx) {
    const el = document.createElement('div');
    const classes = ['card'];
    if (card.faceUp) {
      classes.push('face-up', card.suit);
    } else {
      classes.push('face-down');
    }
    // Check if this card is selected
    if (this.selection && this.selection.col === colIdx && cardIdx >= this.selection.cardIdx) {
      classes.push('selected');
    }
    el.className = classes.join(' ');
    el.dataset.col = colIdx;
    el.dataset.idx = cardIdx;

    if (card.faceUp) {
      const r = RANKS[card.rank - 1];
      const s = SUIT_SYM[card.suit];
      el.innerHTML =
        `<span class="card-corner top-left">${r}<br>${s}</span>` +
        `<span class="card-center">${s}</span>` +
        `<span class="card-corner bottom-right">${r}<br>${s}</span>`;

      el.addEventListener('pointerdown', (e) => this._onPointerDown(e, colIdx, cardIdx));
    }
    return el;
  }

  _renderStock() {
    const area = document.getElementById('stock-area');
    area.innerHTML = '';
    const deals = this.game.stockDealsLeft();
    if (deals === 0) {
      const empty = document.createElement('div');
      empty.className = 'stock-empty';
      area.appendChild(empty);
    } else {
      for (let i = 0; i < deals; i++) {
        const pile = document.createElement('div');
        pile.className = 'stock-pile';
        area.appendChild(pile);
      }
    }
  }

  _renderCompleted() {
    const area = document.getElementById('completed-area');
    area.innerHTML = '';
    for (let i = 0; i < this.game.completed; i++) {
      const pile = document.createElement('div');
      pile.className = 'completed-pile';
      pile.textContent = '♠';
      area.appendChild(pile);
    }
  }

  _renderStats() {
    document.getElementById('score-display').textContent = `Score: ${this.game.score}`;
    document.getElementById('moves-display').textContent = `Moves: ${this.game.moveCount}`;
    this._renderTimer();
  }

  // ---- pointer / drag & drop ----

  _onPointerDown(e, colIdx, cardIdx) {
    // Ignore right-click
    if (e.button && e.button !== 0) return;
    if (!this.game.canPickUp(colIdx, cardIdx)) return;

    e.preventDefault();
    this._clearHint();

    // Record start position to distinguish click from drag
    const startX = e.clientX;
    const startY = e.clientY;
    this._pointerStart = { x: startX, y: startY, col: colIdx, idx: cardIdx, moved: false };

    document.addEventListener('pointermove', this._onPointerMove);
    document.addEventListener('pointerup', this._onPointerUp);
  }

  _onPointerMove(e) {
    const ps = this._pointerStart;
    if (!ps) return;

    const dx = e.clientX - ps.x;
    const dy = e.clientY - ps.y;

    // Start drag if moved more than 5px
    if (!ps.moved && (Math.abs(dx) > 5 || Math.abs(dy) > 5)) {
      ps.moved = true;
      this._startDrag(ps.col, ps.idx, ps.x, ps.y);
    }

    if (this.dragState) {
      const ghost = this.dragState.ghost;
      ghost.style.left = (e.clientX - this.dragState.offsetX) + 'px';
      ghost.style.top  = (e.clientY - this.dragState.offsetY) + 'px';

      // Highlight target column
      const target = this._hitTestColumn(e.clientX, e.clientY);
      document.querySelectorAll('.column').forEach((c, i) => {
        c.classList.toggle('drop-target', i === target && target !== this.dragState.srcCol);
      });
    }
  }

  _onPointerUp(e) {
    document.removeEventListener('pointermove', this._onPointerMove);
    document.removeEventListener('pointerup', this._onPointerUp);

    const ps = this._pointerStart;
    this._pointerStart = null;

    if (!ps) return;

    if (this.dragState) {
      // End drag – attempt move
      const target = this._hitTestColumn(e.clientX, e.clientY);
      document.querySelectorAll('.column').forEach(c => c.classList.remove('drop-target'));
      this._endDrag(target);
    } else {
      // It was a click – use selection model
      this._handleClick(ps.col, ps.idx);
    }
  }

  _startDrag(colIdx, cardIdx, startX, startY) {
    this._clearSelection();

    const pile = this.game.tableau[colIdx];
    const cards = pile.slice(cardIdx);

    // Get position of the source card element
    const srcEl = document.querySelector(`#col-${colIdx} .card[data-idx="${cardIdx}"]`);
    const rect = srcEl.getBoundingClientRect();

    // Create ghost
    const ghost = document.createElement('div');
    ghost.id = 'drag-ghost';

    cards.forEach((card) => {
      const cardEl = document.createElement('div');
      cardEl.className = `card face-up ${card.suit}`;
      const r = RANKS[card.rank - 1];
      const s = SUIT_SYM[card.suit];
      cardEl.innerHTML =
        `<span class="card-corner top-left">${r}<br>${s}</span>` +
        `<span class="card-center">${s}</span>` +
        `<span class="card-corner bottom-right">${r}<br>${s}</span>`;
      ghost.appendChild(cardEl);
    });

    ghost.style.left = rect.left + 'px';
    ghost.style.top  = rect.top + 'px';
    document.body.appendChild(ghost);

    // Dim source cards
    for (let i = cardIdx; i < pile.length; i++) {
      const el = document.querySelector(`#col-${colIdx} .card[data-idx="${i}"]`);
      if (el) el.classList.add('drag-source');
    }

    this.dragState = {
      srcCol: colIdx,
      cardIdx: cardIdx,
      ghost: ghost,
      offsetX: startX - rect.left,
      offsetY: startY - rect.top,
    };
  }

  _endDrag(targetCol) {
    const ds = this.dragState;
    if (!ds) return;

    // Remove ghost
    if (ds.ghost && ds.ghost.parentNode) {
      ds.ghost.parentNode.removeChild(ds.ghost);
    }
    this.dragState = null;

    if (targetCol >= 0 && targetCol !== ds.srcCol) {
      const result = this.game.moveCards(ds.srcCol, ds.cardIdx, targetCol);
      if (result) {
        this._startTimer();
        this.render();
        if (this.game.gameWon) this._showWin();
        return;
      }
    }
    // Invalid or no target – snap back
    this.render();
  }

  _hitTestColumn(clientX, clientY) {
    // Allow drops anywhere vertically within the tableau region
    const tableau = document.getElementById('tableau');
    const tRect = tableau.getBoundingClientRect();
    if (clientY < tRect.top - 20) return -1;

    for (let i = 0; i < 10; i++) {
      const el = document.getElementById(`col-${i}`);
      const rect = el.getBoundingClientRect();
      if (clientX >= rect.left && clientX <= rect.right) {
        return i;
      }
    }
    return -1;
  }

  // ---- click / selection model ----

  _handleClick(colIdx, cardIdx) {
    if (this.selection) {
      if (this.selection.col === colIdx && this.selection.cardIdx === cardIdx) {
        // Deselect
        this._clearSelection();
        this.render();
        return;
      }
      // Attempt to move selection to clicked column
      this._moveSelection(colIdx);
    } else {
      // Select
      if (this.game.canPickUp(colIdx, cardIdx)) {
        this.selection = { col: colIdx, cardIdx: cardIdx };
        this.render();
      }
    }
  }

  _moveSelection(destCol) {
    if (!this.selection) return;
    const { col, cardIdx } = this.selection;
    const result = this.game.moveCards(col, cardIdx, destCol);
    if (result) this._startTimer();
    this._clearSelection();
    this.render();
    if (result && this.game.gameWon) this._showWin();
  }

  _clearSelection() {
    this.selection = null;
  }

  // ---- stock ----

  _dealStock() {
    if (!this.game.canDealStock()) {
      if (this.game.stock.length === 0) {
        this._toast('No cards left in the stock pile.');
      } else {
        this._toast('All columns must have at least one card before dealing.', 'error');
      }
      return;
    }
    this._startTimer();
    this.game.dealStock();
    this.render();
    if (this.game.gameWon) this._showWin();
  }

  // ---- undo ----

  _undo() {
    if (this.game.undo()) {
      this._clearSelection();
      this.render();
    } else {
      this._toast('Nothing to undo.');
    }
  }

  // ---- hint ----

  _showHint() {
    this._clearHint();
    const hint = this.game.getHint();
    if (!hint) {
      if (this.game.canDealStock()) {
        this._toast('No moves available – try dealing from the stock pile.');
      } else {
        this._toast('No moves available!');
      }
      return;
    }

    // Highlight source cards
    const srcPile = this.game.tableau[hint.srcCol];
    for (let i = hint.cardIdx; i < srcPile.length; i++) {
      const el = document.querySelector(`#col-${hint.srcCol} .card[data-idx="${i}"]`);
      if (el) el.classList.add('hint-source');
    }

    // Highlight destination (top card or column)
    const destPile = this.game.tableau[hint.destCol];
    if (destPile.length > 0) {
      const el = document.querySelector(`#col-${hint.destCol} .card[data-idx="${destPile.length - 1}"]`);
      if (el) el.classList.add('hint-dest');
    } else {
      document.getElementById(`col-${hint.destCol}`).classList.add('drop-target');
    }

    this.hintTimeout = setTimeout(() => this._clearHint(), 3000);
  }

  _clearHint() {
    if (this.hintTimeout) { clearTimeout(this.hintTimeout); this.hintTimeout = null; }
    document.querySelectorAll('.hint-source, .hint-dest').forEach(el => {
      el.classList.remove('hint-source', 'hint-dest');
    });
    document.querySelectorAll('.drop-target').forEach(el => el.classList.remove('drop-target'));
  }

  // ---- win ----

  _showWin() {
    this._stopTimer();
    const overlay = document.getElementById('win-overlay');
    document.getElementById('win-stats').textContent =
      `Score: ${this.game.score}  •  Moves: ${this.game.moveCount}`;
    document.getElementById('win-time').textContent = `⏱ ${this._formatTime()}`;
    overlay.classList.remove('hidden');
  }

  // ---- toast ----

  _toast(msg, type) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.className = type || '';
    // Force reflow for animation restart
    el.style.animation = 'none';
    el.offsetHeight; // trigger reflow
    el.style.animation = '';
    setTimeout(() => { el.classList.add('hidden'); }, 2500);
  }
}

// ========================  Init  ========================

document.addEventListener('DOMContentLoaded', () => {
  window.gameUI = new GameUI();
});
