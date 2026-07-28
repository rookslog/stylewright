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

// Longest first. `hedges` consumes each match, so "it is worth noting" must be
// found as one hedge before "worth noting" and "it is worth" can each claim it.
// Scored unsorted, that one phrase counted twice.
const HEDGE = [
  'i have not verified', "i haven't verified", 'it is worth noting',
  "it's worth noting", 'i did not check', "i didn't check", 'for completeness',
  'i should note', 'worth noting', "it's worth", 'it is worth', 'to be clear',
  'that said', 'unchecked', 'caveat',
];

// Each pattern is an offer made TO the reader. A bare `either ... or` was here
// and is gone: it fired on "you can call it either before or after the guard",
// which is a direct answer, not a choice handed back.
const MENU = [
  /\boptions?\s*:/gi,
  /\bwe could\b[^.]{0,80}\bor\b/gi,
  /\b(?:do you want|would you like)\b/gi,
  /\blet me know (?:if|whether|which)\b/gi,
  /\bsay the word\b/gi,
];

/**
 * Fenced code, and the fence delimiters themselves.
 *
 * A reply may legitimately contain code, and the reader asked for it. What the
 * structural metrics must not do is read the code's own `#` lines as headings
 * the writer imposed. Measured: a reply quoting `# H1` and `## H2` inside a
 * fence scored `scaffold: 2` with nothing of its own.
 */
function stripFences(text) {
  return text.replace(/^```.*$[\s\S]*?^```.*$/gm, '');
}

/** Fence delimiter lines only, for the word count, which keeps the code body. */
function dropFenceMarkers(text) {
  return text.replace(/^```.*$/gm, '');
}

/** Visible words. Fence delimiters are punctuation, not prose. */
function words(text) {
  return dropFenceMarkers(text).split(/\s+/).filter(Boolean).length;
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

/** Hedges, each phrase counted once. Longer phrases consume shorter ones. */
function hedges(text) {
  let low = text.toLowerCase();
  let n = 0;
  for (const h of HEDGE) {
    const parts = low.split(h);
    n += parts.length - 1;
    low = parts.join(' ');
  }
  return n;
}

/** Offers, not offer TYPES. Three `Options:` lines are three decisions handed back. */
function menus(text) {
  return MENU.reduce((n, re) => n + (text.match(re) ?? []).length, 0);
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

/**
 * @param raw     the sample text
 * @param prompt  the scenario prompt, for `echo`, or null
 * @param legacy  true only for a sample with no `.meta`, i.e. one collected
 *                before the runner separated stderr. Denoising is destructive —
 *                `^hook: ` removes any line a reply legitimately begins that
 *                way, and a reply about hooks is exactly what this repository
 *                produces — so it must never touch a sample that cannot need it.
 */
export function score(raw, prompt, legacy = false) {
  const text = legacy ? denoise(raw) : raw.trim();
  const removed = words(raw) - words(text);
  if (removed > 0) {
    process.stderr.write(
      `warning: stripped ${removed} words of harness noise. That arm may not be comparable.\n`);
  }
  // Structure inside a fence is quoted, not authored. `words` keeps the code
  // body, because the reader asked for it; everything else reads prose only.
  const prose = stripFences(text);
  return {
    noise: removed,
    words: words(text),
    scaffold: scaffold(prose),
    ...lists(prose),
    hedges: hedges(prose),
    menus: menus(prose),
    echo: echo(text, prompt),
  };
}

/**
 * Read the `.meta` sidecar a sample was collected with.
 *
 * Absent metadata is not a formatting problem. It means nothing recorded which
 * treatment produced the file, and a comparison between two such files is a
 * comparison between two unknowns. Four of this protocol's own defects were
 * invisible for exactly that reason.
 */
export async function readMeta(file) {
  try {
    const raw = await fs.readFile(`${file}.meta`, 'utf8');
    return Object.fromEntries(
      raw.trim().split(/\s+/).map((kv) => {
        const i = kv.indexOf('=');
        return [kv.slice(0, i), kv.slice(i + 1)];
      }));
  } catch {
    return null;
  }
}

/**
 * Everything that makes a set of samples incomparable, as a list of reasons.
 *
 * These are checks a person was previously asked to perform and did not. A
 * README sentence saying "check the hashes before believing a comparison" is an
 * instruction; this is an invariant.
 */
export async function auditable(files, metas) {
  const reasons = [];
  const missing = files.filter((f, i) => !metas[i]);
  if (missing.length) {
    reasons.push(`${missing.length} of ${files.length} samples have no .meta sidecar`);
  }
  const present = metas.filter(Boolean);
  // Each of these varying means something different went wrong, so each says so.
  const WHY = {
    prompt_sha: 'these are different scenarios, and one median across a '
      + 'correction and a report is not a number. Score one scenario at a time',
    system_sha: 'the injected system prompt changed while this arm was running',
    user_rules_sha: 'the operator rule files changed while this arm was running',
    model_id: 'more than one model build served this set',
  };
  for (const [key, why] of Object.entries(WHY)) {
    const seen = [...new Set(present.map((m) => m[key]).filter(Boolean))];
    if (seen.length > 1) {
      reasons.push(`${key} differs (${seen.length} values): ${why}`);
    }
  }
  for (const f of files) {
    try {
      const err = await fs.readFile(`${f}.err`, 'utf8');
      if (err.trim()) reasons.push(`${path.basename(f)} has a non-empty .err sibling`);
    } catch { /* no .err is the healthy case */ }
  }
  return reasons;
}

function median(xs) {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

async function main(argv) {
  const files = [];
  let prompt = null;
  let unaudited = false;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--prompt') {
      prompt = await fs.readFile(argv[i + 1], 'utf8');
      i += 1;
    } else if (argv[i] === '--unaudited') {
      unaudited = true;
    } else {
      files.push(argv[i]);
    }
  }
  if (!files.length) {
    process.stdout.write('usage: score.mjs [--prompt FILE] [--unaudited] SAMPLE...\n');
    return 2;
  }

  // Field samples are uncontrolled by definition and carry no metadata, so
  // --unaudited is how you score them. It prints on every row, because a number
  // that skipped the audit must not be quotable as one that passed it.
  const metas = await Promise.all(files.map(readMeta));
  const reasons = await auditable(files, metas);
  if (reasons.length && !unaudited) {
    process.stderr.write('refusing to score: this set is not a comparison.\n');
    for (const r of reasons) process.stderr.write(`  - ${r}\n`);
    process.stderr.write('Rerun the arm with bench/run.sh, or pass --unaudited '
      + 'to score them as uncontrolled field samples.\n');
    return 1;
  }
  if (reasons.length) {
    process.stderr.write(`UNAUDITED (${reasons.length} reason(s)): ${reasons.join('; ')}\n`);
  }

  const rows = [];
  for (const f of files) {
    // A sample with metadata came from the fixed runner, whose stderr never
    // reaches the sample, so denoising it could only ever damage it.
    const legacy = !metas[files.indexOf(f)];
    rows.push({
      file: path.basename(f),
      ...score(await fs.readFile(f, 'utf8'), prompt, legacy),
    });
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
  // The protocol's own rule is that spread matters as much as the middle, and
  // the tool reported only a middle. A median with no range beside it is how
  // five readings of five different shapes get quoted as one number.
  process.stdout.write(`RANGE\t${keys.map((k) => {
    const v = nums(k);
    return v.length ? `${Math.min(...v)}-${Math.max(...v)}` : '';
  }).join('\t')}\n`);
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = await main(process.argv.slice(2));
}
