# Security

## What this software does

`stylewright` copies Markdown files into directories in your home directory or
your project. It writes a manifest that records a hash of each file that it
wrote. It runs no code from a skill, and a skill contains no executable code.

The attack surface is small. It is not zero.

## What to look at

- The installer writes to `~/.claude/skills`, `~/.codex/skills`,
  `~/.agents/skills`, and the project equivalents. A defect in path handling
  could write somewhere else.
- `uninstall` deletes files. It deletes only paths that the manifest records.
- The installer has one runtime dependency, `@inquirer/prompts`.

## Report a vulnerability

Use GitHub private vulnerability reporting on this repository. Go to the
`Security` tab and select `Report a vulnerability`. This keeps the report
private until a fix exists.

Do not open a public issue for a vulnerability.

Tell us what you found, how to reproduce it, and what an attacker gains. We will
confirm that we received your report within seven days.

## Supported versions

This project is at an early stage. Only the most recent release gets fixes.
