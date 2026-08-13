# Editorial audits

This record says who read this repository's own prose, and when.

`stylewright lint` cannot see a restated question, a triad where two items
would do, or a closing that re-says the page. The craft skills name those
moves, and `skills/craft/de-slop/SKILL.md` states in its own words that no
check sees them. So `npm run check:editorial` reads this record and never the
prose. ADR-0027 records the decision.

A row states that a **person** read the document, with `de-slop` and
`compressed-deliberation` open. An agent never writes a row here. A date
written for a reading nobody did is the worst thing this record can carry, and
it is the `G` row defect one file over: the row borrows an authority the
reading never granted, and nothing here can catch it. That is why the rule is
written where the row gets written.

The check refuses a malformed row, a document the list does not govern, a
document stamped twice, and a day the calendar does not carry or that lies
ahead of the run. It counts what is read and what has changed since, and both
counts are notes that fail nothing.

`scripts/check-editorial.mjs` holds the list of governed documents, so the list
cannot be shortened from here.

To record a reading, read the document, then run `node
scripts/check-editorial.mjs --digest README.md` for the digest of the bytes you
read, and write the row.

| Document | Read | Digest |
| --- | --- | --- |

No document has been read yet. The count says so on every run, which is the
point of counting it.
