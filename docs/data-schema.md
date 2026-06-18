# Data Schema

The frontend currently reads the stable map-unit registry from `static/data/map-units.registry.json`, mock indicator data from `static/data/world-system.latest.json`, and geometry from `static/geo/`.

## Map-Unit Registry

Natural Earth geometry properties are not the application identity system. They are source metadata for drawing geometry and for building join candidates. Some Natural Earth records use `ISO_A3` or `ADM0_A3` value `-99`; that value is a placeholder and must never be used as a semantic map-unit ID.

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
  last_reviewed: string;
}
```

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
    explanation: string;
  };
  conflict: {
    war_on_territory: boolean | null;
    involved_in_conflict: boolean | null;
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
    extraction_risk?: string | number | null;
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
  | "world_system"
  | "conflict"
  | "press_freedom"
  | "political_freedom"
  | "quality_of_life"
  | "exploitation"
  | "ecology";
```

The default layer is `world_system`. It shows the overall mock model classification. Criterion layers show one indicator family at a time: conflict flags, press freedom score bins, political freedom score bins, HDI bins, explicit extraction-risk fields, or EPI score bins.

Each layer has:

```ts
{
  id: MapLayerId;
  label: string;
  shortLabel: string;
  description: string;
  kind: "categorical" | "sequential" | "diverging" | "boolean";
  noDataLabel: string;
}
```

Every layer includes an explicit `no_data` legend item. Missing objects, null scores, undefined values, and absent risk fields must remain `no_data`; they must not be coerced to zero, low risk, no conflict, or any neutral category.

Current values in `world-system.latest.json` are mock/demo values. Future real data pipelines should generate the same field families, or compatible generated fields, and let the layer API handle binning, labels, fill classes, and legend items.

## Source Registry

`static/data/sources.json` stores source metadata keyed by source id. Every displayed indicator should eventually resolve to a source entry with source name, publisher, URL, license, notes, and year.

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
