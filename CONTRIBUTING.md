# Contributing to stylewright

Thank you for helping. This document tells you what a contribution needs and how
to check it before you open a pull request.

## The one rule that shapes everything

Every statement in a skill must trace to something. A `standards/` skill traces
to a numbered rule in a published source. A `craft/` skill traces to us, and
says so.

The grounding matrix in `grounding/` is where that trace lives. A reviewer reads
it to answer one question: does this instruction carry the authority of a
standard, or only ours?

## Start here

```
npm ci
npm test
```

Three checks gate every pull request. Run all three before you push.

```
npm test              # unit and conformance tests
npm run lint:docs     # our own writing rules, applied to our own documents
npm run check:ground  # every grounding matrix still matches its skill
```

## Add a skill

Do not create the files by hand. The scaffold writes them in the right places
and starts green.

```
node bin/stylewright.mjs new-skill plain-language \
  --tier standards \
  --source "Federal Plain Language Guidelines" \
  --url "https://digital.gov/guides/plain-language" \
  --license "CC0 1.0" \
  --description "Use when writing for a general public audience."
```

For a skill with no external source:

```
node bin/stylewright.mjs new-skill readme-craft --tier craft
```

Then do this:

1. Replace the placeholder rule in `SKILL.md`. Write one instruction in each line.
2. Add a matching row to the grounding matrix for every rule that you write.
3. Fill in the `FILL IN` fields in `SOURCE.md`.
4. Run the three checks above.

### Choose a source, for a standards skill

A source qualifies when both of these are true:

1. Anyone can read its canonical text at a public URL, without payment.
2. Its reuse terms permit a digest in our own words.

The first condition alone is not enough. Check the second before you write
anything. Record the license and the date that you checked it in `SOURCE.md`.

We rejected the Chicago Manual of Style, the AP Stylebook, ISO/IEC 26514, and
IEEE 1063. None of them is readable without payment, so a reader cannot check
our work against them.

Some sources forbid derivative work. The IETF Trust Legal Provisions do, for
example. A skill from such a source ships our own applied guidance and a pointer,
and no digest. Every row in its matrix is an `E` row.

### Never reproduce source text

Write each rule in your own words. Do not copy sentences. Do not copy dictionary
entries or word lists. The matrix cites rule identifiers, never rule text.

This is what lets the repository be public. Treat it as the hard limit.

## Write the grounding matrix

Each row has an ID, the guidance quoted from your `SKILL.md`, the heading it sits
under, the source rule, and where that rule lives.

- Use `G-nn` when the row traces to the source. Name the rule, such as `Rule 5.1`.
- Use `E-nn` when the guidance is ours. Leave the rule cell empty.

Quote your own `SKILL.md` exactly. `check:ground` compares the strings, so a
reworded rule fails the check until you update its row. That is the point.

Be honest about `E` rows. A `G` row that does not really trace to the source is
worse than no matrix, because it claims an authority that it does not have.

## Write under the skills

Our own documents follow ASD-STE100. `npm run lint:docs` checks them:

- No semicolons.
- No contractions.
- Descriptive sentences of 25 words or fewer.
- Procedural sentences of 20 words or fewer.
- Steps that start with an imperative verb.

The lint skips code, tables, link targets, and blockquotes.

`CODE_OF_CONDUCT.md` is exempt. It is an unmodified third-party document, and
editing it to satisfy our linter would change a text that people recognize.

## Change the engine

Write the test first. Every module under `src/` is a pure function or a thin
wrapper over the filesystem, and nothing in `src/` may do these things:

- Call `process.exit`.
- Prompt the user.
- Read the wall clock.

The command-line layer owns all three. Pass time in as a parameter. This is what
keeps manifests comparable across install pathways in the conformance suite.

## Report a defect in a rule

A wrong rule identifier in a matrix is a real defect. Open an issue with the
skill name, the row ID, and the correct rule. Cite where you checked.

We would rather hear that a `G` row is wrong than keep a trace that does not
hold.

## Licensing of your contribution

The engine, the tests, and the tooling are MIT. Each `standards/` skill carries
the license of its source. A `craft/` skill is MIT.

When you open a pull request, you agree that we may publish your contribution
under those terms.
