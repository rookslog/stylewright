# Source record for simplified-technical-english

This file stays in the repository. It does not install with the skill.

- Source: ASD-STE100 Simplified Technical English, Issue 9, January 2025
- URL: https://www.asd-ste100.org/assets/files/ASD-STE100_ISSUE9.pdf
- Rights holder: Aerospace, Security and Defence Industries Association of Europe
- License: (c) ASD 2025. All rights reserved. The copyright page grants
  irrevocable free reproduction rights to eight enumerated categories of
  organization. A public repository owned by an individual is not among them.
- Trademark: European Union registered trademark 017966390
- Verified: 2026-07-26, read from the copyright page of the official PDF
- Transformation: an operational digest in our own words, plus a navigation map.
  No dictionary definitions. As of 2026-07-27 the repository permits quoting an
  individual rule beside its identifier, and permits a lint dictionary of
  approved and non-approved word pairs. This skill uses neither. See
  section 3.2 of the design document for the limit, which is substitution rather
  than quotation.
- Publication decision: the repository owner read this record and approved
  continued publication on 2026-08-04. The approval holds while the skill
  reproduces no rule text and no substantial part of the standard. A change
  that crosses either line reopens the decision.
- Reference files, 2026-08-14: the two files under `references/` gained matrices
  of their own, at `grounding/standards/simplified-technical-english/references/`.
  They carry six `G` rows between them, and every one reads `unquoted` and
  `unaudited`. Both matrices declare quotation forbidden, in the words the
  skill's matrix uses, so the publication decision below governs them without
  change. Nobody read the copyright page or any rule on this date. The rule
  identifiers those rows cite came from the reading of 2026-07-26 recorded here,
  and no row claims that anybody has checked one.
- Quotation check, 2026-08-06: the grounding matrix gained a `Source text`
  column on this date, under ADR-0020. Nothing was quoted into it. This record
  was read first, and the publication decision above forbids it: reproducing a
  rule is reproducing rule text, whether it lands in the skill or in the matrix
  beside it. Every row of that matrix reads `unquoted`, and it stays that way
  until the owner reopens the decision above. Nobody re-read the copyright page
  on this date, because the licence is not the thing in the way.

## How to re-check this record

1. Download the PDF from the URL above. The URL resolves without authentication.
2. Read page 2, titled `Copyright notices`.
3. Compare the license and trademark lines above against that page.

## Rule identifiers

The rule identifiers in the grounding matrix were read from the official PDF on
2026-07-26. Reproduce the extraction with:

```
pdftotext -f 30 -l 170 ASD-STE100_ISSUE9.pdf ste-rules.txt
grep -n "^Rule [0-9]" ste-rules.txt
```

Issue 9 has no Rule 2.3. The change log on page 5 records that Rule 2.3 moved
from Section 2 to Section 4 and became Rule 4.5.
