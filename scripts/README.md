# Future Data Pipeline

The first scaffold has a geometry pipeline, checked-in mock indicator JSON under `static/data/`, an initial World Bank WDI quality-of-life pipeline, a first UCDP conflict pipeline, a local Atlas of Economic Complexity import for the `productive_complexity` structural component, a World Bank WDI extraction dependency/autonomy component, and a provisional WDI export-structure `productive_capability_proxy`.

## CI Commands

GitHub Actions runs the local, deterministic static build path:

```sh
npm ci
npm run geo:build
npm run registry:seed
npm run health:data
npm run validate:data
npm run check
npm run build
```

`npm run health:data` prints whether required assets exist and reports record counts. CI also runs `validate:data` as the hard gate for schema and join checks.

Required files:

- `static/geo/world.topojson`
- `static/data/map-units.registry.json`
- `static/data/world-system.latest.json`
- `static/data/source-manifest.json`

Optional indicator files under `static/data/indicators/` are validated only when present. Missing UCDP output must not fail CI.

Deployment to GitHub Pages uses `.github/workflows/deploy-gh-pages.yml`. The repository Pages settings should be:

- Source: `Branch`
- Branch: `gh-pages`
- Folder: `/ root`

On pushes to `main`, the workflow builds `build/`, copies it to a temporary git repository, adds `.nojekyll`, and force-pushes the result to `gh-pages` with `GITHUB_TOKEN`. It does not use the GitHub Pages Actions-source deploy workflow.

Current data generation scripts are split by source:

```sh
npm run data:fetch:worldbank
npm run data:fetch:extraction
npm run data:fetch:ucdp
npm run data:import:complexity
npm run data:build:productive-capability
npm run data:build:worldsystem
npm run data:build:worldsystem:structural
npm run data:build
npm run registry:seed
npm run registry:review
npm run data:coverage
```

`data:build` runs the World Bank quality-of-life fetcher, attempts the optional UCDP fetch, and then builds the provisional world-system proxy. UCDP source failures are intentionally non-fatal for `data:build` because the default map layer should still be reproducible from local World Bank data and demo seed records. Run individual fetchers when only one generated output needs to be refreshed.

`data:coverage` does not fetch external data. It compares current static geometry and data files, then writes:

- `data/processed/map-unit-coverage.report.json`
- `static/data/generated/map-units.candidates.json`
- `static/data/generated/map-unit-coverage.summary.json`

The candidate file is review infrastructure only. Generated candidates are not authoritative registry records and must not be used as indicator IDs until manually reviewed and promoted into `static/data/map-units.registry.json`.

`registry:seed` reads `static/geo/world.topojson` and updates `static/data/map-units.registry.json` so Natural Earth Admin 0 base features have registry coverage. It preserves curated fields on matched records, adds missing Natural Earth aliases, and creates generated records marked `review_status: "needs_review"` for unmatched features. It also writes `data/processed/map-unit-registry-seed-report.json`.

`registry:review` reads the registry, Natural Earth TopoJSON, optional World Bank quality-of-life output, and existing seed or coverage reports when present. It prints a non-failing human review report and writes:

- `data/processed/registry-review-report.json`

Use this report to review generated registry entries systematically. Prioritize generated `needs_review` records with placeholder `NE_` IDs, missing external IDs, unknown recognition status, disputed or special map-unit types, unusual Natural Earth TYPE/FCLASS metadata, or sovereignty notes that need neutral wording. Natural Earth geometry is provenance for map coverage only; it is not recognition, and it should never be the sole reason to merge, split, or classify a map unit.

## Registry Validation

Run:

```sh
npm run validate:data
```

This checks `static/data/map-units.registry.json`, `static/data/world-system.latest.json`, and the optional World Bank quality-of-life, World Bank extraction, and UCDP conflict outputs when present.

For a concise inventory, run:

```sh
npm run health:data
```

