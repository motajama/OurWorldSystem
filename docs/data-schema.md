# Data Schema

The frontend currently reads the stable map-unit registry from `static/data/map-units.registry.json`, mock/demo indicator data from `static/data/world-system.latest.json`, optional curated world-system overrides from `static/data/world-system.curated-overrides.json`, optional World Bank WDI quality-of-life indicators from `static/data/indicators/quality-of-life.world-bank.latest.json`, optional provisional world-system indicators from `static/data/indicators/world-system.provisional.latest.json`, optional UCDP conflict indicators from `static/data/indicators/conflict.ucdp.latest.json`, optional productive-complexity component data from `static/data/indicators/productive-complexity.latest.json`, optional World Bank WDI extraction dependency data from `static/data/indicators/extraction-dependency.world-bank.latest.json`, optional WDI productive capability proxy data from `static/data/indicators/productive-capability.world-bank.latest.json`, and geometry from `static/geo/`.

Optional indicator files are discovered through `static/data/indicators/index.json`. During development, a missing optional indicator is treated as "dataset not available yet" rather than an application error. Optional entries can set `available: false`; the frontend skips those entries entirely so a not-yet-generated optional dataset does not create normal browser 404 noise. Required base files such as `world-system.latest.json`, `map-units.registry.json`, and base geometry still fail clearly when missing or invalid.

Each indicator index entry must include:

```ts
{
  id: string;
  path: string;
  required: boolean;
  available: boolean;
  source_ids: string[];
  description: string;
}
```

If `available` is `false`, the frontend and healthcheck treat the file as intentionally absent. If `available` is `true`, the healthcheck warns when the file is missing, and required entries fail validation expectations. Optional files must never become required simply because a data pipeline has not run yet.

Use `npm run health:data` for a quick local inventory of required files, optional indicator outputs, registry count, mock world-system record count, and indicator record counts where present. The healthcheck fails for missing required files and reports missing optional datasets without failing.

## Map-Unit Registry

Natural Earth geometry properties are not the application identity system. They are source metadata for drawing geometry and for building join candidates. Some Natural Earth records use `ISO_A3` or `ADM0_A3` value `-99`; that value is a placeholder and must never be used as a semantic map-unit ID.

Map rendering is geometry-driven, while map coloring is layer-driven. A Natural Earth feature is first matched to the map-unit registry, then to the merged static map-unit record, then to the selected layer value, and finally to a visible SVG fill class. A `no_data` color means the selected indicator is missing or not numeric for that matched map unit; it does not mean the geometry is missing. The quality-of-life layer uses HDI when available, otherwise the project World Bank WDI composite `quality_of_life_score`.

`static/data/map-units.registry.json` is an array of records:

```ts
{
  id: string;
  display_name: string;
  short_name: string;
  map_unit_type: "UN member" | "territory" | "disputed" | "special" | "no_data";
  recognition_status:
    | "un_member"
    | "non_un_member"
    | "disputed"
    | "territory"
    | "special"
    | "unknown";
  sovereignty_note: string | null;
  natural_earth: {
    adm0_a3: string[];
    iso_a3: string[];
    sov_a3: string[];
    name_aliases: string[];
  };
  external_ids: {
    iso3: string | null;
    iso2: string | null;
    un_m49: string | null;
    world_bank: string | null;
    oecd: string | null;
  };
  data_notes: string[];
  last_reviewed: string | null;
  review_status?: "reviewed" | "needs_review";
}
```

Registry records can be manually curated or generated. Curated records preserve reviewed names, special-case notes, source IDs, and sovereignty language. Generated records are seeded from Natural Earth Admin 0 geometry to ensure complete map-unit coverage, set `review_status: "needs_review"`, set `last_reviewed: null`, and include a data note that they were generated from Natural Earth. Generated records are provisional review records: they improve reproducible joins and coverage checks, but they are not political recognition and do not settle sovereignty disputes.

Run the seed workflow after rebuilding geometry:

```sh
npm run geo:build
npm run registry:seed
```

The seed script updates `static/data/map-units.registry.json` and writes `data/processed/map-unit-registry-seed-report.json`. It preserves curated registry fields where a Natural Earth feature can be matched, adds missing Natural Earth aliases, refreshes provisional generated records, and creates generated `needs_review` records only for unmatched base geometries.

