#!/usr/bin/env node
// Shape metrics for a piece of agent output.
//
// These are the mechanical half of the protocol. Each one counts something a
// program can count, and none of them judges whether the writing is good. The
// judgment half is a human reading the samples, which `bench/README.md`
// describes and which no number replaces.
//
// `words` is the only metric here that separates every arm we have collected.
// The others are specific and insensitive: they identify a bad sample when they
// fire, and they stay silent on most bad samples. Read them as evidence for a
// finding, never as evidence against one. `bench/README.md` carries the counts.

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
 * Share of the reply's word pairs that also appear in the prompt.
 *
 * This was built to catch a reply that hands the request back before answering
 * it, and it does the opposite, because it is a share. A short on-topic answer
 * reuses the reader's nouns and little else, so it scores high. A long one
 * dilutes the same reuse. Measured 2026-07-27: the tight control scored 0.375
 * and the bloated arm 0.091. A rising `echo` is not a finding.
 */
function echo(text, prompt) {
  if (!prompt) return null;
  const p = bigrams(prompt);
  const r = [...bigrams(text)];
  if (!r.length) return 0;
  return Number((r.filter((b) => p.has(b)).length / r.length).toFixed(3));
}

/**
 * Lines that are the harness talking, not the model. They reached samples once,
 * through a `2>&1` in an early runner, and 26 words of CLI warning inside two
 * arms and nowhere else was enough to reverse the comparison those arms were
 * built to make. `run.sh` now sends stderr elsewhere. This strips it from
 * samples collected before that, and reports what it removed rather than
 * silently cleaning, because a sample that needed cleaning is a sample whose
 * arm may not be comparable.
 */
const NOISE = [
  /^Warning: no stdin data received.*$/gm,
  /^Error: Input must be provided.*$/gm,
  /^cat: .*No such file or directory$/gm,
  /^hook: .*$/gm,
];

export function denoise(text) {
  let out = text;
  for (const re of NOISE) out = out.replace(re, '');
  return out.trim();
}

export function score(raw, prompt) {
  const text = denoise(raw);
  const removed = words(raw) - words(text);
  if (removed > 0) {
    process.stderr.write(
      `warning: stripped ${removed} words of harness noise. That arm may not be comparable.\n`);
  }
  return {
    noise: removed,
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

  const keys = ['noise', 'words', 'scaffold', 'bullets', 'longestList', 'hedges', 'menus', 'echo'];
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