The map-unit registry exists because geometry source properties are not stable application identities. Natural Earth provides geometry and helpful aliases, but codes such as `ISO_A3` or `ADM0_A3` can be `-99`, and `-99` is not unique. The validation script rejects `-99` as a registry or mock indicator ID and rejects Natural Earth alias arrays that contain only `-99`.

Validation also reports Natural Earth registry coverage and fails if base-geometry coverage falls below 95%. Generated registry records are valid only as `needs_review`; curated records can use `review_status: "reviewed"` or omit the field while retaining `last_reviewed`.

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

The registry seed workflow is provisional. It must not infer `UN member` from Natural Earth `TYPE="Sovereign country"` alone. Generated records give precedence to unrecognized, breakaway, disputed, dependency, and indeterminate Natural Earth classifications; those records remain `needs_review` until manually checked. Natural Earth `-99` placeholder codes are never valid registry or external IDs.

The frontend renders the world with D3 Equal Earth, an equal-area projection that makes territorial area comparison fairer while still distorting shapes and distances.

## World Bank WDI Quality-of-Life Pipeline

Run:

```sh
npm run data:build
```

This calls `scripts/data/fetch-world-bank-wdi.mjs` and fetches the selected World Bank World Development Indicators from:

```text
https://api.worldbank.org/v2/country/all/indicator/{INDICATOR}?format=json&per_page=20000
```

Initial indicators:

- `SP.DYN.LE00.IN`: life expectancy at birth, total (years)
- `NY.GNP.PCAP.PP.CD`: GNI per capita, PPP (current international $)
- `SE.SEC.ENRR`: school enrollment, secondary (% gross)
- `SP.POP.TOTL`: population, total

The script writes raw API responses to `data/raw/world-bank/{indicator}.json`, which is ignored by git. It writes processed output to `data/processed/quality-of-life.world-bank.latest.json` and frontend static output to `static/data/indicators/quality-of-life.world-bank.latest.json`.

The script selects the latest non-null year per country and normalizes World Bank country codes through registry `external_ids.world_bank`, `external_ids.iso3`, then registry `id`. Unmatched source countries are reported in the output instead of being forced into the registry.

World Bank aggregate regions are ignored when they do not exist in the registry. They are listed separately as `ignored_aggregate_regions` so unmatched country counts are useful for registry review.

The generated `quality_of_life_score` is a temporary OurWorldSystem visualization composite, not HDI. It uses:

```text
life_expectancy_score = clamp((life_expectancy - 50) / (85 - 50), 0, 1)
income_score = clamp((ln(gni_per_capita_ppp) - ln(1000)) / (ln(75000) - ln(1000)), 0, 1)
education_score = clamp(secondary_enrollment_gross / 100, 0, 1), if available
```

The score is computed only when life expectancy and GNI per capita PPP are present. Missing World Bank values remain absent and should display as `No data`.

## Provisional World-System Pipeline

Run:

```sh
npm run data:build:worldsystem
```

This calls `scripts/data/build-provisional-world-system.mjs` and writes:

- `static/data/indicators/world-system.provisional.latest.json`

Inputs:

- `static/data/map-units.registry.json`
- `static/data/indicators/quality-of-life.world-bank.latest.json`
- `static/data/indicators/extraction-dependency.world-bank.latest.json`
- `static/data/indicators/productive-capability.world-bank.latest.json`
- `static/data/indicators/productive-complexity.latest.json`
- `static/data/world-system.curated-overrides.json`
- `static/data/world-system.latest.json`

The output is a conservative provisional proxy for the default `world_system` layer. It is not a final Wallersteinian classification. The builder treats existing demo records as UI/demo seeds, applies optional `curated_reviewed` overrides from `static/data/world-system.curated-overrides.json`, and derives other records from available welfare and structural component data.