Generated classification follows conservative precedence rules. Natural Earth `TYPE="Sovereign country"` is not enough to infer `map_unit_type: "UN member"` because geometry is not recognition. Natural Earth unrecognized, breakaway, disputed, dependency, and indeterminate classifications take precedence for generated records. A generated record is assigned `UN member` only when it has a valid `ISO_A3` or safe `ADM0_A3` code and is not marked as disputed, breakaway, indeterminate, or dependency. Missing external IDs remain `null`; Natural Earth placeholder code `-99` is never used as a registry ID or external ID.

## Generated Candidate Registry

`npm run data:coverage` compares Natural Earth base geometry, optional disputed overlay geometry, the authoritative registry, mock world-system records, and available optional indicators. It writes a complete report to `data/processed/map-unit-coverage.report.json`, a short frontend-readable summary to `static/data/generated/map-unit-coverage.summary.json`, and review-only candidate records to `static/data/generated/map-units.candidates.json`.

Generated candidates are not authoritative registry records. They use generated IDs such as `NE::...`, set `needs_review: true`, preserve Natural Earth source properties, and include confidence and reason fields. Low-confidence candidates are valid because they are review inputs, not claims.

Candidate records follow this shape:

```ts
{
  candidate_id: string;
  suggested_display_name: string;
  map_unit_type: string;
  recognition_status: string;
  sovereignty_note?: string;
  natural_earth: Record<string, unknown>;
  possible_iso3?: string;
  possible_world_bank_code?: string;
  confidence: "low" | "medium" | "high";
  reason: string;
  needs_review: true;
  generated_from: "natural_earth";
  generated_at: string;
}
```

Do not join indicator data to `candidate_id`. To add a map unit, manually review the candidate, verify names and source identifiers, decide a neutral `recognition_status`, add provenance notes, and promote a reviewed record into `static/data/map-units.registry.json`.

Interactive disputed/breakaway overlay features may create synthetic panel records when no disputed or special registry record matches. Synthetic records use stable internal IDs beginning with `disputed::`, set `map_unit_type` to `disputed`, set `recognition_status` to `disputed`, source the record to `natural_earth`, and keep indicators as no-data/null. These records are UI records, not new sovereignty claims.

Future public datasets should be mapped into registry `id` values using documented source IDs such as ISO-3, UN M49, World Bank, OECD, or explicit manual crosswalks for special cases. Indicator files should not duplicate registry metadata except where a legacy UI field still requires it.

## Envelope

```ts
{
  meta: {
    title: string;
    description: string;
    mock: boolean;
    version: string;
    generated_at: string;
  };
  map_units: MapUnit[];
}
```

## MapUnit

```ts
{
  id: string;
  name: string;
  map_unit_type: "UN member" | "territory" | "disputed" | "special" | "no_data";
  sovereignty_note: string | null;
  world_system: {
    class: "core" | "semi-periphery" | "periphery" | "uncertain" | "no_data" | "disputed";
    score: number | null;
    confidence: "high" | "medium" | "low";
    source?:
      | "derived_world_bank_quality_proxy"
      | "derived_conservative_structural_proxy"
      | "derived_productive_capability_proxy"
      | "legacy_demo_seed"
      | "legacy_demo_seed_reinterpreted"
      | "curated_reviewed"
      | string;
    model_status?: "provisional" | string;
    explanation: string;
  };
  conflict: {
    war_on_territory: boolean | null;
    involved_in_conflict: boolean | null;
    active_conflicts: string[];
    fatalities_best_estimate: number | null;
    child_casualties_verified: number | null;
    latest_year?: number | null;
    source?: string | null;
    notes: string;
  };
  press_freedom: {
    source: string;
    score: number | null;
    category: string | null;
    year: number;
  };
  political_freedom: {
    source: string;
    score: number | null;
    category: string | null;
    year: number;
  };
  quality_of_life: {
    hdi: number | null;
    ihdi: number | null;
    life_expectancy:
      | number
      | { value: number; year: number; indicator: string; source?: string }
      | null;
    education_index: number | null;
    gni_per_capita_ppp?: { value: number; year: number; indicator: string; source?: string } | null;
    secondary_enrollment_gross?: { value: number; year: number; indicator: string; source?: string } | null;
    population?: { value: number; year: number; indicator: string; source?: string } | null;
    quality_of_life_score?: number | null;
    source?: string | null;
  };
  ecology: {
    epi_score: number | null;
    material_footprint_per_capita: number | null;
    co2_per_capita: number | null;
    ewaste_generated_kg_per_capita: number | null;
  };
  exploitation_position: {
    extraction_risk?: string | number | null;
    extraction_dependency_score?: number | null;
    extraction_autonomy_score?: number | null;
    extraction_values?: Record<string, { value: number; year: number; indicator: string }>;
    extraction_latest_year?: number | null;
    extraction_data_quality?: "good" | "partial" | "sparse" | null;
    extraction_source_country_code?: string | null;
    productive_capability_score?: number | null;
    productive_capability_values?: Record<string, { value: number; year: number; indicator: string }>;
    productive_capability_latest_year?: number | null;
    productive_capability_data_quality?: "good" | "partial" | "sparse" | null;
    productive_capability_positive_structural_support?: boolean | null;
    resource_export_dependency: number | null;
    foreign_value_added_share: number | null;
    domestic_value_capture: number | null;
    ewaste_import_risk: string | number | null;
    notes: string | null;
  };
  sources: string[];
  last_updated: string;
}
```

