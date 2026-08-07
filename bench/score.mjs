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

import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// No entry is CONTAINED in a later one. `hedges` consumes each match, so "it
// is worth noting" must be found as one hedge before "worth noting" and "it is
// worth" can each claim it. Scored in the wrong order, that phrase counted
// twice. Length is not the rule and never was: `for completeness` sits after
// the shorter `i didn't check` here and nothing is wrong with it. A test holds
// the containment property over both lists.
export const HEDGE = [
  'i have not verified', "i haven't verified", 'it is worth noting',
  "it's worth noting", 'i did not check', "i didn't check", 'for completeness',
  'i should note', 'worth noting', "it's worth", 'it is worth', 'to be clear',
  'that said', 'unchecked', 'caveat',
];

/**
 * Words and short phrases that recur in one setting and not another.
 *
 * It ships EMPTY, and that is the design rather than a backlog. ADR-0021 keeps
 * every list of this kind out of `skills/`, because a list of forbidden words
 * delivered to an agent teaches it to swap each word for its nearest
 * neighbour, which leaves the defect and cleans the surface. A scorer counts.
 * It never tells the agent anything.
 *
 * **An entry carries a stated reference distribution.** A count of a word
 * against no baseline reads as evidence and is not evidence: the corpus here
 * is a handful of task prompts times five reps, so topic dominates. So an
 * entry names, in the ADR and in a comment on the line, the corpus its
 * expected rate was measured against and what that rate was. Without one the
 * metric cannot say a setting OVERUSES anything, and the number belongs
 * nowhere. This rule is the one the owner added when ADR-0021 was adopted, and
 * it is why the list below has a place to write it.
 *
 * A word leaves this file for a lint rule only after a promoted study under
 * the measurement design says it should. Until then the scorer counts it and
 * the product asserts nothing about it.
 *
 * An entry that contains an earlier one comes first, for the reason `HEDGE`
 * orders that way: the count consumes each match.
 */
export const SIGNATURE = [];

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

/**
 * Occurrences of a listed phrase, each counted once, longer phrases first.
 *
 * One body for both phrase metrics. `hedges` carried it alone, and a second
 * copy for `signatures` would be a second thing to drift: the consuming split
 * is the whole reason "it is worth noting" is one hedge rather than three.
 */
export function countPhrases(text, list) {
  let low = text.toLowerCase();
  let n = 0;
  for (const h of list) {
    const parts = low.split(h);
    n += parts.length - 1;
    low = parts.join(' ');
  }
  return n;
}

/** Hedges, each phrase counted once. Longer phrases consume shorter ones. */
function hedges(text) {
  return countPhrases(text, HEDGE);
}

/**
 * Signature phrases, counted the way hedges are.
 *
 * The list is a parameter so that the definition is testable while the shipped
 * list is empty. A metric with no test is a number nobody has checked, and an
 * empty list would otherwise make every case vacuous.
 */
