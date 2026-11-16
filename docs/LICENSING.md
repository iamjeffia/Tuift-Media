# Licensing

TasteCode is licensed under the Apache License 2.0. The root
[LICENSE](../LICENSE) file contains the complete license terms.

## Copyright

Copyright is held by the TasteCode contributors. Individual contributions remain attributed
through the Git history and [CREDITS.md](../CREDITS.md).

## Release obligations

Before publishing each desktop build:

1. Generate and review the production dependency license inventory.
2. Update [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md) when dependencies or required
   notices change.
3. Bundle the root license and all required third-party license texts with the application.
4. Review provider terms and trademarks separately from the source-code license.
5. Publish release artifacts with SHA-256 checksums.

The After Effects MCP server is the one part of the installer that is neither an npm dependency of
this repository nor a default skill: it is a pinned release of its own MIT-licensed repository
(`packages/after-effects-mcp/server.json`), shipped as files in `resources/after-effects-mcp`
with its `LICENSE`, `NOTICE.md` and `THIRD_PARTY_LICENSES.txt`. `pnpm licenses:verify` fails a
bundle on disk that lacks them, and `verify-release-assets` fails an installer whose folder is not
the pinned release.

The Design pack's Agent Skills (`packages/default-skills`, pack `design`) are third-party files under
their authors' own licences, all MIT. Each is pinned to an exact commit of a public repository, ships
unmodified in `resources/default-skills/packs/design` with the licence file of its source, and is listed
in [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md) with its commit. `design-taste-frontend`, in the
base bundle, is the one skill under two licences: taste-skill's MIT (its `LICENSE`) and Apache-2.0 for the
parts adapted, with changes, from Anthropic's `frontend-design` (`LICENSE-APACHE-2.0` and a `NOTICE`
that says what was adapted and changed, as Apache-2.0 asks of a derivative). A skill is added only when its licence permits redistribution; the Remotion, `transitions-*` and
`21st-*` skills are not, and the installer carries none of them. `sync.js` refuses a pin whose archive or
files differ from the recorded hashes.

Apache-2.0 covers TasteCode source code. It does not grant rights to third-party product
names, logos, provider services, or bundled dependencies beyond their own terms.
