# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Layout: single-context

**This repo is single-context.** One repository shares one domain glossary and one set of architecture decisions. There is no per-package or per-service split.

```
/
├── CONTEXT.md              ← the glossary: this repo's domain vocabulary
├── docs/
│   ├── adr/                ← architecture decision records
│   │   ├── 0001-<slug>.md
│   │   └── 0002-<slug>.md
│   └── agents/             ← the files this skill wrote
└── ...
```

### What this means in practice

- There is exactly **one** `CONTEXT.md`, at the repo root, and exactly **one** `docs/adr/` directory.
- **No `CONTEXT-MAP.md` exists in this layout**, and none should be created. That file is the marker of a multi-context repo; creating it here would falsely advertise per-context glossaries.
- **No per-directory `CONTEXT.md` files.** Do not create `src/<something>/CONTEXT.md` or a `docs/adr/` under a subproject. Architecture decisions that apply anywhere in this repo belong in the root `docs/adr/`.
- If this repo ever grows genuinely separate contexts (independent packages with their own vocabulary), that is the moment to switch layouts — not before.

## Before exploring, read these

- **`CONTEXT.md`** at the repo root: this repo's domain glossary.
- **`docs/adr/`**: read ADRs that touch the area you're about to work in.

If either doesn't exist yet, **proceed silently**. Don't flag its absence; don't suggest creating it upfront, and don't create it yourself as a side effect of unrelated work. The `/domain-modeling` skill (reached via `/grill-with-docs` and `/improve-codebase-architecture`) creates them lazily, the first time a term or a decision actually gets resolved.

**Deliberately deferred:** `CONTEXT.md`, `docs/adr/`, `CONTEXT-MAP.md`, and any subproject `CONTEXT.md` were **not** created at setup time. This file records the intended shape so that the first real glossary entry or ADR lands in the right place. This setup wrote only `docs/agents/*` and the `## Agent skills` block in `AGENTS.md`.

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in `CONTEXT.md`. Don't drift to synonyms the glossary explicitly avoids.

If the concept you need isn't in the glossary yet, that's a signal: either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/domain-modeling`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0007 (event-sourced orders), but worth reopening because…_
