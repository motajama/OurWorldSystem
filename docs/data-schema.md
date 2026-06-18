# Data Schema

The frontend currently reads mock indicator data from `static/data/world-system.latest.json` and geometry from `static/geo/`.

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
  map_unit_type: "UN member" | "territory" | "disputed" | "special";
  sovereignty_note: string | null;
  world_system: {
    class: "core" | "semi-periphery" | "periphery" | "uncertain" | "no_data" | "disputed";
    score: number | null;
    confidence: "high" | "medium" | "low";
    explanation: string;
  };
  conflict: {
    war_on_territory: boolean;
    involved_in_conflict: boolean;
    active_conflicts: string[];
    fatalities_best_estimate: number | null;
    child_casualties_verified: number | null;
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
    life_expectancy: number | null;
    education_index: number | null;
  };
  ecology: {
    epi_score: number | null;
    material_footprint_per_capita: number | null;
    co2_per_capita: number | null;
    ewaste_generated_kg_per_capita: number | null;
  };
  exploitation_position: {
    resource_export_dependency: number | null;
    foreign_value_added_share: number | null;
    domestic_value_capture: number | null;
    ewaste_import_risk: string | null;
    notes: string | null;
  };
  sources: string[];
  last_updated: string;
}
```

## Source Registry

`static/data/sources.json` stores source metadata keyed by source id. Every displayed indicator should eventually resolve to a source entry with source name, publisher, URL, license, notes, and year.

## Geometry Files

`static/geo/world.topojson` is generated from Natural Earth Admin 0 countries and stores a base world geometry layer. It is joined to map-unit records using Natural Earth properties such as:

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
