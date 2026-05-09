# ADR 0004 — Paraglide v2 instead of i18next

**Status:** Accepted (2026-04, Phase 3)

## Context

The legacy app used `i18next` + `react-i18next` + `LanguageDetector`. Polish-only — never two languages, but the runtime overhead and dynamic key lookups still applied. The dictionary was ~200 keys in `pl.json`.

Migrating to SvelteKit, we needed an i18n choice. The problem statement was short: one language, lots of keys, type-safety would be nice, runtime cost should be ~zero, must work with `adapter-static`.

## Decision

**Use Paraglide v2** as a pure Vite plugin (no SvelteKit adapter). Compile `messages/pl.json` to TypeScript at build time. Import message functions from `$lib/paraglide/messages`:

```ts
import * as m from "$lib/paraglide/messages";
// ...
m.push_banner_text();
m.common_close();
```

A recompile is **mandatory** after every edit to `pl.json`:

```sh
pnpm exec paraglide-js compile --project ./project.inlang --outdir ./src/lib/paraglide
```

`svelte-check` reads the generated `.ts`, not the JSON, so new keys are invisible to type-check until the recompile runs.

## Consequences

**Good**

- Effectively zero runtime overhead. Each `m.foo()` is a function returning a constant string; nothing is parsed at runtime, nothing is fetched.
- Full type-safety on message keys. `m.does_not_exist()` is a TypeScript error.
- Tree-shakeable. Only used messages end up in the bundle.
- Works perfectly with `adapter-static` (no runtime locale detection needed; we compile only `pl`).

**Bad**

- The recompile step is a real foot-gun. Several Phase 5 sessions hit "missing message" errors that vanished after recompile. Captured in `CLAUDE.md` and `feedback_paraglide_recompile.md`.
- Adding a second language is no longer "translate the JSON" — it is "translate the JSON, regenerate, fix every untranslated key the type-checker now flags". Acceptable for our reality (PL only) but a real cost if priorities change.

**Neutral**

- The `pl.json` file shape is interchangeable with i18next's, so a swap-back would be local.

## Alternatives considered

- **Stay on i18next.** Possible but pointless — it ships ~30KB of runtime that does nothing for a single-locale app, and gives up type-safety.
- **`svelte-i18n`.** Closer to i18next in shape, runtime-based, no compile-time codegen.
- **Inline strings, no i18n at all.** Tempting given PL-only, but the legacy app's `pl.json` already exists and is referenced by the few Polish-language Edge Function notification bodies. Keeping a dictionary preserves a single point of editing.
