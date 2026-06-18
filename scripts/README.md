# Future Data Pipeline

The first scaffold has a small geometry pipeline and checked-in mock indicator JSON under `static/data/`.

## Registry Validation

Run:

```sh
npm run validate:data
```

This checks `static/data/map-units.registry.json` and `static/data/world-system.latest.json`.

The map-unit registry exists because geometry source properties are not stable application identities. Natural Earth provides geometry and helpful aliases, but codes such as `ISO_A3` or `ADM0_A3` can be `-99`, and `-99` is not unique. The validation script rejects `-99` as a registry or mock indicator ID and rejects Natural Earth alias arrays that contain only `-99`.

Future data import scripts should normalize public datasets into registry IDs before writing frontend JSON. Use source identifiers such as ISO-3, UN M49, World Bank, OECD, and documented manual crosswalks for disputed or special map units. Do not use geometry as political recognition, and do not merge disputed records simply to satisfy a source dataset.

## Geometry Pipeline

Run:

```sh
npm run geo:build
```

This downloads Natural Earth source archives into `data/raw/natural-earth/` and writes generated TopoJSON to `static/geo/`.

- `static/geo/world.topojson` comes from Natural Earth Admin 0 countries at 110m scale.
- `static/geo/disputed.topojson` comes from Natural Earth breakaway/disputed areas at 50m scale when that optional archive is available.

Natural Earth Admin 0 countries are used primarily as de facto boundaries for small-scale web rendering. The disputed/breakaway layer is rendered separately. Geometry is not political recognition, and the pipeline must not hard-code sovereignty judgments.

## Indicator Pipeline

Future pipeline stages should be reproducible and static-output oriented:

1. Fetch or manually stage public source datasets.
2. Normalize country, territory, and map-unit identifiers.
3. Preserve source years, licenses, and download metadata.
4. Transform indicators into documented intermediate tables.
5. Run model versions that emit classes, scores, confidence, and explanations.
6. Validate schema and missing-data handling.
7. Write final static JSON to `static/data/`.

The pipeline should avoid proprietary APIs, tracking services, and closed datasets unless explicitly approved for a separate optional workflow.
