# Local patch: design-taste-frontend (taste-skill, merged with frontend-design)

TUIFT Code ships taste-skill without its picture library. Leon decided on 2026-11-05 that the
bundled skill gives no default images: no stock photographs and no sample pictures, nothing
template-like. Pictures come from the brief and the user's own files, or from the Asset phase of
TUIFT Code's Design mode.

Two parts in `packages/default-skills/skills.json` do this:

- `omit` lists the files that are never bundled: the upstream photo library, the sample photographs
  of the demos and hero templates, the demo icon sets, the objects kit's sample posters
  (`assets/objects/*/fallback*.png`) and sample product specs (`product-render/specs/`), and their
  credits files. Pages and scripts in those folders still ship. The bundled skill holds no picture.
- `patch` lists the upstream files that the files in this folder replace, each with the sha256 of the
  upstream file it was written against:
  - `SKILL.md`: the upstream text plus a section, "In TUIFT Code: no picture library". It also says
    that a product render is built from a spec for the client's own product, and that every object
    a page uses gets its posters made for that page. The place plan,
    the photographs row of the asset table, run steps 3, 5 and 7 now point to the user's own pictures
    and client slots instead of the library, the draft path and stand-ins.
  - `references/photos.md`: the upstream reference without the library, the draft path and the
    `photos.mjs` commands. The rules for placing, showing and crediting pictures are kept.
  - `scripts/photos.mjs`: a stub. It prints where pictures come from and exits 1.

- `add` lists TUIFT Code's own files that sit beside the upstream ones (they must not exist upstream,
  and they carry no hash): `references/direction.md`, `LICENSE-APACHE-2.0` and `NOTICE`.

On 16 Nov 2026 the owner merged this skill with Anthropic's `frontend-design` (Apache-2.0,
anthropics/skills at `1780c5e`), which stopped shipping as a skill of its own. `SKILL.md` builds on the
patched upstream one above: a concept step and a plan review before the deal, the paragraph on the
brief's words, the machine-made defaults in "Never", and a wider description. The rest of
`frontend-design` lives in `references/direction.md`, with a table of the places where its rules and the
kit's differ (the kit's stand). The two licences are carried as `NOTICE` says; keep that file true if
the text changes.

When a pin moves, `sync.js` refuses to build while any patched upstream file differs from its
recorded sha256. Compare the new upstream file with the patch here, carry the patch over, then run
`node scripts/sync.js --update` to record the new hashes.

This README is not bundled.
