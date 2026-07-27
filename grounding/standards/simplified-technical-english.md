# Grounding: simplified-technical-english

Traces every statement in `skills/standards/simplified-technical-english/SKILL.md`
to a numbered rule in ASD-STE100 Issue 9, January 2025.

- A **`G` row** traces to the standard. The `Source rule` cell names the rule.
- An **`E` row** is our own editorial guidance. It traces to nothing, and its
  `Source rule` cell is empty. An `E` row carries our authority, not the
  standard's.

This file stays in the repository. It does not install with the skill.

Checked by `stylewright ground --check --skill simplified-technical-english`.
The check fails when a quote here no longer appears in `SKILL.md`, when a quote
sits under a different heading, or when a statement in `SKILL.md` has no row.

**Provenance of the rule identifiers.** Read from the official PDF on 2026-07-26.
This file cites rule numbers and section locations. It carries no quoted rule
text yet. Adding the quoted rule beside each identifier would make a `G` row
checkable without opening the PDF, and the repository permits that as of
2026-07-27. See `SOURCE.md` in the skill directory for the extraction command.

| ID | Our guidance | Our anchor | Source rule | Source location |
|---|---|---|---|---|
| E-01 | Read [rule-navigation.md](references/rule-navigation.md) when an exact rule location, more context, or strict compliance matters. | Reference routing |  | Our file layout, not the standard |
| E-02 | Read [examples.md](references/examples.md) when you need before-and-after patterns for a revision or explanation. | Reference routing |  | Our file layout, not the standard |
| E-03 | Treat both references as aids. For strict compliance, check the official PDF, its controlled dictionary, and the applicable terminology database. | Reference routing |  | Our boundary statement |
| G-01 | Use approved STE words when the dictionary is available. | Vocabulary | Rule 1.1 | Part 1, Section 1 |
| G-02 | Use each approved word only with its approved meaning, part of speech, and form. | Vocabulary | Rule 1.2, Rule 1.3, Rule 1.4 | Part 1, Section 1 |
| G-03 | Use necessary technical nouns and verbs accepted by the relevant organization or field. | Vocabulary | Rule 1.5, Rule 1.8, Rule 1.12 | Part 1, Section 1 |
| G-04 | Use one term for one item. Do not alternate between synonyms. | Vocabulary | Rule 1.11 | Part 1, Section 1 |
| G-05 | Avoid slang, jargon, regional wording, idioms, and phrasal verbs. | Vocabulary | Rule 1.10, Rule 9.3 | Part 1, Sections 1 and 9 |
| G-06 | Use American English spelling unless an official requirement specifies otherwise. | Vocabulary | Rule 1.14 | Part 1, Section 1 |
| G-07 | Rewrite the sentence when a word-for-word substitution is not clear. | Vocabulary | Rule 9.1 | Part 1, Section 9 |
| G-08 | Keep multi-word nouns to three words or fewer. | Nouns | Rule 2.1 | Part 1, Section 2 |
| G-09 | When an official term is longer, write it in full first. Then define a clear short form or use hyphens to mark words that function as one unit. | Nouns | Rule 2.2, Rule 8.2 | Part 1, Sections 2 and 8 |
| G-10 | Prefer prepositions or relative clauses to long noun stacks. | Nouns | Rule 2.2 | Part 1, Section 2 |
| G-11 | Use `a`, `an`, `the`, `this`, or `these` where needed. | Nouns | Rule 4.5 | Part 1, Section 4 |
| G-12 | Use active voice and name the actor. | Verbs | Rule 3.6 | Part 1, Section 3 |
| G-13 | Use a verb to express an action, not an abstract noun phrase. | Verbs | Rule 3.7 | Part 1, Section 3 |
| G-14 | Use only the infinitive, imperative, simple present, simple past, simple future, and permitted past-participle forms. | Verbs | Rule 3.2, Rule 3.3 | Part 1, Section 3 |
| G-15 | Avoid complex auxiliary constructions. | Verbs | Rule 3.4 | Part 1, Section 3 |
| G-16 | In descriptive text, use passive voice only when the actor is unknown. | Verbs | Rule 3.6 | Part 1, Section 3 |
| G-17 | Use an `-ing` form only as an accepted technical noun or modifier in a technical noun. | Verbs | Rule 3.5 | Part 1, Section 3 |
| G-18 | Write complete, direct sentences. Do not use contractions or omit necessary words. | Sentences and lists | Rule 4.1, Rule 4.2 | Part 1, Section 4 |
| G-19 | Put one main idea in each sentence. | Sentences and lists | Rule 4.1 | Part 1, Section 4 |
| G-20 | Use a vertical list for several conditions, items, or actions. | Sentences and lists | Rule 4.3 | Part 1, Section 4 |
| G-21 | Use explicit connecting words when the relation between sentences is not clear. | Sentences and lists | Rule 4.4 | Part 1, Section 4 |
| G-22 | Do not use semicolons. | Sentences and lists | Rule 8.1 | Part 1, Section 8 |
| G-23 | Use no more than 20 words in a sentence. | Procedures | Rule 5.1 | Part 1, Section 5 |
| G-24 | Put one instruction in each sentence, except when actions occur simultaneously. | Procedures | Rule 5.2 | Part 1, Section 5 |
| G-25 | Begin an instruction with an imperative verb: `Remove`, `Install`, `Measure`. | Procedures | Rule 5.3 | Part 1, Section 5 |
| G-26 | Put a necessary condition before the command and separate it with a comma. | Procedures | Rule 5.4 | Part 1, Section 5 |
| G-27 | Use notes for information only. Do not put instructions in notes. | Procedures | Rule 5.5 | Part 1, Section 5 |
| G-28 | Use no more than 25 words in a sentence. | Descriptions | Rule 6.3 | Part 1, Section 6 |
| G-29 | Give information gradually, from general context to specific detail. | Descriptions | Rule 6.1 | Part 1, Section 6 |
| G-30 | Give each paragraph one topic and no more than six sentences. | Descriptions | Rule 6.5, Rule 6.6 | Part 1, Section 6 |
| G-31 | Repeat key terms when repetition prevents ambiguity. | Descriptions | Rule 6.2 | Part 1, Section 6 |
| G-32 | Identify the risk level with the approved signal word or symbol. | Safety instructions | Rule 7.1 | Part 1, Section 7 |
| G-33 | In ASD usage, a **warning** identifies risk of injury or death. A **caution** identifies risk of damage to objects. | Safety instructions | Rule 7.1 | Part 1, Section 7 |
| G-34 | Start with a clear command or condition. | Safety instructions | Rule 7.2 | Part 1, Section 7 |
| G-35 | State the hazard or possible result explicitly. | Safety instructions | Rule 7.3 | Part 1, Section 7 |
| G-36 | each instruction has one clear action. | Final check | Rule 5.2 | Part 1, Section 5 |
| E-04 | each pronoun has one clear referent. | Final check |  | Our editorial check. Issue 9 has no numbered pronoun rule. |
| G-37 | each item has one consistent name. | Final check | Rule 1.11, Rule 9.4 | Part 1, Sections 1 and 9 |
| G-38 | sentence and paragraph limits are met. | Final check | Rule 5.1, Rule 6.3, Rule 6.6 | Part 1, Sections 5 and 6 |
| G-39 | safety consequences are explicit. | Final check | Rule 7.3 | Part 1, Section 7 |
| E-05 | units, identifiers, labels, quotations, and technical facts are unchanged. | Final check |  | Our editing-safety check, not a writing rule |
| E-06 | no simplification creates ambiguity. | Final check |  | Our editing-safety check, not a writing rule |