The previous quality-of-life/GNI-heavy provisional rule overproduced `core`. The stricter interim rule then produced zero derived core records, which was methodologically safer but too flat analytically. The current conservative rule treats quality of life as a welfare proxy, not structural world-system position. Extraction autonomy and low extraction dependency are negative/filter supports: they can corroborate a core claim or block extraction-dependent cases, but they cannot create core status by themselves. The provisional productive capability proxy provides limited positive structural support from export structure, not final productive complexity or value-chain control.

- `core`: for derived records, requires `quality_of_life_score >= 0.88`, `extraction_dependency_score` missing or `<= 25`, `extraction_autonomy_score` missing or `>= 65`, `productive_capability_score >= 70`, productive capability data quality other than `sparse`, and no disputed/special/territory status unless explicitly reviewed in a curated override. Demo seeds cannot create core.
- `semi-periphery`: absorbs mixed or structurally unconfirmed cases, including many high-development map units with incomplete value-chain evidence.
- `periphery`: low welfare proxy, high extraction dependency, or low extraction autonomy unless other structural evidence suggests semi-periphery.
- `uncertain`: insufficient or contradictory signals, including high welfare with high resource dependence or special/territory comparability problems.
- `disputed`: disputed map units without stable comparable data
- `no_data`: missing values

`semi-periphery` is not a residual middle-income category. It is a mixed structural position with both core-like and periphery-like processes. High quality-of-life countries may remain semi-periphery until TiVA/GVC, value-capture, productive-complexity, finance, or geopolitical data are added. A record can have a high continuous proxy score and still be semi-periphery when positive structural evidence is missing. If a legacy demo seed says `core` but lacks a curated override and structural evidence, it is emitted as low-confidence `semi-periphery` with `source: "legacy_demo_seed_reinterpreted"`. The current proxy deliberately under-classifies core rather than over-classifying it and may validly produce zero core records.

Reviewed manual overrides use:

```json
{
	"dataset_id": "world_system_curated_overrides",
	"status": "manual_review_required",
	"records": [
		{
			"id": "USA",
			"world_system": {
				"class": "core",
				"confidence": "medium",
				"source": "curated_reviewed",
				"rationale": "...",
				"reviewed_by": "...",
				"reviewed_at": "YYYY-MM-DD"
			}
		}
	]
}
```

The checked-in file currently has an empty `records` array. Do not add CZE, DEU, USA, or any other map unit unless it has been explicitly reviewed as a structural classification.

Validate it with:

```sh
npm run validate:worldsystem
```

The validator checks schema, registry IDs, uniqueness, classes, score ranges, confidence, source, review status, model status, class distribution, no-data coverage against available World Bank records, and the conservative core rules. A quality-only source cannot be `core`; any source containing `demo` or `legacy_demo` cannot be `core`; derived `core` requires productive-complexity, value-capture, or equivalent positive support; and curated `core` requires `source: "curated_reviewed"` with rationale.

The builder also prints diagnostics: total records, class distribution, core count, derived core count, derived productive-capability core count, curated reviewed core count, demo seed reinterpretation count, top productive capability scores, high-score countries kept semi-periphery because productive capability is missing/low, countries moved into provisional core by productive capability support, and top downgraded high-quality records with reasons.

## Productive Capability Proxy

Run:

```sh
npm run data:build:productive-capability
npm run validate:productive-capability
```

This calls `scripts/data/build-productive-capability-proxy.mjs` and reads:

- `static/data/map-units.registry.json`
- `static/data/indicators/extraction-dependency.world-bank.latest.json`

It writes:

- `static/data/indicators/productive-capability.world-bank.latest.json`

The proxy uses only WDI export-structure indicators already present in the extraction dataset:

- manufactures exports as percent of merchandise exports (`TX.VAL.MANF.ZS.UN`)
- high-technology exports as percent of manufactured exports (`TX.VAL.TECH.MF.ZS`)
- medium/high-technology exports as percent of manufactured exports (`TX.MNF.TECH.ZS.UN`), where available