## Thematic Layers

The map UI does not read colors directly from indicator records. It routes thematic display through `src/lib/mapLayers.ts`.

Layer IDs:

```ts
type MapLayerId =
	| 'world_system'
	| 'conflict'
	| 'press_freedom'
	| 'political_freedom'
	| 'quality_of_life'
	| 'exploitation'
	| 'ecology';
```

The default layer is `world_system`. It prefers the provisional generated world-system dataset when present, then falls back to demo records, then to `no_data`. Criterion layers show one indicator family at a time: conflict flags, press freedom score bins, political freedom score bins, HDI or project quality-of-life bins, WDI extraction dependency bins when available, explicit extraction-risk fallback fields, or EPI score bins.

Each layer has:

```ts
{
	id: MapLayerId;
	label: string;
	shortLabel: string;
	description: string;
	kind: 'categorical' | 'sequential' | 'diverging' | 'boolean';
	noDataLabel: string;
}
```

Every layer includes an explicit `no_data` legend item. Missing objects, null scores, undefined values, and absent risk fields must remain `no_data`; they must not be coerced to zero, low risk, no conflict, or any neutral category.

The rendered SVG map uses D3 Equal Earth as its default equal-area projection. This improves visual comparison of territorial surface areas while still distorting shapes and distances like any world projection.

Current values in `world-system.latest.json` are mock/demo values. They are UI/demo seeds, not reviewed structural classifications. The generated provisional proxy lives in `world-system.provisional.latest.json` and keeps demo classes distinguishable as `source: "legacy_demo_seed"` or `source: "legacy_demo_seed_reinterpreted"`. Demo records must not generate authoritative `core` classifications. Real indicator pipelines should write separate static files and merge by registry ID in the frontend or a build step. The layer API handles binning, labels, fill classes, and legend items.

## Provisional World-System Indicators

`static/data/indicators/world-system.provisional.latest.json` is generated by `scripts/data/build-provisional-world-system.mjs`. It is a transparent provisional proxy for default map coloring, not a final academic world-systems classification.

The output schema is:

