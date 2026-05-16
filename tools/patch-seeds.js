#!/usr/bin/env node
/**
 * patch-seeds.js  –  Splice a verified seed array into game.js.
 *
 * Usage:
 *   node tools/patch-seeds.js --suits <1|2|4> --seeds <seeds.json> [--game <game.js>] [--merge]
 *
 * Options:
 *   --suits   Difficulty (1, 2, or 4)
 *   --seeds   Path to JSON array produced by verify-seeds.js
 *   --game    Path to game.js  (default: ../game.js relative to this script)
 *   --merge   Merge new seeds into the existing array instead of replacing it
 *
 * Exits with code 0 and prints the final seed count.
 * Also prints the next --start value to stdout as "NEXT_START=<n>" so
 * callers can chain subsequent runs.
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const args = process.argv.slice(2);
function getArg(name, def) {
  const i = args.indexOf('--' + name);
  return i >= 0 ? args[i + 1] : def;
}
function hasFlag(name) { return args.includes('--' + name); }

const suits    = parseInt(getArg('suits', '1'));
const seedFile = getArg('seeds', 'seeds.json');
const gameFile = getArg('game', path.join(__dirname, '..', 'game.js'));
const merge    = hasFlag('merge');

if (![1, 2, 3, 4].includes(suits)) {
  console.error('--suits must be 1, 2, or 4');
  process.exit(1);
}

const incoming = JSON.parse(fs.readFileSync(seedFile, 'utf8'));
if (!Array.isArray(incoming)) {
  console.error('seeds file must contain a JSON array');
  process.exit(1);
}

let src = fs.readFileSync(gameFile, 'utf8');

// Extract the existing array for this difficulty so we can merge if requested.
const re = new RegExp(`(\\n\\s+${suits}:\\s*)\\[([\\d,\\s]*)\\]`);
const match = src.match(re);
if (!match) {
  console.error(`Could not find "${suits}: [...]" inside VERIFIED_SEEDS in ${gameFile}`);
  process.exit(1);
}

const existing = match[2].trim()
  ? match[2].split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n))
  : [];

// Merge: union of existing + incoming, sorted ascending, deduplicated.
const merged = merge
  ? [...new Set([...existing, ...incoming])].sort((a, b) => a - b)
  : [...incoming].sort((a, b) => a - b);

src = src.replace(re, `$1${JSON.stringify(merged)}`);
fs.writeFileSync(gameFile, src, 'utf8');

const nextStart = merged.length > 0 ? Math.max(...merged) + 1 : 0;
console.log(`Patched ${suits}-suit seeds (${merged.length} total, was ${existing.length}) into ${gameFile}`);
console.log(`NEXT_START=${nextStart}`);
