# OurWorldSystem

OurWorldSystem is an open-source, static-first public-interest atlas of countries and map units in the global world-system. It is intended to visualize structural positions such as core, semi-periphery, periphery, uncertainty, conflict exposure, press freedom, political freedom, quality of life, ecological pressure, and forms of extraction or externalization.

The current app uses real static Natural Earth geometry, mock world-system demo data, an initial real World Bank WDI quality-of-life indicator pipeline, and a first UCDP conflict indicator pipeline. Mock classifications remain placeholders and must not be interpreted as empirical findings.

## Principles

- World-system classes are model outputs, not moral judgments.
- Every classification should include uncertainty, notes, source references, and source years.
- Disputed or ambiguous sovereignty cases are displayed neutrally as map units.
- Geometry is not political recognition, and the atlas does not adjudicate sovereignty.
- The atlas should prefer public, open, reproducible data sources.
- The frontend must run without proprietary map APIs, tracking, analytics, external fonts, or closed-source map tiles.

## Tech Stack

- SvelteKit and TypeScript
- Static GitHub Pages build with `@sveltejs/adapter-static`
- D3 and TopoJSON for local geometry rendering and interactive SVG map navigation
- Natural Earth base geometry generated at build time with Mapshaper
- Static JSON data under `static/data/`

## Install

```sh
npm install
```

## Development

```sh
npm run dev
```

Local development is served at:

```text
http://127.0.0.1:5173/
```

## Build

```sh
npm run geo:build
npm run registry:seed
npm run health:data
npm run validate:data
npm run check
npm run build
```

The production build is emitted to `build/` and is configured for a GitHub Pages repository path of `/OurWorldSystem`.

## Preview

```sh
npm run preview -- --host 127.0.0.1
```

Because production uses the GitHub Pages base path, preview the built site at:

```text
http://127.0.0.1:4173/OurWorldSystem/
```

## GitHub Pages

The app is static and GitHub Pages compatible. The SvelteKit base path is `''` in development and `/OurWorldSystem` in production.

This repository uses the GitHub Pages branch-source deployment model:

- Source: `Branch`
- Branch: `gh-pages`
- Folder: `/ root`

The deployment workflow is `.github/workflows/deploy-gh-pages.yml`. On a push to `main`, or a manual `workflow_dispatch`, it runs:

```sh
npm ci
npm run geo:build
npm run registry:seed
npm run health:data
npm run validate:data
npm run check
npm run build
```

It then copies `build/` into a temporary git repository, adds `.nojekyll`, commits the static output, and force-pushes that output to the `gh-pages` branch with `GITHUB_TOKEN`. GitHub Pages publishes the root of that branch. The workflow does not use the GitHub Pages Actions-source deploy path.

## Data

Mock frontend data lives in:

- `static/data/map-units.registry.json`
- `static/data/world-system.latest.json`
- `static/data/sources.json`
- `static/data/source-manifest.json`

The first real public indicator output lives in:

- `static/data/indicators/quality-of-life.world-bank.latest.json`
- `static/data/indicators/conflict.ucdp.latest.json`

Geometry lives in:

- `static/geo/world.topojson`
- `static/geo/disputed.topojson` when the optional Natural Earth disputed/breakaway layer is available

The base geometry is Natural Earth Admin 0 countries at 110m scale. This layer is rendered primarily as de facto control boundaries. Disputed and breakaway areas are handled as a separate subtle overlay when available. This geometry choice does not imply political recognition or a sovereignty position.

The main map is an interactive SVG map with D3 zoom and pan controls, mouse wheel or trackpad zoom, drag panning, and keyboard shortcuts for focused map navigation. It does not use external tiles, proprietary map services, tracking, or map API tokens.

The map uses D3 Equal Earth, an equal-area projection, by default. This makes visual comparison of territorial surface areas fairer than compromise or Mercator-like projections. It is still a projection, so shapes and distances remain distorted.

Natural Earth properties are source metadata for geometry, not stable application identities. Some Natural Earth features use placeholder codes such as `-99`, and those values must never be used as semantic map-unit IDs. OurWorldSystem therefore keeps a separate map-unit registry in `static/data/map-units.registry.json`. The registry provides stable neutral IDs, display names, Natural Earth aliases, external dataset IDs, recognition-status notes, and review dates.

After rebuilding geometry, run `npm run registry:seed`. This updates the registry so every Natural Earth Admin 0 base feature has a map-unit registry record. Existing curated records are preserved and enriched only with missing Natural Earth aliases. New generated records are marked `review_status: "needs_review"` and are not political recognition or sovereignty decisions.

Generated registry records are review infrastructure, not finished political geography. Natural Earth geometry can suggest map-unit coverage, aliases, and source codes, but it must not be treated as recognition. Review generated records gradually by checking names, map-unit type, recognition status, external IDs, possible merges with curated records, and neutral sovereignty notes.

Mock world-system indicators in `static/data/world-system.latest.json` join through registry IDs where available. Disputed and special cases such as Palestine, Taiwan, and Kosovo are kept as neutral map units with notes and source aliases; the atlas does not merge them into other records or decide sovereignty disputes. Missing registry entries do not block map rendering: unmatched Natural Earth features are shown as neutral `no_data` map units until the registry and indicator data are expanded.

