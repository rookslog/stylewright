# Source record

- Source: ASD-STE100 Simplified Technical English, Issue 9, January 2025
- URL: https://www.asd-ste100.org/assets/files/ASD-STE100_ISSUE9.pdf
- Rights holder: Aerospace, Security and Defence Industries Association of Europe
- License: (c) ASD 2025. All rights reserved. The copyright page grants
  irrevocable free reproduction rights to eight enumerated categories of
  organization. A public repository owned by an individual is not among them.
- Trademark: European Union registered trademark 017966390
- Verified: 2026-07-26, read from the copyright page of the official PDF
- Transformation: an operational digest in our own words, plus a navigation map.
  No rule text. No dictionary entries.

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