```ts
{
  dataset_id: "world_system_provisional_latest";
  source_ids: [
    "world_bank_wdi",
    "world_bank_wdi_extraction",
    "atlas_economic_complexity",
    "legacy_demo_seed",
    "world_system_curated_overrides"
  ];
  model_status: "provisional_conservative_proxy";
  generated_at: string;
  methodology_note: string;
  records: Array<{
    id: string;
    world_system: {
      class:
        | "core"
        | "semi-periphery"
        | "periphery"
        | "uncertain"
        | "disputed"
        | "no_data";
      score: number | null; // 0-100 when present
      confidence: "low" | "medium";
      source:
        | "derived_world_bank_quality_proxy"
        | "derived_conservative_structural_proxy"
        | "derived_productive_capability_proxy"
        | "legacy_demo_seed"
        | "legacy_demo_seed_reinterpreted"
        | "curated_reviewed";
      explanation: string;
      rationale?: string | null;
      reviewed_by?: string | null;
      reviewed_at?: string | null;
    };
    components: {
      quality_of_life_score: number | null; // original 0-1 World Bank-derived score
      gni_per_capita_ppp: number | null;
      life_expectancy: number | null;
      secondary_enrollment_gross: number | null;
      extraction_dependency_score: number | null;
      extraction_autonomy_score: number | null;
      value_capture_score: number | null;
      productive_complexity_score: number | null;
      productive_capability_score: number | null;
      productive_capability_data_quality: "good" | "partial" | "sparse" | null;
      geopolitical_financial_power_score: number | null;
      structural_supports: string[];
      positive_structural_supports: string[];
      negative_or_filter_supports: string[];
      previous_proxy_class: string;
      downgraded_from_previous_proxy_core: boolean;
      classification_reason: string;
    };
    review_status: "needs_review" | "reviewed";
    classification_status?: "provisional_model" | "demo_only" | "curated_reviewed";
  }>;
  diagnostics: {
    total_records: number;
    previous_proxy_core_count: number;
    class_distribution: Record<string, number>;
    core_count: number;
    derived_core_count: number;
    derived_productive_capability_core_count: number;
    curated_reviewed_core_count: number;
    legacy_demo_seed_count: number;
    demo_seed_reinterpreted_count: number;
    high_score_non_core_count: number;
    downgraded_from_previous_proxy_core_count: number;
    core_candidates: Array<Record<string, unknown>>;
    high_score_non_core: Array<Record<string, unknown>>;
    prevented_missing_positive_structural_evidence: Array<Record<string, unknown>>;
    top_productive_capability_scores: Array<Record<string, unknown>>;
    high_score_kept_semi_periphery_productive_capability_missing_low: Array<Record<string, unknown>>;
    moved_from_semi_periphery_to_core_by_productive_capability: Array<Record<string, unknown>>;
    downgraded_high_quality: Array<Record<string, unknown>>;
  };
  notes: string[];
}
```

The model treats demo records from `world-system.latest.json` as legacy demo seeds. Demo records may provide sample display values, but they are not reviewed structural classifications and cannot create `core`. If a demo seed says `core`, the builder emits low-confidence `semi-periphery` with `source: "legacy_demo_seed_reinterpreted"` unless a separate reviewed override exists. Derived records use World Bank WDI quality-of-life and GNI only as welfare proxies. Extraction autonomy and low extraction dependency are negative/filter supports: they can corroborate a core claim or block extraction-dependent cases, but they do not prove core status.

Derived `core` requires `quality_of_life_score >= 0.88`, `extraction_dependency_score` missing or `<= 25`, `extraction_autonomy_score` missing or `>= 65`, `productive_capability_score >= 70`, productive capability data quality other than `sparse`, and no disputed/special/territory status unless explicitly reviewed. Disputed, special, and territory records cannot become derived core.

Real manual classifications use `static/data/world-system.curated-overrides.json`:

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

The current override file intentionally has an empty `records` array. Do not add CZE, DEU, USA, or any other map unit until the classification has been explicitly reviewed. The stricter interim model previously produced zero core records; that was methodologically safer than overproducing core from welfare data, but analytically too flat until a positive structural support proxy was added.

This file is intentionally marked `model_status: "provisional_conservative_proxy"` and every generated or demo-seed record is `review_status: "needs_review"`. High quality of life alone cannot produce `core`; quality of life plus extraction autonomy cannot produce `core`; a high continuous proxy score can still be `semi-periphery` when productive capability evidence is missing or insufficient. The productive capability proxy is provisional export-structure support, not final productive complexity, value-chain control, or value capture evidence. Many high-welfare records remain `semi-periphery` or `uncertain` until value-capture/GVC or productive-complexity evidence is added. `semi-periphery` is a mixed structural position, not merely a middle-income bin. The file does not yet include OECD TiVA, complete trade/value-chain data, material footprint, e-waste, ecological externalization, military/geopolitical position, financial centrality, conflict exposure, or political-freedom indicators. The current model deliberately under-classifies core rather than over-classifying it.

## Structural World-System Model V1