Disputed and breakaway overlay features are hoverable and clickable. Their labels use the best available Natural Earth name/status properties and a neutral reminder that OurWorldSystem does not adjudicate sovereignty. When an overlay feature has no matching disputed or special registry record, the detail panel opens a synthetic no-data map-unit record sourced to Natural Earth.

The default thematic view is **World-system position**, which summarizes the current mock model output. The map can also switch to criterion layers for war/conflict, press freedom, political freedom, quality of life, extraction/externalization, and ecology. These layers are defined in `src/lib/mapLayers.ts`; each layer has a stable ID, label, description, binning rule, legend items, and explicit no-data category. Future real indicators should populate the existing JSON fields or generated equivalents, then reuse the same layer API for map coloring and legends.

Missing data is always displayed as `No data`. Null, undefined, or absent indicator values are not converted to zero and are not treated as neutral or average conditions.

Most current criterion-layer values are mock/demo values only. The quality-of-life layer can now use real World Bank WDI data when the generated static indicator file is present. The conflict layer can use UCDP country-year and UCDP/PRIO state-based armed-conflict data when `conflict.ucdp.latest.json` is present. Real UCDP records override demo conflict flags; unmatched map units remain no-data or visibly demo-only.

Optional indicator datasets are discovered through `static/data/indicators/index.json`. Entries marked `available: false` are not fetched by the frontend, which prevents normal browser 404 noise for optional outputs such as a not-yet-generated UCDP file. Required base datasets still fail clearly.

The UCDP conflict layer distinguishes organized violence within a map unit's territory from state involvement in state-based armed conflict. `war_on_territory` means the UCDP country-year dataset records organized violence within that map unit's borders in the latest available year. It is not a claim of state responsibility. `involved_in_conflict` means the UCDP/PRIO Armed Conflict Dataset participant fields could be confidently mapped to the map-unit registry for the latest year.

Fatality values are UCDP best estimates for organized violence in the processed layer. They are not adult/child breakdowns and must not be described as complete civilian death counts. Child casualties remain `null`; a later child-casualty layer should use a real source such as UN CAAC or UNICEF.

Fetch World Bank WDI indicators with:

```sh
npm run data:build
```

Fetch only UCDP conflict indicators with:

```sh
npm run data:fetch:ucdp
```

`npm run data:build` downloads both World Bank and UCDP outputs. World Bank raw API responses are stored under `data/raw/world-bank/`; UCDP raw ZIP/CSV files are stored under `data/raw/ucdp/`; generated frontend outputs are written to `static/data/indicators/`. The initial World Bank indicators are life expectancy (`SP.DYN.LE00.IN`), GNI per capita PPP (`NY.GNP.PCAP.PP.CD`), secondary gross enrollment (`SE.SEC.ENRR`), and population (`SP.POP.TOTL`).

`quality_of_life_score` is a transparent temporary visualization score. It requires at least life expectancy and GNI per capita PPP, optionally includes secondary enrollment, and must never be labeled as HDI. Missing World Bank values remain missing and display as `No data`; they are not fabricated or imputed.

The World Bank pipeline joins through `external_ids.world_bank`, `external_ids.iso3`, and registry IDs. Source countries that still do not match the registry are reported, while World Bank aggregate regions are ignored unless the registry explicitly includes them.

Future data pipelines should generate static JSON from public sources such as OECD, UN, UCDP, RSF, V-Dem, Freedom House, World Bank, UNDP, UNEP, and related open datasets.

Validate registry and mock-data joins with:

```sh
npm run validate:data
```

Generate a map-unit coverage report and review-only candidate registry with:

```sh
npm run data:coverage
```

This writes:

- `data/processed/map-unit-coverage.report.json`
- `static/data/generated/map-units.candidates.json`
- `static/data/generated/map-unit-coverage.summary.json`

Generated candidates are not authoritative data. They are Natural Earth-derived review records for missing registry coverage. Review them manually, verify source identity and sovereignty notes, then promote only reviewed records into `static/data/map-units.registry.json`.

Generate a focused review report for records already in the registry with:

```sh
npm run registry:review
```

This reads the registry, Natural Earth TopoJSON, optional World Bank quality-of-life output, and existing seed or coverage reports when present. It prints summary counts, high-priority generated records, possible duplicate/shared-sovereignty groups, and missing external IDs. It also writes `data/processed/registry-review-report.json` for machine-readable review tracking.

Recommended data completion workflow:

1. `npm run geo:build`
2. `npm run registry:seed`
3. `npm run data:build`
4. `npm run data:coverage`
5. `npm run registry:review`
6. Review generated `needs_review` registry records and `static/data/generated/map-units.candidates.json`
7. Manually mark verified registry records with reviewed metadata when appropriate
8. Rerun `npm run health:data`, `npm run validate:data`, `npm run check`, and `npm run build`

Do not fabricate missing indicator values. Keep real public data, mock/demo data, generated registry candidates, and missing data visibly distinct.

## Documentation

- `docs/methodology.md`
- `docs/data-schema.md`
- `scripts/README.md`
