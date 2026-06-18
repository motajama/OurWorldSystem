# Future Data Pipeline

The first scaffold has no data pipeline. It uses checked-in mock JSON under `static/data/`.

Future pipeline stages should be reproducible and static-output oriented:

1. Fetch or manually stage public source datasets.
2. Normalize country, territory, and map-unit identifiers.
3. Preserve source years, licenses, and download metadata.
4. Transform indicators into documented intermediate tables.
5. Run model versions that emit classes, scores, confidence, and explanations.
6. Validate schema and missing-data handling.
7. Write final static JSON to `static/data/`.

The pipeline should avoid proprietary APIs, tracking services, and closed datasets unless explicitly approved for a separate optional workflow.
