#!/usr/bin/env node
/**
 * patch-seeds.js  –  Splice a new verified seed array into game.js.
 *
 * Usage:
 *   node tools/patch-seeds.js --suits <1|2|4> --seeds <seeds.json> [--game <game.js>]
 *
 * Reads the JSON array produced by verify-seeds.js and replaces the matching
 * entry inside the VERIFIED_SEEDS constant in game.js.
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const args = process.argv.slice(2);
function getArg(name, def) {
  const i = args.indexOf('--' + name);
  return i >= 0 ? args[i + 1] : def;
}

const suits    = parseInt(getArg('suits', '1'));
const seedFile = getArg('seeds', 'seeds.json');
const gameFile = getArg('game', path.join(__dirname, '..', 'game.js'));

if (![1, 2, 4].includes(suits)) {
  console.error('--suits must be 1, 2, or 4');
  process.exit(1);
}

const seeds = JSON.parse(fs.readFileSync(seedFile, 'utf8'));
if (!Array.isArray(seeds)) {
  console.error('seeds file must contain a JSON array');
  process.exit(1);
}

let src = fs.readFileSync(gameFile, 'utf8');

// Replace the specific line:  <suits>: [<any digits/commas/spaces>],
// This handles both compact (current) and expanded formatting.
const re = new RegExp(`(\\n\\s+${suits}:\\s*)\\[[\\d,\\s]*\\]`);
const replacement = `$1${JSON.stringify(seeds)}`;

if (!re.test(src)) {
  console.error(`Could not find "${suits}: [...]" inside VERIFIED_SEEDS in ${gameFile}`);
  process.exit(1);
}

src = src.replace(re, replacement);
fs.writeFileSync(gameFile, src, 'utf8');
console.log(`Patched ${suits}-suit seeds (${seeds.length} entries) into ${gameFile}`);
