# AGENTS.md

Instructions for an agent working in this repository, and for an automated
reviewer reading a pull request against it.

This repository ships writing skills. Its own documents are written under one of
those skills, and continuous integration checks them with its own tool. Hold a
change here to the standard the repository sells.

## Run these three before you claim a change is done

```bash
npm test              # unit and conformance tests
npm run lint:docs     # our own writing rules, applied to our own documents
npm run check:ground  # every grounding matrix still matches its skill
```

`npm run check` runs all three.

## What counts as a defect here

These are the failures specific to this repository. A generic review misses
them, so look for them first.

### A grounding matrix that lies

Every statement in a `standards/` skill traces to a numbered rule in the
published source. The trace lives in `grounding/<tier>/<skill>.md`.

- A **`G` row** claims the authority of the source. Its rule cell names the rule.
- An **`E` row** is our own editorial guidance. Its rule cell is empty.

Labelling our own advice as a `G` row is the worst defect this repository can
ship. It borrows authority the source never granted. Flag it as critical.

A `G` row that cites a rule which does not say that is the same defect in a
quieter form.

### Reproduced source text

No skill may reproduce rule text or dictionary entries from a standard. ASD
grants reproduction rights to eight enumerated organizations, and this
repository is not one of them. Every skill states the rules in our own words.

If a pull request adds a sentence that reads as if it were copied from a source,
say so. The repository's ability to stay public depends on this.

### A grounding matrix that installs

A matrix is an audit record for a person. It is not context for an agent. Four
of the six install pathways copy skill directories whole, so **location** is the
only thing keeping a matrix out of an installed tree.

A matrix inside `skills/` is a defect, even when every row is correct.

### Impurity in `src/`

No module in `src/` may call `process.exit`, read the wall clock, or import a
prompt library. Time is passed in as a parameter. This is what keeps manifests
comparable across install pathways in the conformance suite.

`src/prompt.js` is the single exception for prompting. It owns the dialogue so
that nothing else has to, and the command-line layer injects it.

`test/purity.test.js` enforces this. If you propose a change here, the test is
the authority and not this paragraph.

### A banned-word list

A skill that forbids specific words is out of scope. Such a list dates fast, it
fires on correct usage, and it teaches an agent to swap one tell for another.
Rules here govern structure and commitment, not vocabulary.

## Known blind spots in the test suite

Do not read a green pipeline as coverage of this one.

- **`src/prompt.js` is never imported by a test.** Every test injects a fake
  through `ctx`, so the sole consumer of `@inquirer/prompts` has no coverage.
  A dependency bump that changes the prompt API passes CI. See issue #10.

## The Node floor is enforced, and how

`engines` names the floor. The CI matrix tests the exact versions we advertise,
`20.11.0` and `22.0.0`, rather than `20` and `22`, which resolve to the newest
release of each major and hide the floor. `.npmrc` sets `engine-strict`, so a
dependency needing more than the floor fails `npm ci` instead of printing a
warning.

Two consequences for a change you propose here:

- Adding a dependency that requires more Node than `engines` allows will fail,
  and that is correct. Raise the floor deliberately, in `package.json` and in
  both workflow matrices together, or choose a compatible version.
- Changing the matrix versions renames the CI jobs. The branch ruleset requires
  those job names as status checks, so update the ruleset in the same pass or
  every pull request blocks on checks that no longer run.

## Conventions worth knowing before you suggest a change

- Install works by **copy**, never by symbolic link. A link breaks when the
  clone moves, and it is unsafe across the Cowork host and sandbox boundary.
- `update` refuses to overwrite a file the user edited, unless `--force` is set.
- `uninstall` removes only what the manifest records.
- Add a skill with the scaffold, never by hand:
  `node bin/stylewright.mjs new-skill <name> --tier <standards|craft>`.
- Do not put a `!` pattern inside `any-glob-to-any-file` in
  `.github/labeler.yml`. It reads as "any file that does not match this", so it
  labels nearly every pull request.
- `LICENSE` must stay unmodified MIT text. Appending a note to it stops GitHub
  detecting the license. Scope statements belong in README, under Licensing.

## Writing style for documents in this repository

Prose in `README.md`, `CONTRIBUTING.md`, and `docs/` is linted by
`stylewright lint`. Write short sentences, one idea each. Use active voice and
name the actor. Do not use semicolons.

Run `npm run lint:docs` after editing any document, and read what it reports
rather than working around it.