`static/data/indicators/world-system.structural-v1.placeholder.json` is generated by `scripts/data/build-world-system-structural-v1.mjs`. For now it is a placeholder scaffold for the future Wallerstein-inspired structural model described in `docs/world-system-methodology.md`.

The placeholder is intentionally marked `model_status: "not_yet_computable"`. It must not be used as a final classification. It can carry available component values, starting with `productive_complexity` and `extraction_autonomy`, but `class` and top-level `score` remain unset until the full structural model is reviewed. Future computable outputs should keep the same top-level and record shape, update `model_status`, and populate final scores only when the required source pipelines and transformations are implemented.

The intended output schema is:

```ts
{
  dataset_id: "world_system_structural_v1";
  model_status: "not_yet_computable" | "draft" | "review" | "published";
  generated_at: string;
  records: Array<{
    id: string;
    class:
      | "core"
      | "semi-periphery"
      | "periphery"
      | "uncertain"
      | "disputed"
      | "no_data";
    score: number | null; // 0-100 when computable
    confidence: "low" | "medium" | "high";
    components: {
      value_capture: number | null;
      productive_complexity: number | null;
      extraction_autonomy: number | null;
      ecological_externalization: number | null;
      geopolitical_financial_power: number | null;
    };
    data_coverage: {
      available_source_ids: string[];
      missing_source_ids: string[];
      component_status: {
        value_capture: "missing" | "partial" | "available";
        productive_complexity: "missing" | "partial" | "available";
        extraction_autonomy: "missing" | "partial" | "available";
        ecological_externalization: "missing" | "partial" | "available";
        geopolitical_financial_power: "missing" | "partial" | "available";
      };
    };
    explanation: string;
    limitations: string[];
    sources: string[];
    review_status: "not_started" | "needs_review" | "reviewed";
  }>;
  planned_source_ids: string[];
  missing_source_ids: string[];
  component_requirements: Record<string, string[]>;
  notes: string[];
}
```

Component scores use the direction documented in the methodology. Higher `value_capture`, `productive_complexity`, `extraction_autonomy`, and `geopolitical_financial_power` indicate stronger structural position in that component. `ecological_externalization` should be documented carefully in each model version because high externalization can be evidence of core-like consumption power while also describing ecological harm imposed elsewhere.

The structural v1 validator accepts the placeholder and future outputs with this shape. It validates registry IDs, class values, score ranges, confidence values, component score ranges, data coverage fields, source arrays, limitations, and review status. Missing source families must be explicit rather than hidden.

## Productive Complexity Indicators

`static/data/indicators/productive-complexity.latest.json` is generated by `scripts/data/import-atlas-economic-complexity.mjs` from local Atlas of Economic Complexity CSV files staged in `data/raw/atlas-economic-complexity/`.

Supported local file names include `country_complexity.csv`, `country_product_exports.csv`, and `product_complexity.csv`. The importer also scans other CSV files in that directory when it can detect common country, year, ECI, export-value, or diversity columns. If no CSV files are present, it writes a valid placeholder with `status: "no_source_file"` and zero records.

The output schema is:

```ts
{
  dataset_id: "productive_complexity_latest";
  source_id: "atlas_economic_complexity";
  model_component: "productive_complexity";
  status: "data_loaded" | "no_source_file";
  generated_at: string;
  records: Array<{
    id: string;
    source_country_code: string;
    latest_year: number;
    values: {
      economic_complexity_index?: { value: number; year: number; source_column: string };
      export_diversity?: { value: number; year: number; source_column: string };
      export_value?: { value: number; year: number; source_column: string };
    };
    productive_complexity_score: number | null; // 0-100 percentile score
    score_method: "percentile_rank_of_available_indicators";
    data_quality: "good" | "partial" | "sparse";
    sources: ["atlas_economic_complexity"];
  }>;
  unmatched_source_rows: Array<Record<string, unknown>>;
  notes: string[];
}
```

Scoring uses percentile ranks across matched map-unit records. If ECI and export diversity are both present, the component score is `0.75 * ECI percentile + 0.25 * diversity percentile`. If only ECI is present, the ECI percentile is used. If only diversity is present, the diversity percentile is used and data quality is partial. Missing indicators remain `null` or absent; they are not fabricated.

