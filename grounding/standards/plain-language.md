# Grounding: plain-language

Disposes of every unit of content in
`skills/standards/plain-language/SKILL.md`, against a named
guideline in the Federal Plain Language Guidelines.

- A **`G` row** traces to the source. Its rule cell names the guideline slug.
- An **`E` row** is our own editorial guidance. Its rule cell is empty.
- An **`N` row** is narrative. It orients the reader and asserts no rule, so it
  claims no authority at all. Its rule cell is empty.

The `Audited` cell of a `G` row says whether a person has read that row against
the source. Every row starts at `unaudited`, and no run of the checker raises
it. A person who checks a row writes the date and the row's digest in place of
the word. Editing any other cell changes that digest, so the audit goes stale
and the check says so.

This file stays in the repository. It does not install with the skill.

Checked by `stylewright ground --check --skill plain-language`.

**Provenance.** The guideline slugs below are directory and file names in the
archived source repository, read on 2026-07-26. Reproduce the list with:

```
gh api "repos/GSA/plainlanguage.gov/git/trees/HEAD?recursive=1" | grep '_pages/guidelines/'
```

Open a guideline at
`https://github.com/GSA/plainlanguage.gov/blob/master/_pages/guidelines/<slug>.md`.

The source is CC0 1.0 Universal, so quotation would be permitted here. We write
in our own words anyway, because that is the doctrine for every skill.

