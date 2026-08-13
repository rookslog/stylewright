## What this changes

<!-- One or two sentences. -->

## Checks

<!-- Run all three. Continuous integration runs them too. -->

- [ ] `npm test`
- [ ] `npm run lint:docs`
- [ ] `npm run check:ground`
- [ ] `npm run check:docs`

## If you added or changed a skill

- [ ] Every quotation carries the rule identifier beside it.
- [ ] A reader could not use this skill instead of reading the source.
- [ ] No vocabulary definitions or usage notes are reproduced in bulk.
- [ ] Every statement in `SKILL.md` has a row in the grounding matrix.
- [ ] Each `G` row cites a real rule identifier that I checked against the source.
- [ ] Each `E` row is honestly ours, and cites no rule.
- [ ] The source record states the license, the date I checked it, and the URL that stated it.
- [ ] The skill carries a non-affiliation notice.
- [ ] The grounding matrix is in `grounding/`, and the source record is in `source/`. Neither sits inside the skill directory.

## If you changed the engine

- [ ] I wrote the test first.
- [ ] Nothing in `src/` calls `process.exit`, prompts, or reads the wall clock.
- [ ] The conformance suite still passes.