## Productive Capability Proxy

`static/data/indicators/productive-capability.world-bank.latest.json` is generated by `scripts/data/build-productive-capability-proxy.mjs` from export-structure values already present in `static/data/indicators/extraction-dependency.world-bank.latest.json`.

This is a provisional positive structural proxy. It is not final productive complexity, value-chain control, ownership, or value-capture evidence. It exists so the provisional model does not have to choose between overproducing core from welfare data and producing a safe but analytically flat zero-core output.

The output schema is:

```ts
{
  dataset_id: "productive_capability_world_bank_latest";
  source_id: "world_bank_wdi_extraction";
  model_component: "productive_capability_proxy";
  status: "provisional_proxy";
  generated_at: string;
  records: Array<{
    id: string;
    latest_year: number | null;
    values: {
      manufactures_exports_merchandise_pct?: { value: number; year: number; indicator: "TX.VAL.MANF.ZS.UN" };
      high_tech_exports_manufactured_pct?: { value: number; year: number; indicator: "TX.VAL.TECH.MF.ZS" };
      medium_high_tech_exports_manufactured_pct?: { value: number; year: number; indicator: "TX.MNF.TECH.ZS.UN" };
    };
    productive_capability_score: number | null; // 0-100
    positive_structural_support: boolean;
    support_reasons: string[];
    data_quality: "good" | "partial" | "sparse";
    limitations: string[];
    sources: ["world_bank_wdi_extraction"];
  }>;
  notes: string[];
}
```

Scoring uses only export-structure indicators: manufactures exports `/ 75`, high-tech exports `/ 25`, and medium/high-tech exports `/ 60`, each clamped to 0-1. When all three exist, weights are 0.40, 0.35, and 0.25. With manufactures plus high-tech, weights are 0.55 and 0.45. With manufactures only, the manufactures score is used and data quality is partial. No usable values produce `null` and sparse data quality.

`positive_structural_support` is true only when `productive_capability_score >= 70`, data quality is not sparse, and at least manufactures or high-tech data exists. High productive capability does not by itself prove core status. OECD TiVA, Atlas/BACI/Comtrade, domestic value added, and GVC/value-capture data are still required for final structural claims.

## Extraction Dependency Indicators

`static/data/indicators/extraction-dependency.world-bank.latest.json` is generated by `scripts/data/fetch-world-bank-extraction.mjs` from the World Bank World Development Indicators API. Raw API responses are saved under `data/raw/world-bank/extraction/`.

The output is a structural component, not a final world-system class. `extraction_dependency_score` is higher where available WDI signals show stronger resource-rent or low-processing export dependence. `extraction_autonomy_score` is higher where the map unit appears less extraction-dependent and more manufacturing or high-tech oriented.

The output schema is:

```ts
{
  dataset_id: "extraction_dependency_world_bank_latest";
  source_id: "world_bank_wdi_extraction";
  model_component: "extraction_dependency";
  generated_at: string;
  indicators: Record<string, { label: string; source: "World Bank WDI" }>;
  records: Array<{
    id: string;
    source_country_code: string;
    latest_year: number;
    values: {
      natural_resource_rents_gdp_pct?: { value: number; year: number; indicator: "NY.GDP.TOTL.RT.ZS" };
      fuel_exports_merchandise_pct?: { value: number; year: number; indicator: "TX.VAL.FUEL.ZS.UN" };
      ores_metals_exports_merchandise_pct?: { value: number; year: number; indicator: "TX.VAL.MMTL.ZS.UN" };
      agricultural_raw_exports_merchandise_pct?: { value: number; year: number; indicator: "TX.VAL.AGRI.ZS.UN" };
      food_exports_merchandise_pct?: { value: number; year: number; indicator: "TX.VAL.FOOD.ZS.UN" };
      manufactures_exports_merchandise_pct?: { value: number; year: number; indicator: "TX.VAL.MANF.ZS.UN" };
      high_tech_exports_manufactured_pct?: { value: number; year: number; indicator: "TX.VAL.TECH.MF.ZS" };
      medium_high_tech_exports_manufactured_pct?: { value: number; year: number; indicator: "TX.MNF.TECH.ZS.UN" };
    };
    extraction_dependency_score: number | null; // 0-100
    extraction_autonomy_score: number | null; // 0-100
    data_quality: "good" | "partial" | "sparse";
    sources: ["world_bank_wdi_extraction"];
  }>;
  unmatched_source_countries: Array<{ source_country_code: string; source_country_name?: string | null }>;
  ignored_aggregate_regions: Array<{ source_country_code: string; source_country_name?: string | null }>;
  latest_years: Record<string, number | null>;
  notes: string[];
}
```