Scoring uses transparent clamps: manufactures `/ 75`, high-tech `/ 25`, and medium/high-tech `/ 60`. When all three exist, weights are 0.40, 0.35, and 0.25. With manufactures plus high-tech, weights are 0.55 and 0.45. With manufactures only, the manufactures score is used and data quality is partial. No usable values produce `score: null` and sparse data quality.

This is provisional positive structural support only. It measures export structure, not domestic value capture, ownership, GVC control, or final productive complexity. It should later be replaced or complemented by Atlas, BACI, Comtrade, and OECD TiVA evidence.

Future versions should replace this proxy with a documented structural model that includes OECD TiVA, trade/value-chain data, material footprint, e-waste, ecological externalization, military/geopolitical position, financial centrality, conflict exposure, and political-freedom indicators.

## Atlas Productive-Complexity Import

Run:

```sh
npm run data:import:complexity
```

This calls `scripts/data/import-atlas-economic-complexity.mjs` and reads local CSV files from:

```text
data/raw/atlas-economic-complexity/
```

Download Atlas of Economic Complexity data manually from:

```text
https://atlas.hks.harvard.edu/data-downloads/
```

Supported file names include `country_complexity.csv`, `country_product_exports.csv`, and `product_complexity.csv`. The importer also scans other CSVs in that directory if it can detect common country-code, year, ECI, export-value, or diversity columns.

The importer writes:

- `static/data/indicators/productive-complexity.latest.json`

If no CSV files are present, it writes a valid placeholder with `status: "no_source_file"` and zero records, then exits successfully. Missing Atlas files must not fail CI.

The importer normalizes source country codes through registry `external_ids.iso3`, registry `id`, `natural_earth.iso_a3`, and `natural_earth.adm0_a3`. Natural Earth placeholder code `-99` is never accepted. Unmatched rows are reported in the output instead of being forced into the registry.

The component score is a 0-100 percentile rank across matched records. ECI receives 75% weight when export diversity is also available; diversity receives 25%. If only one usable indicator is present, that percentile is used and data quality reflects the reduced evidence. This is one structural component only and does not determine world-system class.

Validate it with:

```sh
npm run validate:productive-complexity
```

Then rebuild the structural placeholder:

```sh
npm run data:build:worldsystem:structural
npm run validate:worldsystem:structural
```

The structural placeholder can include `components.productive_complexity` where data exists, but it remains `model_status: "not_yet_computable"` until value capture, extraction autonomy, ecological externalization, and geopolitical-financial power are implemented and reviewed.

## World Bank Extraction Dependency Pipeline

Run:

```sh
npm run data:fetch:extraction
```

This calls `scripts/data/fetch-world-bank-extraction.mjs`, uses built-in `fetch`, and downloads these World Bank WDI indicators for all countries:

- `NY.GDP.TOTL.RT.ZS`: total natural resources rents (% of GDP)
- `TX.VAL.FUEL.ZS.UN`: fuel exports (% of merchandise exports)
- `TX.VAL.MMTL.ZS.UN`: ores and metals exports (% of merchandise exports)
- `TX.VAL.AGRI.ZS.UN`: agricultural raw materials exports (% of merchandise exports)
- `TX.VAL.FOOD.ZS.UN`: food exports (% of merchandise exports)
- `TX.VAL.MANF.ZS.UN`: manufactures exports (% of merchandise exports)
- `TX.VAL.TECH.MF.ZS`: high-technology exports (% of manufactured exports)
- `TX.MNF.TECH.ZS.UN`: medium and high-tech exports (% manufactured exports), when WDI provides it

Raw responses are written to:

```text
data/raw/world-bank/extraction/
```

The generated frontend component is:

- `static/data/indicators/extraction-dependency.world-bank.latest.json`

The script matches source country codes through registry `external_ids.world_bank`, `external_ids.iso3`, and registry `id`. It ignores World Bank aggregate regions unless they have an explicit registry record, and it never accepts Natural Earth placeholder code `-99` as an ID. Missing indicator values remain missing; they are not fabricated.

