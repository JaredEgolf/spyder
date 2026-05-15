#!/usr/bin/env node
/**
 * verify-seeds.js  –  Find verified-solvable seeds for Spider Solitaire.
 *
 * Uses greedy heuristic trials with fast integer-hash cycle detection.
 * A seed is "verified" only when a trial finds all 8 completed sequences.
 *
 * Usage:
 *   node tools/verify-seeds.js --suits <1|2|4> --count <N> [--start <seed>] [--output <file>]
 *
 * Options:
 *   --suits   Number of suits (1, 2, or 4)  default: 1
 *   --count   Verified seeds to collect      default: 100
 *   --start   First seed to try              default: 0
 *   --output  Write JSON array to this file  default: stdout
 *   --trials  Trials per seed                default: 30
 *   --steps   Max steps per trial            default: 1500
 *
 * Example:
 *   node tools/verify-seeds.js --suits 1 --count 200 --start 0 --output seeds-1suit.json
 */

'use strict';

const fs = require('fs');

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);
function getArg(name, def) {
  const i = args.indexOf('--' + name);
  return i >= 0 ? args[i + 1] : def;
}
const NUM_SUITS  = parseInt(getArg('suits',  '1'));
const TARGET     = parseInt(getArg('count',  '100'));
const START_SEED = parseInt(getArg('start',  '0'));
const N_TRIALS   = parseInt(getArg('trials', '30'));
const MAX_STEPS  = parseInt(getArg('steps',  '1500'));
const OUTPUT     = getArg('output', null);