export function signatures(text, list = SIGNATURE) {
  return countPhrases(text, list);
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
    // Prose, like every metric but `words`. A signature quoted inside a fence
    // is the reader's material, not a phrase the writer reached for.
    signatures: signatures(prose),
    // Prose, like every metric but `words`. It was reading raw text, so on
    // adjacent-bug a reply quoting the supplied code drew most of its overlap
    // from the code rather than from what the writer wrote.
    echo: echo(prose, prompt ? stripFences(prompt) : prompt),
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
/** The digest run.sh writes: `shasum FILE | cut -c1-12`, which is sha1. */
export function digest(buf) {
  return crypto.createHash('sha1').update(buf).digest('hex').slice(0, 12);
}

/**
 * Provenance a sample must carry before any of it can be compared.
 *
 * Every field that any check reads belongs here, and the list is easy to leave
 * a field off. Round 3 fixed exactly this for `model_id`; adding `cli` and
 * `reps` in the same commit reintroduced it for both, because a field that is
 * compared but not required is skipped when absent, and a `reps` that parses to
 * NaN silently disables the completeness check it gates. If a check reads a
 * field, the field is required.
 */
const REQUIRED = ['arm', 'scenario', 'rep', 'reps', 'prompt_sha', 'system_sha',
  'user_rules_sha', 'model_id', 'cli'];

// Constant within one arm. In --compare mode the treatment fields are expected
// to differ, because differing IS the comparison, so only the shared ground has
// to hold still.
const WHY = {
  prompt_sha: 'these are different scenarios, and one median across a '
    + 'correction and a report is not a number. Score one scenario at a time',
  model_id: 'more than one model build served this set',
  cli: 'more than one CLI version produced this set',
  system_sha: 'the injected system prompt changed while this arm was running',
  user_rules_sha: 'the operator rule files changed while this arm was running',
};
const SHARED_GROUND = ['prompt_sha', 'model_id', 'cli'];

/**
 * Everything that makes a set of samples incomparable, as a list of reasons.
 *
 * These are checks a person was previously asked to perform and did not. A
 * README sentence saying "check the hashes before believing a comparison" is an
 * instruction; this is an invariant.
 *
 * @param opts.compare    true to permit a treatment difference between arms
 * @param opts.promptSha  digest of the file passed to --prompt, to catch a
 *                        scenario scored against the wrong prompt text
 */
export async function auditable(files, metas, opts = {}) {
  const reasons = [];
  const missing = files.filter((f, i) => !metas[i]);
  if (missing.length) {
    reasons.push(`${missing.length} of ${files.length} samples have no .meta sidecar`);
  }
  const present = metas.filter(Boolean);

  // Presence before agreement. Comparing only the values that exist meant a set
  // where every sidecar lacked model_id produced an empty comparison, no
  // reason, and an exit code that read as audited.
  for (const key of REQUIRED) {
    const absent = present.filter((m) => !m[key]).length;
    if (absent) reasons.push(`${absent} of ${present.length} sidecars have no ${key}`);
  }

  const constant = opts.compare ? SHARED_GROUND : Object.keys(WHY);
  for (const key of constant) {
    const seen = [...new Set(present.map((m) => m[key]).filter(Boolean))];
    if (seen.length > 1) reasons.push(`${key} differs (${seen.length} values): ${WHY[key]}`);
  }

  // In --compare mode the arms must actually differ by their treatment,
  // otherwise two identically-configured cells are being read as a contrast.
  if (opts.compare) {
    const arms = [...new Set(present.map((m) => m.arm).filter(Boolean))];
    if (arms.length < 2) reasons.push(`--compare needs at least two arms, found ${arms.length}`);
    const treatments = new Set(present.map((m) => `${m.system_sha}/${m.user_rules_sha}`));
    if (arms.length > 1 && treatments.size < 2) {
      reasons.push('every arm carries the same treatment, so this is not a contrast');
    }
  }

  // A cell is a whole arm, not whatever files happened to be globbed. Scoring
  // four of five reps, or a smoke run of one, produced an ordinary median.
  const byArm = new Map();
  for (const m of present) {
    if (!m.arm) continue;
    if (!byArm.has(m.arm)) byArm.set(m.arm, []);
    byArm.get(m.arm).push(m);
  }
  for (const [arm, ms] of byArm) {
    const plannedSeen = [...new Set(ms.map((m) => m.reps).filter(Boolean))];
    if (plannedSeen.length > 1) {
      reasons.push(`arm ${arm} disagrees with itself about its size: reps=${plannedSeen.join(', ')}`);
    }
    const planned = Number(ms[0].reps);
    const reps = new Set(ms.map((m) => Number(m.rep)));
    if (Number.isFinite(planned)) {
      if (reps.size < planned) {
        reasons.push(`arm ${arm} was collected with reps=${planned} but only ${reps.size} `
          + 'of them are here, so this is a subset and not a cell');
      }
      if (planned < 5) {
        reasons.push(`arm ${arm} holds ${planned} runs, below the documented five-run floor`);
      }
    }
  }

  // The prompt passed for `echo` must be the prompt the samples answered.
  if (opts.promptSha) {
    const wrong = present.filter((m) => m.prompt_sha && m.prompt_sha !== opts.promptSha);
    if (wrong.length) {
      reasons.push(`--prompt does not match these samples (${opts.promptSha} against `
        + `${[...new Set(wrong.map((m) => m.prompt_sha))].join(', ')})`);
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
  let promptSha = null;
  let unaudited = false;
  let compare = false;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--prompt') {
      const buf = await fs.readFile(argv[i + 1]);
      prompt = buf.toString('utf8');
      promptSha = digest(buf);
      i += 1;
    } else if (argv[i] === '--unaudited') {
      unaudited = true;
    } else if (argv[i] === '--compare') {
      compare = true;
    } else {
      files.push(argv[i]);
    }
  }
  if (!files.length) {
    process.stdout.write(
      'usage: score.mjs [--prompt FILE] [--compare] [--unaudited] SAMPLE...\n');
    return 2;
  }

  // Field samples are uncontrolled by definition and carry no metadata, so
  // --unaudited is how you score them. The status rides on every row, because a
  // table that gets redirected or pasted loses anything written to stderr, and
  // an unaudited number must not be quotable as one that passed.
  const metas = await Promise.all(files.map(readMeta));
  const reasons = await auditable(files, metas, { compare, promptSha });
  if (reasons.length && !unaudited) {
    process.stderr.write('refusing to score: this set is not a comparison.\n');
    for (const r of reasons) process.stderr.write(`  - ${r}\n`);
    process.stderr.write('Rerun the arm with bench/run.sh, add --compare to contrast two '
      + 'arms, or pass --unaudited to score them as uncontrolled field samples.\n');
    return 1;
  }
  const status = reasons.length ? 'UNAUDITED' : 'audited';
  if (reasons.length) {
    process.stderr.write(`UNAUDITED (${reasons.length} reason(s)): ${reasons.join('; ')}\n`);
  }

  const rows = [];
  for (let i = 0; i < files.length; i += 1) {
    // A sample with metadata came from the fixed runner, whose stderr never
    // reaches the sample, so denoising it could only ever damage it.
    const legacy = !metas[i];
    rows.push({
      audit: status,
      arm: metas[i]?.arm ?? '-',
      file: path.basename(files[i]),
      ...score(await fs.readFile(files[i], 'utf8'), prompt, legacy),
    });
  }

  const keys = ['noise', 'words', 'scaffold', 'bullets', 'longestList', 'hedges', 'menus',
    'signatures', 'echo'];
  process.stdout.write(`audit\tarm\tfile\t${keys.join('\t')}\n`);
  for (const r of rows) {
    process.stdout.write(`${r.audit}\t${r.arm}\t${r.file}\t${keys.map((k) => r[k] ?? '').join('\t')}\n`);
  }

  // In --compare mode a pooled median across arms is the error the mode exists
  // to permit measuring, so summarise per arm and never across them.
  const groups = compare
    ? [...new Set(rows.map((r) => r.arm))].map((a) => [a, rows.filter((r) => r.arm === a)])
    : [['', rows]];
  for (const [arm, rs] of groups) {
    const nums = (k) => rs.map((r) => r[k]).filter((v) => typeof v === 'number');
    const label = (name) => `${status}\t${arm || '-'}\t${name}`;
    process.stdout.write(`${label('MEDIAN')}\t${keys.map((k) => {
      const v = nums(k);
      return v.length ? median(v) : '';
    }).join('\t')}\n`);
    // The protocol's own rule is that spread matters as much as the middle, and
    // the tool reported only a middle. A median with no range beside it is how
    // five readings of five different shapes get quoted as one number.
    process.stdout.write(`${label('RANGE')}\t${keys.map((k) => {
      const v = nums(k);
      return v.length ? `${Math.min(...v)}-${Math.max(...v)}` : '';
    }).join('\t')}\n`);
  }
  return 0;
}

// The path is compared as a PATH, never as a URL built by hand. `file://` glued
// to `process.argv[1]` is `file://D:\a\repo\bench\score.mjs` on Windows, and
// `import.meta.url` is `file:///D:/a/repo/bench/score.mjs`, so the two could
// never be equal there and this file did nothing when it was run. Nothing in
// CI ran it until promotion did, so the scorer silently printed no table and a
// promoted study derived no figure. Every other entry point here already
// compares this way, and `test/score.test.js` holds the whole set to it.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exitCode = await main(process.argv.slice(2));
}
