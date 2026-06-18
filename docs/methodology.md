# Methodology Draft

OurWorldSystem treats world-system classification as a reproducible, data-driven model output. A class such as core, semi-periphery, or periphery is not a moral judgment about people, culture, or legitimacy. It is a summary of structural position in a global system of production, exchange, extraction, governance, and ecological externalization.

## Current Status

The first frontend scaffold uses Natural Earth geometry, mock world-system data, and an initial real World Bank WDI quality-of-life pipeline. World-system classes, confidence values, and most criterion-layer values remain placeholders for interface development.

The default map layer is the overall world-system position. This is a synthetic model view intended to summarize multiple structural dimensions with uncertainty and provenance. It should not be read as a direct copy of any single source indicator.

Criterion layers are separate thematic views for individual dimensions: war/conflict, press freedom, political freedom, quality of life, ecological performance, and extraction/externalization. They let users inspect one family of evidence at a time instead of treating the overall class as self-explanatory.

Most current criterion-layer values are mock/demo values only. The quality-of-life layer can use real World Bank WDI values when `static/data/indicators/quality-of-life.world-bank.latest.json` is present. Mock HDI values remain demo data unless replaced later by a properly sourced UNDP HDI pipeline.

## World Bank WDI Quality-of-Life Data

The initial public-data pipeline uses the World Bank World Development Indicators API without API keys or proprietary services. It fetches:

- `SP.DYN.LE00.IN`: life expectancy at birth, total (years)
- `NY.GNP.PCAP.PP.CD`: GNI per capita, PPP (current international $)
- `SE.SEC.ENRR`: school enrollment, secondary (% gross)
- `SP.POP.TOTL`: population, total

For each indicator and World Bank source country, the pipeline selects the latest non-null value. Records are normalized to OurWorldSystem registry IDs through `external_ids.world_bank`, `external_ids.iso3`, then registry `id`. Aggregate or source countries that do not match a registry record are reported as unmatched and excluded from map-unit records unless the registry explicitly includes them.

The project-specific `quality_of_life_score` exists only to make early map visualization possible. It is computed only when life expectancy and GNI per capita PPP are available:

```text
life_expectancy_score = clamp((life_expectancy - 50) / (85 - 50), 0, 1)
income_score = clamp((ln(gni_per_capita_ppp) - ln(1000)) / (ln(75000) - ln(1000)), 0, 1)
education_score = clamp(secondary_enrollment_gross / 100, 0, 1), if available
quality_of_life_score = mean of the available required components and optional education component
```

This score is not HDI. It must be labeled as a project-specific quality-of-life score and shown with source provenance. Missing inputs remain missing and are not fabricated, imputed, or converted to zero.

## Geometry Method

The base map uses Natural Earth Admin 0 countries. Natural Earth Admin 0 countries are rendered primarily as de facto control boundaries suitable for small-scale web mapping. Geometry is not the same as political recognition.

Natural Earth breakaway and disputed areas are handled as a separate overlay when the optional source layer is available. The overlay is intentionally subtle. It is a signal that the source geometry contains disputed or special-status features, not a settlement of sovereignty.

OurWorldSystem does not treat Natural Earth identifiers as stable political or semantic IDs. Natural Earth supplies geometry and source properties; OurWorldSystem supplies a transparent map-unit registry. The registry stores neutral application IDs, display names, Natural Earth aliases, external dataset IDs, recognition status, sovereignty notes, and review dates.

Natural Earth placeholder codes such as `-99` are never valid semantic IDs. They can appear in source properties, but they are ignored for registry matching. The frontend tries registry aliases first, then development-only mock indicator IDs, and finally renders unmatched geometry as neutral `no_data` map units. Missing registry coverage therefore does not hide geometry.

Indicator data remains separate from geometry and registry metadata. Future public datasets should map into registry IDs through documented crosswalks rather than by assuming one source code system is authoritative.

## Missing Data

Missing data is a first-class map state. Null, undefined, or absent indicator values are shown as `No data`. They are not converted to zero, not treated as normal or peaceful conditions, and not hidden behind neutral colors.

For example, a missing conflict object means no conflict data is available. It does not mean no active war. A missing score for press freedom, political freedom, HDI, project quality-of-life score, or ecology means no numeric score is available for that layer.

## Layer API

The layer definitions in `src/lib/mapLayers.ts` are the bridge between static indicator records and map display. Each layer defines its label, description, kind, no-data label, legend entries, binning logic, and CSS fill class.

Future real indicators should plug into the same API by generating static JSON fields for each map-unit registry ID. Updating the bin thresholds, labels, or provenance can happen in the layer module and source registry without changing the geometry renderer. The quality-of-life layer uses HDI when available; otherwise it can use the project-specific World Bank-derived score.

## Future Model Requirements

Future classifications should:

- Publish the variables used in each model version.
- Publish source, year, license, and transformation notes for every indicator.
- Represent uncertainty explicitly.
- Distinguish missing data from genuine model uncertainty.
- Avoid deciding sovereignty disputes.
- Use the term map unit when sovereignty or recognition is disputed or ambiguous.
- Provide a short explanation for each classification.

## Candidate Indicator Families

- Economic structure: income, value added, trade position, resource export dependency.
- Political and coercive position: conflict exposure, military involvement, governance indicators.
- Rights and freedoms: press freedom, civil liberties, political rights, democracy indicators.
- Quality of life: HDI, inequality-adjusted HDI, life expectancy, education.
- Ecological pressure: emissions, material footprint, e-waste, environmental performance.
- Externalization and extraction: value capture, resource dependency, waste flows, supply-chain dependency.

## Disputed Territories

Disputed or special-status units should be shown neutrally. The atlas should record notes and source attribution but should not decide sovereignty disputes. When geometry and data differ, the UI should make that uncertainty visible rather than hiding it or hard-coding a political judgment.

Registry records for disputed or special cases use neutral status fields and notes. Palestine and Israel remain separate records where source geometry and data do so. Taiwan and Kosovo are represented as separate map units with recognition-status notes and dataset aliases. North Korea and South Korea remain separate map units where Natural Earth does so.

## Adding UNDP HDI Later

UNDP HDI should be integrated as a separate public-data pipeline with its own source manifest entry, license review, retrieval command, raw staging path, processed output, and year/source provenance. It should populate explicit HDI fields rather than reusing `quality_of_life_score`. World Bank WDI raw indicators and project scores should remain available as separate evidence, not overwritten by HDI.
