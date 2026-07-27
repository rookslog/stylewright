#!/usr/bin/env node
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { run } from '../src/cli.js';

const repoRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

// The core throws on a filesystem error it cannot interpret: a directory it
// may not read (EACCES), a link that points at itself (ELOOP). Those reached
// the user as a Node stack trace, which says where we were and not what to do.
try {
  process.exitCode = await run(process.argv.slice(2), {
    home: os.homedir(),
    cwd: process.cwd(),
    repoRoot,
    stdout: process.stdout,
    now: new Date().toISOString(),
    interactive: process.stdin.isTTY === true,
  });
} catch (err) {
  process.stdout.write(`stylewright: ${err.message}\n`);
  if (err.code) process.stdout.write(`  (${err.code}${err.path ? ` at ${err.path}` : ''})\n`);
  process.exitCode = 1;
}