Dependency-positive signals are normalized with transparent clamps: resource rents `/ 30`, fuel exports `/ 80`, ores/metals exports `/ 60`, agricultural raw materials exports `/ 30`, and food exports `/ 60`. Their weighted dependency mean uses weights 0.30, 0.25, 0.20, 0.15, and 0.10 respectively. Autonomy-positive signals are manufactures exports `/ 90`, high-tech exports `/ 40`, and medium/high-tech exports `/ 70`.

`extraction_dependency_score` is `100 * dependency_mean`. `extraction_autonomy_score` is `100 * (0.65 * (1 - dependency_mean) + 0.35 * autonomy_mean)` when autonomy signals exist. If autonomy signals are absent but dependency signals exist, the score uses `100 * (1 - dependency_mean)` with lower data quality. If dependency signals are absent, both component scores remain `null`.

This WDI component is broad coverage only. Later model versions need BACI or UN Comtrade product-level data to distinguish crude commodities from processed goods, capture processing depth, and evaluate commodity concentration more directly.

## World Bank Quality-of-Life Indicators

`static/data/indicators/quality-of-life.world-bank.latest.json` is generated by `scripts/data/fetch-world-bank-wdi.mjs` from the World Bank World Development Indicators API. Raw API responses are saved under `data/raw/world-bank/`; those raw files are ignored by git. A processed copy is also written under `data/processed/`.

The output schema is:

```ts
{
  dataset_id: "quality_of_life_world_bank_latest";
  source_id: "world_bank_wdi";
  retrieved_at: string;
  indicators: Record<string, { label: string; source: "World Bank WDI" }>;
  records: Array<{
    id: string;
    source_country_code: string;
    values: {
      life_expectancy?: { value: number; year: number; indicator: "SP.DYN.LE00.IN" };
      gni_per_capita_ppp?: { value: number; year: number; indicator: "NY.GNP.PCAP.PP.CD" };
      secondary_enrollment_gross?: { value: number; year: number; indicator: "SE.SEC.ENRR" };
      population?: { value: number; year: number; indicator: "SP.POP.TOTL" };
    };
    quality_of_life_score: number | null;
    data_quality: "partial" | "good" | "sparse";
    sources: ["world_bank_wdi"];
  }>;
  unmatched_source_countries: Array<{
    source_country_code: string;
    source_country_name: string | null;
  }>;
  latest_years: Record<string, number | null>;
  notes: string[];
}
```

Normalization uses `registry.external_ids.world_bank`, then `registry.external_ids.iso3`, then registry `id`. Source countries that do not resolve to a registry ID are reported in `unmatched_source_countries`; they are not forced into the dataset.

World Bank aggregate regions are ignored when they are not explicitly represented in the registry. Ignored aggregates are reported separately in `ignored_aggregate_regions` so unmatched source-country counts focus on map units that may need registry or crosswalk review.

For each indicator and source country, the pipeline selects the latest non-null year. Missing values remain absent. They are not filled, averaged, inferred, or set to zero.

`quality_of_life_score` is a temporary project-specific composite for map visualization only. It is not HDI and must not be described as HDI. It is computed only when life expectancy and GNI per capita PPP are present:

```text
life_expectancy_score = clamp((life_expectancy - 50) / (85 - 50), 0, 1)
income_score = clamp((ln(gni_per_capita_ppp) - ln(1000)) / (ln(75000) - ln(1000)), 0, 1)
education_score = clamp(secondary_enrollment_gross / 100, 0, 1), when available
quality_of_life_score = mean(life_expectancy_score, income_score, optional education_score)
```

A later UNDP HDI integration should be added as a separate source and field, preserving source years and license terms. It should not overwrite World Bank raw indicators, and World Bank-derived project scores should continue to be labeled separately from HDI.

