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
- D3 and TopoJSON for local geometry rendering
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

## Build

```sh
npm run geo:build
npm run check
npm run build
```

The production build is emitted to `build/` and is configured for a GitHub Pages repository path of `/OurWorldSystem`.

## Preview

```sh
npm run preview
```

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

Natural Earth properties are source metadata for geometry, not stable application identities. Some Natural Earth features use placeholder codes such as `-99`, and those values must never be used as semantic map-unit IDs. OurWorldSystem therefore keeps a separate map-unit registry in `static/data/map-units.registry.json`. The registry provides stable neutral IDs, display names, Natural Earth aliases, external dataset IDs, recognition-status notes, and review dates.

Mock world-system indicators in `static/data/world-system.latest.json` join through registry IDs where available. Disputed and special cases such as Palestine, Taiwan, and Kosovo are kept as neutral map units with notes and source aliases; the atlas does not merge them into other records or decide sovereignty disputes. Missing registry entries do not block map rendering: unmatched Natural Earth features are shown as neutral `no_data` map units until the registry and indicator data are expanded.

The default thematic view is **World-system position**, which summarizes the current mock model output. The map can also switch to criterion layers for war/conflict, press freedom, political freedom, quality of life, extraction/externalization, and ecology. These layers are defined in `src/lib/mapLayers.ts`; each layer has a stable ID, label, description, binning rule, legend items, and explicit no-data category. Future real indicators should populate the existing JSON fields or generated equivalents, then reuse the same layer API for map coloring and legends.

Missing data is always displayed as `No data`. Null, undefined, or absent indicator values are not converted to zero and are not treated as neutral or average conditions.

Most current criterion-layer values are mock/demo values only. The quality-of-life layer can now use real World Bank WDI data when the generated static indicator file is present. The conflict layer can use UCDP country-year and UCDP/PRIO state-based armed-conflict data when `conflict.ucdp.latest.json` is present. Real UCDP records override demo conflict flags; unmatched map units remain no-data or visibly demo-only.

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

Future data pipelines should generate static JSON from public sources such as OECD, UN, UCDP, RSF, V-Dem, Freedom House, World Bank, UNDP, UNEP, and related open datasets.

Validate registry and mock-data joins with:

```sh
npm run validate:data
```

## Documentation

- `docs/methodology.md`
- `docs/data-schema.md`
- `scripts/README.md`
