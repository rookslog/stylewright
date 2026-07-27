## What this changes

<!-- One or two sentences. -->

## Checks

<!-- Run all three. Continuous integration runs them too. -->

- [ ] `npm test`
- [ ] `npm run lint:docs`
- [ ] `npm run check:ground`

## If you added or changed a skill

- [ ] Every rule is written in our own words. No sentence is copied from the source.
- [ ] No dictionary entries or word lists are reproduced.
- [ ] Every statement in `SKILL.md` has a row in the grounding matrix.
- [ ] Each `G` row cites a real rule identifier that I checked against the source.
- [ ] Each `E` row is honestly ours, and cites no rule.
- [ ] `SOURCE.md` records the license, the date I checked it, and the URL that stated it.
- [ ] The skill carries a non-affiliation notice.
- [ ] The grounding matrix is in `grounding/`, not inside the skill directory.

## If you changed the engine

- [ ] I wrote the test first.
- [ ] Nothing in `src/` calls `process.exit`, prompts, or reads the wall clock.
- [ ] The conformance suite still passes.
