# Agent Guidelines

> This file is auto-generated and should be immutable. NEVER edit it by hand.

Rules for assistant work in this project.
Project-specific rules live in `AGENTS.local.md`, `README.md`, and the documents they link.
Read them before starting, and let them take precedence within their scope.
Words `prefer` and `consider` mark defaults that allow task-specific judgment.
Otherwise, follow the general guidelines stated below.

## Language and Internationalization

- Communicate in the user's preferred language, following the current conversation when none is stated.
- Write `AGENTS.md` in English, and use English for code identifiers.
  Keep established technical terms in English where precision benefits.
- Follow the README and design-document language conventions recorded in `AGENTS.local.md`.
- Keep user-facing text translatable through the project's localization mechanism.

## Working Principles

- When recurring cases support a shared rule, state it and suggest the abstraction or convention that follows.
  Distinguish evidence from inference, and favor connections that simplify future decisions.
  Do not invent abstractions merely to claim novelty.
- When replacing a design, update its callers and remove the superseded path in the same change.
  Retain compatibility layers only when the user explicitly requests a compatibility boundary;
  state its scope and intended removal condition.
- When changing validation or behavior with rejection cases, pair valid inputs with rejected counterparts.
  Assert the intended error and relevant failure invariants.
  Retain bug reproducers as regression tests.
- Before reporting a change as complete, run the project's documented build, lint, and test commands,
  and report any failures with their output.
- Commit after each phase of work is done.

## Code Design

Where these rules are silent, follow the language's idioms and the project's existing conventions.

Represent semantic states, internal messages, and errors with domain types.
Parse external text into structured data early; use strings when the data itself is textual.
Before using a string-keyed map, distinguish text storage or interning from structured data better modeled
with records or interfaces.

Prefer declarative transformations such as map, filter, and fold over mutable accumulators.
Keep mutation for essential sequential state or when a functional rewrite would materially harm clarity or performance.

Prefer direct construction of plain data unless a constructor performs additional work,
enforces an invariant, or establishes a visibility boundary.
Do not add a constructor that merely repackages a literal.

Prefer generated implementations when their behavior exactly matches the intended semantics.
Write manual implementations only when additional local invariants require them.

## Project Documentation and Design Records

- Record the project's document layout, file roles, and canonical design location in `AGENTS.local.md`.
- Keep one home per canonical rule, in the document that owns its semantic boundary.
- Outside that home, prefer concise pointers over repeated explanations.
- Keep dependent examples and links consistent with the canonical rule.
- Adopting, changing, or promoting a canonical design requires user permission;
  an approval given earlier in the conversation or recorded in the design record suffices.
- When moving or merging content, remove superseded sections or files and update incoming links in the same change.

## Documentation Style

Keep every README concise. State the purpose, give the reader what they need to get started,
and link to the appropriate home for detailed guidance.

Establish motivation and context before introducing machinery; explain which question each mechanism answers.
Introduce concepts before relying on them, and let information density rise gradually.
Use technical terminology where precise, explaining specialized terms at first use with source-level intuition
or a concrete example.

Connect paragraphs with reasoning that explains the next step, especially before increasing technical detail.
Use connectives that state the actual logical relationship.
Use direct subjects and verbs, and name concrete operations.
Prefer positive explanations. Retain negation that clarifies a live alternative, formal exclusion,
or implementation limit.

Give each paragraph one overarching point.
Develop it through motivation, mechanism, evidence, or consequence; split the paragraph when its question changes.
Use lists or tables for independent inventories.
Let paragraph and sentence lengths follow the argument, avoiding formulaic rhythms and repeated contrastive phrasing.
Use parallel construction when it clarifies a comparison, enumeration, or invariant.

During prose-only revisions, including compression, preserve technical scope, equations, examples,
established terminology, and the short explanations that connect technical facts.
After revising, read the document from beginning to end to check its progression and concept order.

Wrap English prose around 90–120 characters, breaking after sentence or clause punctuation, or before connectives.
Commas count as clause punctuation.
Keep complete sentences together when they fit and allow short final lines.
Preserve code blocks and other structural Markdown.
Use the project's documented reflow command where available.

## Commit Messages

Use `prefix: lowercase description`, on one line with no trailing period.
Describe what changed. For `feat`, name the capability directly; use a leading `add` only when it improves clarity.

| Prefix | When to use |
|--------|-------------|
| `feat` | A capability users did not have before. |
| `incr` | Incremental progress: fixes, polish, tuning, or extensions of an existing capability. |
| `sisy` | Mechanical changes or internal restructuring with no behavior change. |
| `vibe` | Exploratory or prototype work that may be revised or replaced. |
| `repo` | Repository housekeeping, dependencies, migrations, or file reorganization. |
| `docs` | Documentation-only changes, including doc comments and code comments. |
| `test` | Test changes without production code changes. |

Use the prefix of the commit's primary intent.
Split commits whose intents are independent.

## Release Versioning

Follow [Semantic Versioning 2.0.0](https://semver.org/) for every new release.

- For `0.x.x`, agents may choose only a patch increment on their own.
  A minor increment requires explicit user authorization.
- When the current major version is `1` or higher, default to a patch increment.
  Agents may choose a minor increment when the scope of the changes warrants one under SemVer.
- A major increment always requires explicit direction from the user.
