# Future Data Pipeline

The first scaffold has a small geometry pipeline and checked-in mock indicator JSON under `static/data/`.

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