| ID | Our guidance | Our anchor | Source rule | Source location | Audited |
|---|---|---|---|---|---|
| E-01 | Use plain language when a general public reader must decide or act. | Choosing between this and Simplified Technical English |  | Our routing advice, not a guideline |  |
| E-02 | Use Simplified Technical English when a technician follows a procedure. | Choosing between this and Simplified Technical English |  | Our routing advice, not a guideline |  |
| E-03 | Follow one standard in one document. Do not mix them. | Choosing between this and Simplified Technical English |  | Our routing advice, not a guideline |  |
| G-01 | Identify your reader before you write, and learn what they must do. | Audience | audience/do-your-research | Audience | unaudited |
| G-02 | Address the reader directly as `you`. | Audience | audience/address-the-user | Audience | unaudited |
| G-03 | Separate the guidance for each audience when one document serves several. | Audience | audience/address-separate-audiences-separately | Audience | unaudited |
| G-04 | Put the main idea before any exception or condition. | Organization | organize/place-the-main-idea-before-exceptions-and-conditions | Organize | unaudited |
| G-05 | Start each section with the point, not with the background. | Organization | organize/make-it-easy-to-follow | Organize | unaudited |
| G-06 | Give each paragraph a topic sentence. | Organization | organize/have-a-topic-sentence | Organize | unaudited |
| G-07 | Write headings that state the content, and prefer the question the reader asks. | Organization | organize/add-useful-headings, organize/effective-headings | Organize | unaudited |
| G-08 | Use a list when the text holds several conditions, steps, or items. | Organization | organize/use-lists | Organize | unaudited |
| G-09 | Use transition words to show how one idea follows another. | Organization | organize/use-transition-words | Organize | unaudited |
| G-10 | Use the simple word in place of the formal word. | Words | words/use-simple-words-phrases | Words | unaudited |
| G-11 | Replace a hidden verb with the verb itself. Write `apply`, not `make an application`. | Words | words/avoid-hidden-verbs | Words | unaudited |
| G-12 | Do not use jargon. Define a technical term when the reader needs it. | Words | words/avoid-jargon | Words | unaudited |
| G-13 | Do not build long noun strings. Break them apart with prepositions. | Words | words/avoid-noun-strings | Words | unaudited |
| G-14 | Use the same term for the same thing every time. | Words | words/use-the-same-terms-consistently | Words | unaudited |
| G-15 | Use few abbreviations. An abbreviation that the reader must memorize costs more than it saves. | Words | words/minimize-abbreviations | Words | unaudited |
| G-16 | Define few terms. A definition that contradicts ordinary usage confuses the reader. | Words | words/minimize-definitions | Words | unaudited |
| G-17 | Put each word close to the word that it modifies. | Words | words/place-words-carefully | Words | unaudited |
| G-18 | Write short sentences, and put one idea in each sentence. | Concision | concise/write-short-sentences | Be concise | unaudited |
| G-19 | Keep the subject, the verb, and the object close together. | Concision | concise/keep-the-subject-verb-and-object-close-together | Be concise | unaudited |
| G-20 | Write short paragraphs and short sections. | Concision | concise/write-short-paragraphs, concise/write-short-sections | Be concise | unaudited |
| G-21 | State what is true rather than what is not true. | Concision | concise/use-positive-language | Be concise | unaudited |
| G-22 | Use the active voice, and name the actor. | Tone | conversational/use-active-voice | Be conversational | unaudited |
| G-23 | Use the present tense. | Tone | conversational/use-the-present-tense | Be conversational | unaudited |
| G-24 | Use `must` to state a requirement. | Tone | conversational/use-must-to-indicate-requirements | Be conversational | unaudited |
| G-25 | Do not use `shall`. It is ambiguous, and courts have read it both ways. | Tone | conversational/shall-and-must | Be conversational | unaudited |
| G-26 | Use contractions where they suit the reader and the register. | Tone | conversational/use-contractions | Be conversational | unaudited |
| G-27 | Give an example when a rule is hard to picture. | Tone | conversational/use-examples | Be conversational | unaudited |
| G-28 | Do not use a slash between two words. Write the relationship out. | Tone | conversational/dont-use-slashes | Be conversational | unaudited |
| G-29 | Use a table when the reader must match a condition to a result. | Design | design/use-tables-to-make-complex-material-easier-to-understand | Design | unaudited |
| G-30 | Highlight the concepts that carry the decision. | Design | design/highlight-important-concepts | Design | unaudited |
| G-31 | Use few cross-references. Each one sends the reader away from the answer. | Design | design/minimize-cross-references | Design | unaudited |
| G-32 | Use a visual when it carries the meaning better than a sentence does. | Design | design/consider-using-visuals | Design | unaudited |
| G-33 | Write link text that names the destination. | Web | web/write-effective-links | Write for the web | unaudited |
| G-34 | Do not publish a long PDF where a web page serves the reader better. | Web | web/avoid-pdf-overload | Write for the web | unaudited |
| G-35 | Rewrite print material for the web. Do not paste it. | Web | web/repurpose-print-material | Write for the web | unaudited |
| G-36 | Avoid a page of frequently asked questions. Organize the content by topic instead. | Web | web/avoid-faqs | Write for the web | unaudited |
| G-37 | Test the document with real readers before you publish it. | Testing | test/usability-testing | Test | unaudited |
| G-38 | Ask a reader to restate the content in their own words. | Testing | test/paraphrase-testing | Test | unaudited |
| E-04 | Write so that a reader finds what they need, understands it the first time, and can act on it. This guide is based on the Federal Plain Language Guidelines, which support the Plain Writing Act of 2010. | Purpose |  | Our own framing, and it tells the reader what to aim for |  |
| N-02 | Plain language is not simplified language. It does not remove detail. It puts the reader ahead of the writer. | Purpose |  | Orients the reader, asserts no rule |  |
| E-05 | The two standards disagree in places. Plain language allows contractions and asks for a conversational tone. Simplified Technical English forbids contractions, because they are hard for a reader whose first language is not English. The reader decides which standard wins. | Choosing between this and Simplified Technical English |  | Our comparison, and it tells the reader who decides |  |
| N-04 | plain-language | plain-language |  | Section title, asserts no rule |  |
| N-05 | Purpose | Purpose |  | Section title, asserts no rule |  |
| N-06 | Choosing between this and Simplified Technical English | Choosing between this and Simplified Technical English |  | Section title, asserts no rule |  |
| N-07 | Audience | Audience |  | Section title, asserts no rule |  |
| N-08 | Organization | Organization |  | Section title, asserts no rule |  |
| N-09 | Words | Words |  | Section title, asserts no rule |  |
| N-10 | Concision | Concision |  | Section title, asserts no rule |  |
| N-11 | Tone | Tone |  | Section title, asserts no rule |  |
| N-12 | Design | Design |  | Section title, asserts no rule |  |
| N-13 | Web | Web |  | Section title, asserts no rule |  |
| N-14 | Testing | Testing |  | Section title, asserts no rule |  |
| N-15 | Source and boundary | Source and boundary |  | Section title, asserts no rule |  |
| N-16 | This skill is an operational digest written in our own words. The source is public domain under CC0, so it places no limit on quotation. This digest does not replace the official guidelines, which carry the examples and the rationale. | Source and boundary |  | Boundary statement, asserts no rule |  |
| N-17 | Standard: [Federal Plain Language Guidelines](https://github.com/GSA/plainlanguage.gov) | Source and boundary |  | Names the source |  |
| N-18 | The original site at `plainlanguage.gov` now redirects to `digital.gov`. The archived guidelines in the repository above are the source of record. | Source and boundary |  | Boundary statement, asserts no rule |  |
| N-19 | Every statement above is accounted for in a public trace. Each one either cites a named guideline, or is marked as our own editorial guidance, or is marked as narrative that asserts no rule. The trace lives in the [stylewright repository](https://github.com/rookslog/stylewright/blob/main/grounding/standards/plain-language.md). It is not installed with this skill. | Source and boundary |  | Describes the trace, asserts no rule |  |
| N-20 | Notice | Notice |  | Section title, asserts no rule |  |
| N-21 | This skill is not affiliated with, endorsed by, or approved by the General Services Administration, the Plain Language Action and Information Network, or any United States government agency. | Notice |  | Affiliation and trademark notice |  |