`extraction_dependency_score` is a 0-100 weighted mean of clamped dependency signals. `extraction_autonomy_score` is higher where dependency is lower and manufacturing/high-tech export signals are stronger. This is a first structural component only, not a final core/periphery classification. Commodity dependence needs later BACI or UN Comtrade product-level refinement.

Validate it with:

```sh
npm run validate:extraction
```

Then rebuild the structural placeholder:

```sh
npm run data:build:worldsystem:structural
npm run validate:worldsystem:structural
```

The structural placeholder can include `components.extraction_autonomy` where WDI extraction data exists, but it remains `model_status: "not_yet_computable"` until the wider structural model is implemented and reviewed.

## UCDP Conflict Pipeline

Run:

```sh
npm run data:fetch:ucdp
```

This calls `scripts/data/fetch-ucdp-conflicts.mjs` and fetches:

- UCDP Country-Year Dataset on Organized Violence within Country Borders version 26.1.
- UCDP/PRIO Armed Conflict Dataset version 26.1.

The script uses built-in `fetch`, saves raw ZIP/CSV files under `data/raw/ucdp/`, parses CSV without adding a package dependency, and writes `static/data/indicators/conflict.ucdp.latest.json`.

The UCDP API currently requires an access token, so this pipeline prefers versioned public CSV downloads from the UCDP Dataset Download Center. The URLs are constants in the script and can be overridden with:

```sh
UCDP_COUNTRY_YEAR_URL=... UCDP_PRIO_ARMED_CONFLICT_URL=... npm run data:fetch:ucdp
```

The script prints detected CSV headers and fails if required columns are missing. It maps source rows to the map-unit registry through registry IDs, ISO3-like fields, display names, aliases, and documented manual aliases. Natural Earth placeholder code `-99` is never accepted as an ID.

The output distinguishes:

- `war_on_territory`: organized violence within the map unit's territory from UCDP country-year data.
- `involved_in_conflict`: state actor involvement in state-based armed conflict from UCDP/PRIO when participant fields map confidently.
- `fatalities_best_estimate`: UCDP best estimate for organized violence in the processed country-year layer.

These fields must not be used to infer state responsibility for violence on territory. Fatality estimates are not adult/child breakdowns and are not complete civilian casualty counts. Child casualties remain `null` until a separate UN CAAC, UNICEF, or equivalent child-casualty source is added.

When an optional generated output is intentionally absent, mark its `static/data/indicators/index.json` entry with `available: false`. The frontend and healthcheck skip unavailable optional entries, while required datasets continue to fail clearly.

Each indicator index entry must include `id`, `path`, `required`, `available`, `source_ids`, and `description`. Healthcheck warns when `available: true` points to a missing file and when `available: false` points to a file that exists. Missing optional files with `available: false` are expected and should not fail local checks or deployment.

## Data Completion Workflow

Use this review loop to expand coverage without fabricating data:

1. `npm run geo:build`
2. `npm run registry:seed`
3. `npm run data:build`
4. `npm run data:coverage`
5. `npm run registry:review`
6. Review generated `needs_review` registry records and `static/data/generated/map-units.candidates.json`
7. Manually mark verified registry records with reviewed metadata when appropriate
8. Rerun `npm run health:data`, `npm run validate:data`, `npm run check`, and `npm run build`

Keep four categories distinct in code and documentation: real public data, mock/demo data, generated registry candidates, and missing data.

## General Indicator Pipeline

Future pipeline stages should be reproducible and static-output oriented:

1. Fetch or manually stage public source datasets.
2. Normalize country, territory, and map-unit identifiers.
3. Preserve source years, licenses, and download metadata.
4. Transform indicators into documented intermediate tables.
5. Run model versions that emit classes, scores, confidence, and explanations.
6. Validate schema and missing-data handling.
7. Write final static JSON to `static/data/`.

The pipeline should avoid proprietary APIs, tracking services, and closed datasets unless explicitly approved for a separate optional workflow.
