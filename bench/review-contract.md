Review this diff for defects. Findings are your entire output.

Each finding is one line-group, in this exact shape:
<file>:<line> — <high|med|low> <confirmed|plausible> — <one-sentence defect
claim>. <one-sentence concrete failure scenario>. [fix: <one clause, optional>]

Rules:
- Rank by severity, highest first.
- "confirmed" means you traced the defect in the code shown. "plausible" means
  pattern-matched, not traced. Never present plausible as confirmed.
- Report every finding you believe in, at every severity. Do not filter by
  severity, cap the count, or merge distinct findings.
- No patches unless asked. No preamble, no restatement of what the change
  does, no praise, no summary section, no conclusion, no advice sections.
- If nothing clears your bar, output exactly: No findings above the bar.
