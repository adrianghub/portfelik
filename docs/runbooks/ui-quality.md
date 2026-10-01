# UI quality checks

Run from `apps/web-svelte` using the repository's pinned pnpm version.

## Browser matrix

`pnpm test:e2e:matrix` checks the product screens, keyboard focus, horizontal
and bottom-navigation visibility, and axe WCAG AA results. Install all engines
first with `pnpm exec playwright install chromium firefox webkit`.

The projects cover Chrome at 320 px, 390 px, phone landscape, tablet and desktop,
plus Firefox desktop and WebKit desktop/mobile. The six offered accent presets
are checked separately. The product currently offers a dark theme; system light
preference must not switch it to an incomplete light theme.

Browser device emulation does not validate an installed native wrapper, virtual
keyboard, physical gestures, notch/safe-area hardware or Google OAuth consent.
Check those on a supported physical Android/iOS device before changing release
channel to public beta. Include installed PWA launch, update, offline feedback,
back navigation, and a form with the keyboard open.

## Critical flows with a real database

Start the local Supabase stack, then run `pnpm test:e2e:local`. The runner gets
local keys from CLI status and rejects all non-loopback URLs. Every test creates
random, explicitly tracked accounts. Cleanup removes only their own groups and
accounts. The service key is available to the test process, never as a PUBLIC
web environment variable. Do not reuse these fixtures on staging or production.

Do not run this dev server alongside another app build or mocked dev server:
SvelteKit's generated environment modules share one directory. CI separates
these suites into isolated jobs.

## Visual baselines

`pnpm test:e2e` checks approved screenshots. Update them only after inspecting
the rendered result with `pnpm exec playwright test visual-regression.spec.ts
--update-snapshots`. Commit both macOS and Linux baselines; CI runs Linux.
Keep dates and mock data fixed, include empty/error states and open overlays,
and verify desktop table actions independently of mobile cards.

## Performance and privacy

Measure production builds with fixed data, viewport, network and CPU settings.
Compare several cold runs. Include opening/searching a multi-thousand-row
history and loading the lazy chart. Lab results do not replace real-user
LCP/CLS/INP collected after deployment.

With `PUBLIC_PLAUSIBLE_DOMAIN` configured, the app records bounded route classes,
LCP/CLS/INP and sampled endpoint class/duration. It sends no URL parameters,
entity identifiers, invite tokens, referrers, bank descriptions or amounts.
Telemetry failure must not interrupt a financial action.
