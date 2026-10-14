---
name: church-bulletin-layout-engine
description: Design, implement, and validate a semantic church bulletin layout engine for approved Paju Flower Church content, including A4 print pagination, responsive web rendering, provenance, and preservation checks.
---

# Church Bulletin Layout Engine

## Scope

Use this skill only when a task concerns semantic re-editing, automatic layout planning, A4 pagination, print rendering, or preservation validation for an approved bulletin. It does not replace:

- `pajuflower-web-maintenance` for general website, CSS, SEO, routing, or Vite/Vercel maintenance.
- `church-content-publishing` for source intake, privacy review, approval, duplicate checks, or JSON registration.

Read and follow `AGENTS.md`, the project constitution, `PAJU_FLOWER_WORKFLOW.md`, and `WEBSITE_BRIEF.md` before implementation. Existing user changes are preserved and the current Vite/Vercel architecture remains the baseline.

## Source and approval boundary

1. Treat `content/bulletins.json` as the source of truth. Do not rewrite it merely to support presentation.
2. Inspect the actual schema and generator before defining transformations; do not infer field names from PAGE labels or images.
3. Render only fields and items that have passed the existing publication and approval gates. Never use this skill to approve, publish, or register content.
4. Keep `REFERENCE/` read-only and keep original images, private drafts, source paths, review notes, and approval metadata out of public HTML, `dist/`, Git, and sitemap output.
5. Preserve existing bulletin URLs, canonical URLs, Open Graph data, JSON-LD, sitemap behavior, and sermon relationships unless a separate approved change explicitly requires otherwise.

## Standard pipeline

### A. Data Audit

Inspect the real bulletin JSON, existing approval filters, generator, templates, CSS, and tests. For each output value record its source path, item index when applicable, approval state, and whether its order is significant.

### B. Semantic Normalization

Transform the approved source into an internal `BulletinDocument` without changing the source JSON. Every block and item must have stable provenance:

```text
BulletinDocument
├─ metadata
├─ blocks[]
│  ├─ id
│  ├─ type
│  ├─ priority
│  ├─ preferredFormat
│  ├─ splittable
│  ├─ sourcePaths[]
│  ├─ approvalState
│  ├─ items[]
│  └─ estimatedHeight
├─ relatedSermon
└─ validation
```

Use stable semantic block IDs such as `metadata.identity`, `worship-order`, `sermon-summary`, `church-news`, `worship-schedule`, `prayer-topics`, and `faith-guide`. The exact mapping must be derived from the current JSON. Do not force PAGE 1–4 to remain the final layout.

### C. Editorial Formatting

Choose the representation by meaning, while preserving approved facts, order, and required labels:

- bulletin identity: compact header
- worship order: table based on the actual order fields
- sermon information: one information block linked to the existing sermon route
- church news: title and description list; do not invent ranking or summaries
- worship and service schedules: compact table with rows kept together
- prayer topics: numbered list
- faith guide: dense readable list

Merging is allowed only when source provenance remains traceable and no distinct approved value, order, or meaning is lost. Removing decorative repetition is not permission to delete content.

### D. Layout Planning

Plan for A4 portrait output with compact, paper-like information density. One or two pages is a preferred target, not a hard success condition; three or four pages are acceptable when the content is naturally readable and balanced. Use deterministic block priorities and measured or calibrated block heights. Keep a block intact unless it is explicitly splittable. Long lists and tables may split only between items or rows; do not separate a heading from its content or split an individual item.

Balance columns without changing source order or silently moving content across semantic groups. Prefer the visual density and reading quality of a paper bulletin over a fixed page count. Do not shrink text aggressively, delete content, or invent summaries to reduce page count. A page count above two is not itself an error; report it with measurement evidence. Actual clipping, overlap, horizontal overflow, missing content, or an unsafe page break remains an error.

### E. Rendering

- Print: use A4 page rules, explicit page boundaries, `break-inside: avoid` where appropriate, and overflow-safe tables.
- PC web: present a compact, print-like two-column bulletin while retaining readable type and clear block boundaries.
- Mobile web: switch to one column, prioritize readability, avoid forced tiny text, and prevent tables from overflowing the viewport.

Paper-bulletin principles apply across modes: use tables for worship order and schedules, compact title-and-description groups for news, dense multi-column lists for prayer topics and faith guidance, and a small integrated header instead of repeated large cards. Recreate the paper bulletin's information hierarchy without treating its PAGE 1–4 boundaries as mandatory web sections.

Use the existing template/generator and bulletin-scoped styles. Do not edit generated HTML as the primary source when a template or generator change is available. Do not change sermon or homepage layout as a side effect.

### F. Validation

Validate both content preservation and physical layout:

- provenance coverage: every rendered block/item maps to one or more source paths;
- canonical values: dates, issue numbers, scripture references, names, labels, and descriptions match after only explicitly documented normalization;
- sequence and count: ordered worship rows remain ordered, while unordered collections use an appropriate multiset comparison;
- no omitted, duplicated, unapproved, private, or source-path values in public output;
- existing bulletin routes, SEO metadata, sermon links, homepage, and sitemap remain valid;
- browser or print rendering measures page count, clipping, overlap, column overflow, and heading/content separation.

String equality alone is insufficient for structural transformations. Use a provenance manifest and typed comparisons: ordered sequences for worship order, keyed records for schedules, and multisets only where source order is explicitly non-semantic. Record normalization rules and retain source indexes for auditability.

## Operating boundaries

- Do not introduce a CMS, database, API server, framework replacement, or external layout service.
- Do not modify approval status, register a bulletin, expose private content, or publish source images.
- Do not commit, push, or deploy without separate explicit approval.
- Report confirmed facts, measured results, overflow, and unresolved design decisions separately.

## Required implementation report

When implementation is authorized, report:

1. source-to-block mapping and changed files;
2. formatting and layout decisions;
3. PC, mobile, and print measurements;
4. preservation and privacy validation;
5. test/build/browser results;
6. overflow or unresolved issues;
7. Git and deployment status separately.
