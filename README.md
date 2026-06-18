# OurWorldSystem

OurWorldSystem is an open-source, static-first public-interest atlas of countries and map units in the global world-system. It is intended to visualize structural positions such as core, semi-periphery, periphery, uncertainty, conflict exposure, press freedom, political freedom, quality of life, ecological pressure, and forms of extraction or externalization.

The current app is a first frontend scaffold with mock data only. Classifications are placeholders and must not be interpreted as empirical findings.

## Principles

- World-system classes are model outputs, not moral judgments.
- Every classification should include uncertainty, notes, source references, and source years.
- Disputed or ambiguous sovereignty cases are displayed neutrally as map units.
- The atlas should prefer public, open, reproducible data sources.
- The frontend must run without proprietary map APIs, tracking, analytics, external fonts, or closed-source map tiles.

## Tech Stack

- SvelteKit and TypeScript
- Static GitHub Pages build with `@sveltejs/adapter-static`
- D3 and TopoJSON for future local geometry rendering
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

- `static/data/world-system.latest.json`
- `static/data/sources.json`

Future data pipelines should generate static JSON from public sources such as OECD, UN, UCDP, RSF, V-Dem, Freedom House, World Bank, UNDP, UNEP, and related open datasets.

## Documentation

- `docs/methodology.md`
- `docs/data-schema.md`
- `scripts/README.md`
