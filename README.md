# OurWorldSystem

OurWorldSystem is an open-source, static-first public-interest atlas of countries and map units in the global world-system. It is intended to visualize structural positions such as core, semi-periphery, periphery, uncertainty, conflict exposure, press freedom, political freedom, quality of life, ecological pressure, and forms of extraction or externalization.

The current app uses real static Natural Earth geometry with mock indicator data. Classifications are placeholders and must not be interpreted as empirical findings.

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

Geometry lives in:

- `static/geo/world.topojson`
- `static/geo/disputed.topojson` when the optional Natural Earth disputed/breakaway layer is available

The base geometry is Natural Earth Admin 0 countries at 110m scale. This layer is rendered primarily as de facto control boundaries. Disputed and breakaway areas are handled as a separate subtle overlay when available. This geometry choice does not imply political recognition or a sovereignty position.

Natural Earth properties are source metadata for geometry, not stable application identities. Some Natural Earth features use placeholder codes such as `-99`, and those values must never be used as semantic map-unit IDs. OurWorldSystem therefore keeps a separate map-unit registry in `static/data/map-units.registry.json`. The registry provides stable neutral IDs, display names, Natural Earth aliases, external dataset IDs, recognition-status notes, and review dates.

Mock world-system indicators in `static/data/world-system.latest.json` join through registry IDs where available. Disputed and special cases such as Palestine, Taiwan, and Kosovo are kept as neutral map units with notes and source aliases; the atlas does not merge them into other records or decide sovereignty disputes. Missing registry entries do not block map rendering: unmatched Natural Earth features are shown as neutral `no_data` map units until the registry and indicator data are expanded.

Future data pipelines should generate static JSON from public sources such as OECD, UN, UCDP, RSF, V-Dem, Freedom House, World Bank, UNDP, UNEP, and related open datasets.

Validate registry and mock-data joins with:

```sh
npm run validate:data
```

## Documentation

- `docs/methodology.md`
- `docs/data-schema.md`
- `scripts/README.md`
