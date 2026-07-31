#!/usr/bin/env node
// Pull the model's answer out of one `claude --output-format json` run.
//
//   node extract.mjs RAW.json SAMPLE.txt   -> writes the answer, prints the model id
//
// Exits non-zero, writing nothing, when the run did not succeed. That refusal is
// the point of the file. Writing the model's text straight to the sample path
// once left a partial answer from a failed invocation in place, indistinguishable
// from a successful short one — and every treatment in this protocol is meant to
// move samples shorter, so the failure would have read as the result.

import fs from 'node:fs/promises';

const [rawPath, outPath] = process.argv.slice(2);
if (!rawPath || !outPath) {
  process.stderr.write('usage: extract.mjs RAW.json SAMPLE.txt\n');
  process.exit(2);
}

const raw = await fs.readFile(rawPath, 'utf8');
let run;
try {
  run = JSON.parse(raw);
} catch {
  process.stderr.write(`not JSON, so the run did not complete:\n${raw.slice(0, 400)}\n`);
  process.exit(1);
}

if (run.is_error) {
  process.stderr.write(`is_error, subtype=${run.subtype ?? '?'} `
    + `api_error_status=${run.api_error_status ?? '?'}\n`);
  process.exit(1);
}
if (typeof run.result !== 'string' || !run.result.trim()) {
  process.stderr.write('run reported no error and produced no result text\n');
  process.exit(1);
}

// `modelUsage` resolves the moving `opus` alias to the build that served the
// request. More than one model can appear: Claude Code bills a small auxiliary
// call alongside the answering one on some prompts and not others, so a strict
// "exactly one" check refuses good runs at random. The model that wrote the
// answer is the one that emitted the output tokens.
const usage = Object.entries(run.modelUsage ?? {})
  .map(([id, u]) => [id, u.outputTokens ?? u.output_tokens ?? 0])
  .sort((a, b) => b[1] - a[1]);

if (!usage.length) {
  process.stderr.write('no modelUsage, so the serving build is unknown\n');
  process.exit(1);
}
if (usage.length > 1 && usage[0][1] === usage[1][1]) {
  process.stderr.write('cannot tell which model answered: '
    + `${usage.map(([id, n]) => `${id}=${n}`).join(' ')}\n`);
  process.exit(1);
}

await fs.writeFile(outPath, run.result);
process.stdout.write(usage[0][0]);
