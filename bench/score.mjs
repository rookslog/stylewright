#!/usr/bin/env node
// Shape metrics for a piece of agent output.
//
// These are the mechanical half of the protocol. Each one counts something a
// program can count, and none of them judges whether the writing is good. The
// judgment half is a human reading the samples, which `bench/README.md`
// describes and which no number replaces.
//
// The metric that matters most is not `words`. It is `scaffold`, because the
// baseline behind skills/craft/compressed-deliberation showed length following
// structure rather than the other way round.

import fs from 'node:fs/promises';
import path from 'node:path';

const HEDGE = [
  'i did not check', "i didn't check", 'worth noting', "it's worth", 'it is worth',
  'to be clear', 'that said', 'caveat', 'i should note', 'for completeness',
  'unchecked', 'i have not verified', "i haven't verified",
];

const MENU = [
  /\beither\b[^.]{0,80}\bor\b/i,
  /\boptions?\s*:/i,
  /\bwe could\b[^.]{0,80}\bor\b/i,
  /\blet me know (?:if|whether|which)\b/i,
  /\bsay the word\b/i,
];

/** Words, counted the way `wc -w` counts them. */
function words(text) {
  return text.split(/\s+/).filter(Boolean).length;
}

/**
 * Structure the reader did not ask for: markdown headings, and standalone bold
 * labels such as `**What I verified:**`, which behave as headings without being
 * marked as headings.
 */
function scaffold(text) {
  let n = 0;
  for (const line of text.split('\n')) {
    if (/^#{1,6}\s/.test(line)) n += 1;
    else if (/^\s*\*\*[^*]+:?\*\*\s*$/.test(line)) n += 1;
    else if (/^\s*[-*]\s*\*\*[^*]+:\*\*/.test(line)) n += 1;
  }
  return n;
}

/** Bullets in total, and the longest single run of them. */
function lists(text) {
  let total = 0;
  let run = 0;
  let longest = 0;
  for (const line of text.split('\n')) {
    if (/^\s*(?:[-*+]|\d+\.)\s+\S/.test(line)) {
      total += 1;
      run += 1;
      if (run > longest) longest = run;
    } else if (line.trim() === '') {
      // A blank line inside a list does not end it.
    } else {
      run = 0;
    }
  }
  return { bullets: total, longestList: longest };
}

function hedges(text) {
  const low = text.toLowerCase();
  return HEDGE.reduce((n, h) => n + (low.split(h).length - 1), 0);
}

function menus(text) {
  return MENU.reduce((n, re) => n + (re.test(text) ? 1 : 0), 0);
}

/** Content bigrams, for the echo measure below. */
function bigrams(text) {
  const w = text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
  const out = new Set();
  for (let i = 0; i + 1 < w.length; i += 1) out.add(`${w[i]} ${w[i + 1]}`);
  return out;
}

/**
 * How much of the reply is the prompt handed back. A reply that restates the
 * request before answering it scores high here, and that is the one number a
 * reader can act on without opening the sample.
 */
function echo(text, prompt) {
  if (!prompt) return null;
  const p = bigrams(prompt);
  const r = [...bigrams(text)];
  if (!r.length) return 0;
  return Number((r.filter((b) => p.has(b)).length / r.length).toFixed(3));
}

export function score(text, prompt) {
  return {
    words: words(text),
    scaffold: scaffold(text),
    ...lists(text),
    hedges: hedges(text),
    menus: menus(text),
    echo: echo(text, prompt),
  };
}

function median(xs) {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

async function main(argv) {
  const files = [];
  let prompt = null;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--prompt') {
      prompt = await fs.readFile(argv[i + 1], 'utf8');
      i += 1;
    } else {
      files.push(argv[i]);
    }
  }
  if (!files.length) {
    process.stdout.write('usage: score.mjs [--prompt FILE] SAMPLE...\n');
    return 2;
  }

  const rows = [];
  for (const f of files) {
    rows.push({ file: path.basename(f), ...score(await fs.readFile(f, 'utf8'), prompt) });
  }

  const keys = ['words', 'scaffold', 'bullets', 'longestList', 'hedges', 'menus', 'echo'];
  process.stdout.write(`file\t${keys.join('\t')}\n`);
  for (const r of rows) {
    process.stdout.write(`${r.file}\t${keys.map((k) => r[k] ?? '').join('\t')}\n`);
  }
  const nums = (k) => rows.map((r) => r[k]).filter((v) => typeof v === 'number');
  process.stdout.write(`MEDIAN\t${keys.map((k) => {
    const v = nums(k);
    return v.length ? median(v) : '';
  }).join('\t')}\n`);
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = await main(process.argv.slice(2));
}