if (![1, 2, 4].includes(NUM_SUITS)) {
  console.error('--suits must be 1, 2, or 4');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// PRNG – must match game.js mulberry32 exactly
// ---------------------------------------------------------------------------
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Deck / deal – mirrors SpiderSolitaire logic in game.js exactly
// ---------------------------------------------------------------------------
function suitSets(numSuits) {
  if (numSuits === 1) return Array(8).fill('spades');
  if (numSuits === 2) return [...Array(4).fill('spades'), ...Array(4).fill('hearts')];
  return ['spades','spades','hearts','hearts','diamonds','diamonds','clubs','clubs'];
}

function buildDeck(numSuits) {
  const deck = [];
  for (const suit of suitSets(numSuits))
    for (let rank = 1; rank <= 13; rank++)
      deck.push({ suit, rank });
  return deck;
}

function shuffle(arr, rand) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

function dealDeck(deck) {
  const tableau = Array.from({ length: 10 }, () => []);
  let idx = 0;
  for (let col = 0; col < 10; col++) {
    const n = col < 4 ? 6 : 5;
    for (let i = 0; i < n; i++)
      tableau[col].push({ suit: deck[idx].suit, rank: deck[idx++].rank, faceUp: i === n - 1 });
  }
  const stock = [];
  for (; idx < deck.length; idx++)
    stock.push({ suit: deck[idx].suit, rank: deck[idx].rank, faceUp: false });
  return { tableau, stock };
}

function makeDeal(numSuits, seed) {
  const rand = mulberry32(seed);
  const deck = buildDeck(numSuits);
  shuffle(deck, rand);
  return dealDeck(deck);
}

// ---------------------------------------------------------------------------
// Fast integer hash of current state (for cycle detection)
// Uses Zobrist-style hashing – fast, small, acceptable collision rate
// ---------------------------------------------------------------------------
// Map each (suit, rank, faceUp, col, position) to a precomputed random int
const SUIT_IDX = { spades: 0, hearts: 1, diamonds: 2, clubs: 3 };
// Precompute random values for each card slot
const RAND_TABLE = new Int32Array(10 * 60 * 4 * 13 * 2); // [col][pos][suit][rank][faceUp]
{
  const r = mulberry32(0xCAFEBABE);
  for (let i = 0; i < RAND_TABLE.length; i++) RAND_TABLE[i] = (r() * 0xFFFFFFFF) | 0;
}

function stateHash(tableau, stockLen, completed) {
  let h = (completed * 1000003 + stockLen * 999983) | 0;
  for (let col = 0; col < 10; col++) {
    const pile = tableau[col];
    for (let pos = 0; pos < pile.length; pos++) {
      const c = pile[pos];
      const si = SUIT_IDX[c.suit];
      const ri = c.rank - 1;
      const fi = c.faceUp ? 1 : 0;
      const base = ((col * 60 + pos) * 4 + si) * 13 * 2 + ri * 2 + fi;
      h ^= RAND_TABLE[Math.min(base, RAND_TABLE.length - 1)];
    }
  }
  return h;
}

// ---------------------------------------------------------------------------
// Game helpers (mutating)
// ---------------------------------------------------------------------------
function flipTop(col) {
  if (col.length > 0 && !col[col.length - 1].faceUp)
    col[col.length - 1].faceUp = true;
}

function drainComplete(tableau, col) {
  let found = 0;
  while (true) {
    const p = tableau[col];
    if (p.length < 13) break;
    const start = p.length - 13;
    if (p[start].rank !== 13) break;
    const suit = p[start].suit;
    let ok = true;
    for (let i = 0; i < 13; i++) {
      if (p[start + i].rank !== 13 - i || p[start + i].suit !== suit || !p[start + i].faceUp) {
        ok = false; break;
      }
    }
    if (!ok) break;
    tableau[col] = p.slice(0, start);
    found++;
    flipTop(tableau[col]);
  }
  return found;
}

function canPickUp(pile, idx) {
  if (idx < 0 || idx >= pile.length || !pile[idx].faceUp) return false;
  for (let i = idx; i < pile.length - 1; i++) {
    if (pile[i].suit !== pile[i + 1].suit) return false;
    if (pile[i].rank !== pile[i + 1].rank + 1) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Move scoring – higher = try first
// ---------------------------------------------------------------------------
function wouldComplete(srcSlice, destPile) {
  const len = destPile.length + srcSlice.length;
  if (len < 13) return false;
  const s = len - 13 - destPile.length; // start in srcSlice
  const startRank = (s >= 0) ? srcSlice[s].rank : destPile[destPile.length - 13 + srcSlice.length].rank;
  // Full check via concat
  const merged = destPile.concat(srcSlice);
  const ms = merged.length - 13;
  if (merged[ms].rank !== 13) return false;
  const suit = merged[ms].suit;
  for (let i = 0; i < 13; i++)
    if (merged[ms + i].rank !== 13 - i || merged[ms + i].suit !== suit) return false;
  return true;
}

function scoreMove(tableau, src, idx, dest, noiseRng) {
  const srcPile  = tableau[src];
  const destPile = tableau[dest];
  const card     = srcPile[idx];
  const seqLen   = srcPile.length - idx;

  // True when moving this sequence directly uncovers a face-down card
  const exposesHidden = idx > 0 && !srcPile[idx - 1].faceUp;

  // True when there are face-down cards buried beneath face-up cards in this
  // column — moving a single card off the top reduces blocking depth even if
  // the immediately-below card is still face-up.
  const reducesBlocking = !exposesHidden && idx > 0 &&
    srcPile.slice(0, idx).some(c => !c.faceUp);

  // Sequence completion: absolute priority
  if (wouldComplete(srcPile.slice(idx), destPile)) return 1000000;

  const noise = noiseRng ? Math.floor(noiseRng() * 4000) : 0;

  if (destPile.length === 0) {
    if (exposesHidden)   return  9000 + noise;
    if (reducesBlocking) return  2000 + noise; // useful temp storage
    return -2000 + noise; // mildly discourage empty-column clutter
  }

  const destTop = destPile[destPile.length - 1];
  let score = (destTop.suit === card.suit) ? 5000 : 1000;
  if (exposesHidden)    score += 10000;
  else if (reducesBlocking) score += 6000; // prioritise unblocking over suit-matching
  score += seqLen * 50;
  return score + noise;
}

function getMoves(tableau, stock, noiseRng) {
  const moves = [];
  for (let src = 0; src < 10; src++) {
    const pile = tableau[src];
    for (let idx = pile.length - 1; idx >= 0; idx--) {
      if (!canPickUp(pile, idx)) break;
      for (let dest = 0; dest < 10; dest++) {
        if (dest === src) continue;
        const d = tableau[dest];
        if (d.length > 0 && d[d.length - 1].rank !== pile[idx].rank + 1) continue;
        moves.push({ src, idx, dest, score: scoreMove(tableau, src, idx, dest, noiseRng) });
      }
    }
  }
  if (stock.length > 0 && tableau.every(c => c.length > 0))
    moves.push({ src: -1, idx: -1, dest: -1, score: 100 + (noiseRng ? Math.floor(noiseRng() * 500) : 0) });
  moves.sort((a, b) => b.score - a.score);
  return moves;
}

function applyMove(tableau, stock, move) {
  if (move.src === -1) {
    for (let col = 0; col < 10; col++) {
      const c = stock.pop();
      c.faceUp = true;
      tableau[col].push(c);
    }
    let comp = 0;
    for (let col = 0; col < 10; col++) comp += drainComplete(tableau, col);
    return comp;
  } else {
    const cards = tableau[move.src].splice(move.idx);
    tableau[move.dest].push(...cards);
    flipTop(tableau[move.src]);
    return drainComplete(tableau, move.dest);
  }
}

function cloneState(tableau, stock) {
  return {
    tableau: tableau.map(col => col.map(c => ({ suit: c.suit, rank: c.rank, faceUp: c.faceUp }))),
    stock:   stock.map(c => ({ suit: c.suit, rank: c.rank, faceUp: c.faceUp })),
  };
}

// ---------------------------------------------------------------------------
// State evaluation for beam search
// ---------------------------------------------------------------------------
function evaluateState(tableau, completed, numSuits) {
  let score = completed * 100000;
  let totalFD = 0;
  let emptyCount = 0;
  let sameSuitAdj = 0;
  let mixedOverFD = 0;

  // For each column measure the longest face-up same-suit descending run
  // starting from the top (the "sequence tail"). Longer runs score quadratically
  // because they represent direct progress toward a K-A completion.
  let suitRunScore = 0;

  for (const col of tableau) {
    if (col.length === 0) { emptyCount++; continue; }

    const fdInCol = col.filter(c => !c.faceUp).length;
    totalFD += fdInCol;

    // Walk face-up cards from top of column, tracking current run
    let runLen = 0, runSuit = null, runRank = null;
    for (let i = col.length - 1; i >= 0; i--) {
      const c = col[i];
      if (!c.faceUp) break;
      if (runSuit === null) {
        runLen = 1; runSuit = c.suit; runRank = c.rank;
      } else if (c.suit === runSuit && c.rank === runRank + 1) {
        runLen++; runRank = c.rank;
      } else {
        // Suit break or rank gap — count this adjacency as a same-suit adj pair
        // if the cards are directly adjacent in the same suit (regardless of position)
        if (col[i].suit === col[i + 1].suit && col[i].rank === col[i + 1].rank + 1)
          sameSuitAdj++;
        runLen = 1; runSuit = c.suit; runRank = c.rank;
      }
    }
    // Quadratic reward for run length (2→4, 5→25, 10→100, 13→169)
    suitRunScore += runLen * runLen;

    // Penalise suit breaks in the face-up prefix above face-down cards
    if (fdInCol > 0) {
      const fuStart = col.findIndex(c => c.faceUp);
      if (fuStart >= 0) {
        for (let i = fuStart; i < col.length - 1; i++) {
          if (col[i].suit !== col[i + 1].suit) mixedOverFD++;
        }
      }
    }
  }

  score -= totalFD * 3000;
  score += emptyCount * 2000;
  score += sameSuitAdj * 200;
  score += suitRunScore * 300;   // key driver for multi-suit: build long runs
  score -= mixedOverFD * 200;
  return score;
}

// ---------------------------------------------------------------------------
// Beam search solver — used for 2-suit and 4-suit
// ---------------------------------------------------------------------------
function beamSolve(numSuits, seed) {
  const BEAM_WIDTH = numSuits === 2 ? 1200 : 2000;
  const MAX_NODES  = numSuits === 2 ? 5000000 : 8000000;

  // Fixed-size open-addressing hash table — avoids Map's memory overhead.
  // Each slot stores { key: Int32, val: Int32 }.  Collisions just mean we
  // re-explore some states (correctness preserved, slight extra work).
  const TABLE_BITS = 20;           // 2^20 = 1,048,576 slots ≈ 8 MB per worker
  const TABLE_SIZE = 1 << TABLE_BITS;
  const TABLE_MASK = TABLE_SIZE - 1;
  const tblKeys = new Int32Array(TABLE_SIZE);  // 0 = empty sentinel
  const tblVals = new Int32Array(TABLE_SIZE);

  function tblGet(h) {
    const slot = (h >>> 0) & TABLE_MASK;
    return tblKeys[slot] === h ? tblVals[slot] : undefined;
  }
  function tblSet(h, v) {
    const slot = (h >>> 0) & TABLE_MASK;
    tblKeys[slot] = h;
    tblVals[slot] = v;
  }

  const { tableau: t0, stock: s0 } = makeDeal(numSuits, seed);
  let beam = [{ tableau: t0, stock: s0, completed: 0,
                score: evaluateState(t0, 0, numSuits) }];

  tblSet(stateHash(t0, s0.length, 0), beam[0].score);

  let totalNodes = 0;

  for (let gen = 0; gen < 2000 && beam.length > 0 && totalNodes < MAX_NODES; gen++) {
    const next = [];

    for (const state of beam) {
      if (state.completed >= 8) return true;

      for (const move of getMoves(state.tableau, state.stock, null)) {
        const { tableau: t2, stock: s2 } = cloneState(state.tableau, state.stock);
        const c2 = state.completed + applyMove(t2, s2, move);
        if (c2 >= 8) return true;

        const h  = stateHash(t2, s2.length, c2);
        const sc = evaluateState(t2, c2, numSuits);
        const old = tblGet(h);
        if (old !== undefined && old >= sc) continue; // skip dominated states
        tblSet(h, sc);

        next.push({ tableau: t2, stock: s2, completed: c2, score: sc });
        if (++totalNodes >= MAX_NODES) break;
      }
      if (totalNodes >= MAX_NODES) break;
    }

    if (next.length === 0) break;
    next.sort((a, b) => b.score - a.score);
    beam = next.slice(0, BEAM_WIDTH);
  }

  return beam.some(s => s.completed >= 8);
}

// ---------------------------------------------------------------------------
// Single trial: greedy with 1-step lookahead + forced stock deals when stuck
// (used only for 1-suit; beam search handles harder difficulties)
// ---------------------------------------------------------------------------
function playTrial(tableau, stock, noiseRng, randomPlay) {
  let completed = 0;
  let lastFD = tableau.reduce((s, col) => s + col.filter(c => !c.faceUp).length, 0);
  let noProgressSteps = 0;

  for (let step = 0; step < MAX_STEPS; step++) {
    if (completed >= 8) return true;

    const moves = getMoves(tableau, stock, noiseRng);
    if (!moves.length) return false;

    // When stuck for too long (no new face-down cards uncovered), force a stock
    // deal to change the board state rather than cycle on tableau moves.
    if (noProgressSteps >= 40) {
      if (stock.length > 0 && tableau.every(c => c.length > 0)) {
        completed += applyMove(tableau, stock, { src: -1, idx: -1, dest: -1 });
        noProgressSteps = 0;
      } else {
        return false; // truly stuck
      }
      continue;
    }

    let bestMove;
    if (randomPlay) {
      // Uniform random: pick any legal move (ignoring scores) so that different
      // trials explore radically different paths of the game tree.
      bestMove = moves[Math.floor(noiseRng() * moves.length)];
    } else {
      // 1-step lookahead: for the top few candidates, peek one move ahead and
      // pick the move whose immediate follow-up scores best. This lets the solver
      // recognise two-step unblocking sequences (e.g. "move A to expose B, then
      // move B to flip a hidden card") that pure greedy would miss.
      const candidates = moves.slice(0, Math.min(5, moves.length));
      bestMove = candidates[0];
      let bestCombined = -Infinity;
      for (const cand of candidates) {
        const { tableau: t2, stock: s2 } = cloneState(tableau, stock);
        const c2 = completed + applyMove(t2, s2, cand);
        if (c2 >= 8) { bestMove = cand; break; }
        const next = getMoves(t2, s2, noiseRng);
        const followUp = next.length > 0 ? next[0].score : 0;
        const combined = cand.score + 0.6 * followUp;
        if (combined > bestCombined) { bestCombined = combined; bestMove = cand; }
      }
    }

    completed += applyMove(tableau, stock, bestMove);

    const newFD = tableau.reduce((s, col) => s + col.filter(c => !c.faceUp).length, 0);
    if (newFD < lastFD) {
      noProgressSteps = 0;
      lastFD = newFD;
    } else {
      noProgressSteps++;
    }
  }
  return completed >= 8;
}

// ---------------------------------------------------------------------------
// Verify a seed: true if any trial succeeds
// ---------------------------------------------------------------------------
function verifySeed(numSuits, seed) {
  // Beam search handles 2-suit and 4-suit; greedy trials are fast enough for 1-suit
  if (numSuits > 1) return beamSolve(numSuits, seed);

  const { tableau: t0, stock: s0 } = makeDeal(numSuits, seed);

  for (let t = 0; t < N_TRIALS; t++) {
    // First 60% greedy + lookahead, last 40% random for path diversity
    const rng = mulberry32(seed * 999983 + t * 7919);
    const isRandom = t >= Math.ceil(N_TRIALS * 0.6);
    const noiseRng = t === 0 ? null : rng;
    const { tableau, stock } = cloneState(t0, s0);
    if (playTrial(tableau, stock, noiseRng, isRandom)) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Main loop — worker_threads parallel scan
// ---------------------------------------------------------------------------
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const os = require('os');

if (!isMainThread) {
  // Worker: verify a single seed and report back
  const { numSuits, seed } = workerData;
  parentPort.postMessage({ seed, ok: verifySeed(numSuits, seed) });
  return;
}

// Orchestrator: distribute seeds across CPU workers
const NUM_WORKERS = Math.min(8, Math.max(1, os.cpus().length - 1));
process.stderr.write(
  `Searching for ${TARGET} verified ${NUM_SUITS}-suit seeds from ${START_SEED} ` +
  `(${NUM_WORKERS} workers)...\n`
);

const verified  = [];
const activeWorkers = new Set();
let nextSeed    = START_SEED;
let tried       = 0;
let done        = false;

function finish() {
  if (done) return;
  done = true;
  // Terminate any workers still running
  for (const w of activeWorkers) w.terminate();
  activeWorkers.clear();

  const result = JSON.stringify(verified.slice(0, TARGET).sort((a, b) => a - b), null, 2);
  if (OUTPUT) {
    fs.writeFileSync(OUTPUT, result, 'utf8');
    process.stderr.write(`\nWrote ${TARGET} seeds to ${OUTPUT}\n`);
  } else {
    console.log(result);
  }
  process.stderr.write(`Done. Tried ${tried} seeds to find ${verified.length} verified.\n`);
  process.exit(0);
}

function spawnWorker(seed) {
  if (done) return;
  const w = new Worker(__filename, { workerData: { numSuits: NUM_SUITS, seed } });
  activeWorkers.add(w);

  w.once('message', ({ seed: s, ok }) => {
    activeWorkers.delete(w);
    tried++;
    if (ok && verified.length < TARGET) {
      verified.push(s);
      process.stderr.write(`  [${verified.length}/${TARGET}] seed=${s} (tried ${tried})\n`);
      if (verified.length >= TARGET) { finish(); return; }
    }
    // Spawn next seed if we still need more — account for in-flight workers
    if (!done && verified.length + activeWorkers.size < TARGET) {
      spawnWorker(nextSeed++);
    }
  });

  w.once('error', (err) => {
    activeWorkers.delete(w);
    process.stderr.write(`Worker error: ${err.message}\n`);
    if (!done && verified.length + activeWorkers.size < TARGET) spawnWorker(nextSeed++);
  });
}

// Seed the initial pool — cap so we don't massively overshoot the target
const INITIAL_BURST = Math.min(NUM_WORKERS, TARGET + NUM_WORKERS);
for (let i = 0; i < INITIAL_BURST; i++) spawnWorker(nextSeed++);
