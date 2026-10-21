# Publication audit

## Publication preparation update — 2026-10-21

This update supersedes the release blockers and delivery status in the historical
audit below. It covers the current `publish-prep` checkout after the v0.4 merge;
it is not a repeat of the earlier full-history secret audit.

- Restored the complete standard MIT warranty/liability paragraph with
  `Copyright (c) 2026 HAGINO`. Map attribution is now separate in `NOTICE`.
- Added OSM-derived GeoJSON/building/engine geometry attribution, ODbL 1.0 and
  copyright links. GSI terrain credits identify `dem5a_png` (DEM5A, 5 m) and
  fallback `dem_png` (DEM10B, 10 m), exactly as used by `tools/fetch_terrain.py`.
  Source: [GSI tile list](https://maps.gsi.go.jp/development/ichiran.html).
- Default/sol and promotion pages in both asset trees now show linked OSM and
  GSI credits. Both 2D templates include these credits and use the canonical
  `https://tile.openstreetmap.org/{z}/{x}/{y}.png` endpoint, per the
  [OSM tile policy](https://operations.osmfoundation.org/policies/tiles/).
  No tile prefetching or download cache was introduced.
- `NOTICE` credits vendored three.js under MIT; full third-party MIT license
  copies accompany both vendor directories. Existing screenshots in `docs/`
  and the existing documentation landing page were preserved.
- Both READMEs prominently explain fictional residents, simulated stores,
  sales and promotion coefficients, including fictional Hidamari Coffee.
  OSM place-name labels are source context, not real business behavior.
  The English README mirrors the promotion section. Video placeholders and
  the future Pages URL explicitly refer to after publishing.
- `tools/build_pages.py` builds `_site` (or `--out DIR`): bilingual landing page,
  default 3D, promotion 2×2, 2D, bundled vendor assets and precomputed model JSON
  for both supported map areas. Builds force LLM off, use fixed seeds, and make
  no network requests. Local assets use relative URLs under any hosting subpath.
  The 2D viewer still needs external Leaflet and OSM tile services; 3D needs WebGL.
- `.github/workflows/pages.yml` triggers only on `workflow_dispatch`, uploads a
  Pages artifact and deploys it. It must be run only after the repository is public
  and Pages is enabled with GitHub Actions. No settings were changed or workflow run.

Validation: `uv run --with pytest pytest -q` passed **35 tests**, including an
actual static build and checks that relative HTML/module/fetch references stay
inside the export and resolve, with both area suffixes expanded. Standalone build
also succeeded at `/tmp/asagaya-pages-check`. `node --check` passed for all **12**
`.mjs` files. `git diff --check` passed. The default uv cache was read-only and
network dependency resolution was unavailable; validation used a writable copy of
existing cached dependencies (`UV_CACHE_DIR=/tmp/asagaya-uv-cache`, `UV_OFFLINE=1`).

No commit, staging, push, visibility change, Pages activation or deployment was
performed. Future publication remains a separate owner action. Review external
service policies again when hosting; the demo video still needs uploading.

## Historical audit (retained for context)


Audit date: 2026-10-21. Repository: `haginot/asagaya-town-sim`. Owner: HAGINO. Scope: local checkout and all locally reachable Git history before this documentation commit. No remote inspection, publication, push, or deployment was performed.

## Decision

**Safe to publish: yes-after-fixes.** No apparent leaked credentials or private personal records were found. Before release, resolve the abbreviated license text and map attribution issues below. Before hosting the exported map viewer, also update its tile endpoint and check the service policy. These are release blockers rather than evidence of leaked personal data. Required source changes were not made because this task permits documentation edits only.

## Coverage and method

- The initial working tree was clean: 19 files, including four PNG screenshots; no ignored or untracked content was reported by `git status --ignored --short`. All files outside `.git` were inventoried, including hidden files.
- Read `README.md`, `pyproject.toml`, the source modules and templates, prototype, and tests. Examined the GeoJSON structure and all property fields: 410 streets and 544 POIs; property keys are `kind`, `highway`, `name`, `cat`, `id`, and `node`.
- Examined `git log -p --all`: 1,526 lines spanning both reachable commits, `bebdcaef246940bf58f0554a5d4663bf24e682b7` and `6f81e7685c30cbc37728a122a3f499abac442e2f`. Reviewed commit author/committer metadata separately.
- Ran `git grep` across every revision returned by `git rev-list --all`, searching credential, contact, private-path, and sensitive-record indicators. Supplemented it with Python regex scans of every historical text blob, current file bytes, and the complete patch, covering email addresses, telephone patterns, common token formats, credential assignments, private home paths, address terms, and health/financial terms. Numeric identifiers and coordinates were assessed in their map/model context.
- Visually reviewed all four screenshots; checked PNG ancillary chunks for embedded metadata (none found). The same image blobs occur in both commits.
- Generic placeholders, environment-variable names, local URLs, API endpoints, package-version syntax, public map names, and synthetic resident attributes were distinguished from actual secrets and personal records.

This is a bounded inspection of the available checkout and reachable refs, not proof that undisclosed remote refs, unreachable objects, or future files are clean. `.git` operational configuration is not release content; reachable object contents and commit identities were included.

## Findings

| Location | Severity | Real vs fixture | Finding and action |
| --- | --- | --- | --- |
| `LICENSE:9` | Medium | Real license text | Existing file is labeled MIT but abbreviates the usual warranty and liability paragraph. Preserve it for this task as instructed; have the owner confirm and restore the intended standard text before release. |
| `src/asagaya_town_sim/template.html:20,31`; `prototype/template.html:11`; `docs/map_baseline.png`, `docs/map_alt_cafe.png`, `docs/map_event.png` | Medium | Real public map content | Credit is visible, but template attribution is plain text without an OpenStreetMap copyright/license link. Add the link to exported viewers before release; retain screenshot attribution and supply accompanying license context when redistributing screenshots. The new English README and landing page supply that context for this repository. |
| `src/asagaya_town_sim/template.html:31`; `prototype/template.html:11` | Medium for hosted demo | Real external service dependency | Tile URLs use a subdomain placeholder. Current OSM policy specifies the canonical endpoint without that placeholder. Update both templates before hosting; preserve browser Referer/caching behavior and avoid bulk tile downloads. |
| `src/asagaya_town_sim/data/asagaya_osm.geojson:1` | Informational | Real public geography | Roads, named businesses/institutions, geographic coordinates, and OSM identifiers. No contact/address fields or private resident records found. These are public map locations, not invented fixtures; keep ODbL attribution. Some place names contain surnames but identify mapped establishments, not private user accounts. |
| `src/asagaya_town_sim/model.py` (`PERSONAS`, `rule_plan`, `Sim.run`); `prototype/sim.py` (`make_agents`) | Informational | Synthetic model data | Generic demographic groups, randomly assigned road-node homes, numbered residents, and hypothetical clinic visits. No real household, medical, financial, or observed mobility records found. Keep the toy-model disclaimer prominent. |
| `tests/test_model.py:105–107` | None | Explicit test fixture | Credential value is `dummy`; the loopback endpoint intentionally fails. Not an exposed API credential. |
| `src/asagaya_town_sim/llm.py:15–25,44–45`; `README.md:33` | Informational | Configuration, not secret values | Environment references only; no actual key found. Cache paths use the user's home dynamically, with no embedded personal name. |
| Author/committer metadata in both audited commits | Informational | Generic local identity | HAGINO and a local-only email identifier; no routable personal email found. Owner name is the public identity supplied for this task. |
| `src/asagaya_town_sim/llm.py:37–52,57–101` | Low operational concern | Real optional integration; synthetic prompts | A configured key activates provider requests automatically, potentially incurring charges. Fictional persona/schedule prompts and reviews are cached locally. Use `--no-llm` for reproducible release exports; never package API keys or personal cache contents. |

No high/critical secret findings, real telephone numbers, private named home paths, residential address records, or personal health/financial records were identified. Broad matches involving `server_address`, CSS class names, decorators, and CDN package versions were false positives.

## License

The existing `LICENSE` was kept byte-for-byte: MIT-labeled code license, `Copyright (c) 2026 HAGINO`, plus an ODbL map-data notice. No new license or copyright holder was substituted. Its abbreviated disclaimer is a release issue pending owner correction. Map data remains separately under [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/), © OpenStreetMap contributors. Added documentation links directly to the data license and [OSM attribution guidance](https://www.openstreetmap.org/copyright).

## Hosted trial and external dependencies

**Hosting: GitHub Pages.** A hosted trial makes sense as a precomputed, browser-playable viewer. `build --no-llm` embeds results into HTML and exports summary JSON; the server only serves files. [GitHub Pages supports static HTML, CSS, and JavaScript](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages). It cannot run Python simulations or accept new simulation settings server-side. No functions or server runtime are needed for the precomputed viewer.

`docs/index.html` did not previously exist, so it is now a self-contained English introduction with inline CSS and no scripts. It is not a live simulation. No hosted URL has been verified or activated. After resolving blockers, a future separately authorized hosting task could place generated viewer assets in a subdirectory and link them from the landing page. That generated content is outside this task's edit scope.

The viewer loads Leaflet 1.9.4 from a CDN and map tiles from OSM. Internet access and those services' availability are required; the Python rule-based simulation itself needs neither. Follow the [OSM tile policy](https://operations.osmfoundation.org/policies/tiles/) for the endpoint, visible attribution, caching, Referer, and traffic limits. Public hosting should be reviewed against the then-current policy; no claim of hosting compliance is made here.

The OpenAI-compatible API integration is optional. There is no mandatory proprietary API dependency: `--no-llm` uses the standard-library rule-based model. Provider terms, credential handling, and costs apply if enabled. No additional proprietary-data or access-control dependency was found in the inspected files. The prototype downloads OSM data separately; preserve source attribution and review applicable service policies if rerunning that download.

## Validation and local delivery

Only `README.en.md`, `docs/index.html`, and this audit were created. `LICENSE` was inspected and preserved. Source, tests, configuration, and lockfiles were not edited. Documentation validation checks HTML structure, relative file targets, whitespace, and a small offline CLI/export run using temporary output outside the repository. The full test suite is unnecessary for these documentation-only changes.

Attempted `git add README.en.md LICENSE docs/index.html PUBLISH_AUDIT.md` before the requested commit, but Git could not create its index lock: the linked worktree metadata resides on a read-only filesystem. Staging failed and no commit was created. The three new documents remain untracked. Requested commit message: `docs: publish-prep (English README, license, landing page, audit)`. A writable Git metadata directory is required to finish the local commit. No remote changes were performed.
