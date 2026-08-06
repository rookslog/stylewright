// Deterministic labelling rules for a new or edited issue.
//
// `.github/workflows/issue-label.yml` imports `labelsFor` and adds whatever it
// returns. The workflow only ever adds, so a label a person applied by hand
// survives every re-run, and a re-run adds nothing twice.
//
// An issue title and body are untrusted text. A rule reads them with a regular
// expression and nothing else. No rule evaluates them.
//
// Every rule states why its pattern implies its label, because the repository
// holds a mechanical word list to that bar and this is a word list. See
// AGENTS.md, "A word list without rationale or a severity".
//
// The rules aim for precision and accept misses. A wrong label teaches a
// maintainer to distrust the whole set. An unlabelled issue costs one moment of
// triage. So a rule fires on a token that names one thing in this repository,
// and a token that reads as ordinary English is not a rule.
//
// Two labels are deliberately absent, on evidence rather than taste:
//
//   `defect` and `enhancement` come from the issue forms, which already set
//   them. No title or body pattern separates the two at a precision worth
//   having, because both are written as a plain statement of what is wrong.
//
//   `grounding`, `lint`, `skill content` and `documentation` are path labels.
//   `.github/labeler.yml` applies them to a pull request from the files it
//   touches. No issue in this repository's history carries one, so a rule for
//   them would predict a label the maintainer has never chosen.

/**
 * A rule fires when `title` matches (or `text`, which reads title and body
 * together), and `unless` does not match the same text.
 */
export const rules = [
  {
    label: 'new skill',
    // The skill form sets the title `skill: <name>`, and every proposal in the
    // history follows it, including the ones opened from a blank issue. The
    // prefix names a proposal and nothing else, so it never reads as prose.
    why: 'The skill proposal form fixes this title shape.',
    title: /^\s*skill:\s*\S/i,
  },
  {
    label: 'engine',
    // `doctor`, `uninstall` and `scaffold` each name one engine surface. No
    // other part of the repository uses the words, so a title carrying one is
    // about the command-line tool.
    why: 'The title names an engine command or the scaffold.',
    title: /\b(doctor|uninstall|scaffold)\b/i,
  },
  {
    label: 'engine',
    // A module under `src/` is the engine by definition. AGENTS.md governs
    // `src/` as the engine's purity boundary.
    why: 'The issue names a module under src/.',
    text: /\bsrc\/[a-z][a-z-]*\.js\b/,
  },
  {
    label: 'engine',
    // An invocation of an install command is about the engine. The verb alone
    // is too common, so the rule needs the program name beside it. `stylewright
    // lint` and `stylewright ground` are deliberately absent: an issue about a
    // skill's wording names the checker that would read it, and three issues in
    // the history do exactly that while carrying no engine label.
    why: 'The issue quotes an invocation of an install command.',
    text: /\bstylewright\s+(install|update|uninstall|doctor|new-skill)\b/,
  },
  {
    label: 'engine',
    // A flag with two leading dashes is a command-line surface. The named ones
    // are the flags the engine actually accepts.
    why: 'The title names a command-line flag.',
    title: /(^|[\s(])--(skill|platform|scope|tier|force|all|check)\b/,
  },
  {
    label: 'engine',
    // The manifest is the engine's own record of what it wrote. The word also
    // names a plugin marketplace manifest, which is a distribution concern, so
    // the rule stands down when the text says marketplace.
    why: 'The title names the install manifest.',
    title: /\bmanifests?\b/i,
    unless: /\bmarketplace\b/i,
  },
  {
    label: 'distribution',
    // A plugin marketplace is one of the six install pathways and belongs to
    // nothing else here. The rule reads the title alone, because a body cites
    // another harness's marketplace file in passing while the issue is about
    // something else. Issue #28 does exactly that.
    why: 'The title is about a plugin marketplace.',
    title: /\bmarketplace\b/i,
  },
  {
    label: 'distribution',
    // The install pathways are numbered, and an issue about one opens with its
    // number. The bare word `pathway` appears in prose about other things, so
    // the rule anchors on the title opening.
    why: 'The title opens with a numbered install pathway.',
    title: /^\s*pathway\s+\d/i,
  },
];

/** Labels that every rule in this file is allowed to apply. */
export const vocabulary = [...new Set(rules.map((rule) => rule.label))].sort();

/**
 * Returns the labels the rules apply to one issue, sorted and without
 * duplicates. Reads nothing outside its arguments.
 */
export function labelsFor({ title = '', body = '' } = {}) {
  const text = `${title}\n${body}`;
  const applied = new Set();
  for (const rule of rules) {
    const subject = rule.title ? title : text;
    const pattern = rule.title ?? rule.text;
    if (!pattern.test(subject)) continue;
    if (rule.unless && rule.unless.test(text)) continue;
    applied.add(rule.label);
  }
  return [...applied].sort();
}
