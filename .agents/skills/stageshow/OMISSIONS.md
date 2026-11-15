# Omissions in TUIFT Code

This copy of Stageshow (MIT, see `LICENSE`; upstream `benjitaylor/skills`, folder `stageshow`, commit 299140f) leaves out material whose redistribution the upstream `NOTICE.md` does not grant:

- **App icons.** The upstream `assets/app-icons.ts` held artwork taken from app bundles ("not covered by the Stageshow MIT license"). It is replaced here by a file with the same export names (`mail`, `calendar`, `testFlight`, `slack`, `figma`, `notion`) holding neutral rounded-square placeholders. The demos in `examples/bento`, `examples/parts` and `examples/phones` still run with them. To show a real app icon, replace the value with an icon you are allowed to use.
- **Official brand assets.** `kit/brands/` no longer carries Linear, American Express (`amex`, `amex-tile`) or USDC artwork: `SOURCES.md` describes them as official assets subject to the owners' brand usage terms. The `linear`, `amex` and `usdc` brand keys are gone from `kit/brands/index.ts`. Use `<BrandMark name="..." src="..." />` with a mark you have the right to use.

Kept: the brand SVGs whose source repository licence ships in `kit/brands/` (SVGL MIT, payment-icons Apache-2.0, Cryptocurrency Icons CC0, Simple Icons CC0) and the two CC0 photographs of `examples/wikipedia/` (see `examples/wikipedia/PHOTOS.md`). Those licences cover the files as published by those repositories; the marks themselves remain the property of their owners, as `NOTICE.md` says. Check each brand's usage rules before using a mark in a published design.
