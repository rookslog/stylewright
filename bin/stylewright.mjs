#!/usr/bin/env node
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { run } from '../src/cli.js';

const repoRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

process.exitCode = await run(process.argv.slice(2), {
  home: os.homedir(),
  cwd: process.cwd(),
  repoRoot,
  stdout: process.stdout,
  now: new Date().toISOString(),
  interactive: process.stdin.isTTY === true,
});