## UCDP Conflict Indicators

`static/data/indicators/conflict.ucdp.latest.json` is generated by `scripts/data/fetch-ucdp-conflicts.mjs` from two public UCDP CSV datasets:

- `ucdp_country_year`: UCDP Country-Year Dataset on Organized Violence within Country Borders version 26.1.
- `ucdp_prio_armed_conflict`: UCDP/PRIO Armed Conflict Dataset version 26.1.

This dataset is optional in local development. If it has not been generated, the frontend skips the request, preserves existing mock conflict values, and displays `No data` where no conflict value exists. Run `npm run data:fetch:ucdp` to generate `conflict.ucdp.latest.json` and add it to the optional indicator index.

The output schema is:

```ts
{
  dataset_id: "conflict_ucdp_latest";
  source_ids: ["ucdp_country_year", "ucdp_prio_armed_conflict"];
  retrieved_at: string;
  version: "26.1";
  latest_year: number;
  records: Array<{
    id: string;
    territory: {
      has_organized_violence: boolean | null;
      latest_year: number;
      fatalities_best_estimate: number | null;
      fatalities_low: number | null;
      fatalities_high: number | null;
      event_count: null;
      source: "ucdp_country_year";
    } | null;
    state_involvement: {
      involved_in_state_based_conflict: boolean | null;
      latest_year: number | null;
      conflict_count: number;
      conflicts: Array<{
        conflict_id: string;
        name: string;
        year: number;
        type: string;
        intensity_level: string;
        cumulative_intensity: string;
      }>;
      source: "ucdp_prio_armed_conflict";
    };
    conflict_summary: {
      war_on_territory: boolean | null;
      involved_in_conflict: boolean | null;
      active_conflicts: string[];
      fatalities_best_estimate: number | null;
      child_casualties_verified: null;
      notes: string;
    };
    data_quality: "good" | "partial" | "sparse";
    sources: string[];
  }>;
  unmatched_source_rows: Array<Record<string, unknown>>;
  notes: string[];
}
```

`war_on_territory` comes from country-year organized violence within borders. It is not a statement that the state caused or is responsible for the violence. `involved_in_conflict` comes from UCDP/PRIO participant fields where state actor names can be matched conservatively to registry IDs.

Fatalities are UCDP best estimates in the selected country-year layer. They are not complete civilian casualty counts, and they are not adult/child breakdowns. `child_casualties_verified` must remain `null` until a separate source such as UN CAAC or UNICEF is integrated.

The UCDP country-year dataset uses Gleditsch-Ward country identifiers and country names, not ISO3. This project maps by registry display names, aliases, ISO-like IDs if present, and documented manual aliases for known naming variants. Unmatched rows are reported and excluded rather than coerced.

## Source Registry

`static/data/sources.json` stores source metadata keyed by source id. Every displayed indicator should eventually resolve to a source entry with source name, publisher, URL, license, notes, and year.

`static/data/source-manifest.json` stores structured source records for pipeline provenance, including World Bank WDI, Natural Earth, Mapshaper, and mock demo data.

## Geometry Files

`static/geo/world.topojson` is generated from Natural Earth Admin 0 countries and stores a base world geometry layer. The frontend first resolves geometry through the registry's Natural Earth aliases. If no registry record matches, it may fall back to mock indicator data for development. If neither exists, the feature is still rendered as a synthetic `no_data` map unit.

```ts
{
  ADM0_A3?: string;
  ISO_A3?: string;
  NAME?: string;
  NAME_LONG?: string;
  SOV_A3?: string;
  TYPE?: string;
  ADMIN?: string;
  FCLASS_ISO?: string;
  FCLASS_US?: string;
  FCLASS_FR?: string;
  FCLASS_RU?: string;
  FCLASS_CN?: string;
}
```

`static/geo/disputed.topojson` is optional and is generated from Natural Earth breakaway/disputed areas when that source archive is available.

Geometry records are not indicator records. Natural Earth geometry is used for map drawing and spatial reference; mock world-system data remains in `static/data/world-system.latest.json`.

Disputed and special map units are represented neutrally. A registry record can describe recognition status and source aliases without deciding sovereignty, and separate geometry records such as ISR/PSE or KOR/PRK remain separate where the geometry and data model do so.
