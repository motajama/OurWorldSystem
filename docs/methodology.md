# Methodology Draft

OurWorldSystem treats world-system classification as a reproducible, data-driven model output. A class such as core, semi-periphery, or periphery is not a moral judgment about people, culture, or legitimacy. It is a summary of structural position in a global system of production, exchange, extraction, governance, and ecological externalization.

## Current Status

The first frontend scaffold uses Natural Earth geometry and mock indicator data. Scores, classes, confidence values, and explanations are placeholders for interface development.

The default map layer is the overall world-system position. This is a synthetic model view intended to summarize multiple structural dimensions with uncertainty and provenance. It should not be read as a direct copy of any single source indicator.

Criterion layers are separate thematic views for individual dimensions: war/conflict, press freedom, political freedom, quality of life, ecological performance, and extraction/externalization. They let users inspect one family of evidence at a time instead of treating the overall class as self-explanatory.

All current criterion-layer values are mock/demo values only. They are included to test the interface, legend switching, no-data handling, and layer API. They must not be cited as real measurements or current empirical findings.

## Geometry Method

The base map uses Natural Earth Admin 0 countries. Natural Earth Admin 0 countries are rendered primarily as de facto control boundaries suitable for small-scale web mapping. Geometry is not the same as political recognition.

Natural Earth breakaway and disputed areas are handled as a separate overlay when the optional source layer is available. The overlay is intentionally subtle. It is a signal that the source geometry contains disputed or special-status features, not a settlement of sovereignty.

OurWorldSystem does not treat Natural Earth identifiers as stable political or semantic IDs. Natural Earth supplies geometry and source properties; OurWorldSystem supplies a transparent map-unit registry. The registry stores neutral application IDs, display names, Natural Earth aliases, external dataset IDs, recognition status, sovereignty notes, and review dates.

Natural Earth placeholder codes such as `-99` are never valid semantic IDs. They can appear in source properties, but they are ignored for registry matching. The frontend tries registry aliases first, then development-only mock indicator IDs, and finally renders unmatched geometry as neutral `no_data` map units. Missing registry coverage therefore does not hide geometry.

Indicator data remains separate from geometry and registry metadata. Future public datasets should map into registry IDs through documented crosswalks rather than by assuming one source code system is authoritative.

## Missing Data

Missing data is a first-class map state. Null, undefined, or absent indicator values are shown as `No data`. They are not converted to zero, not treated as normal or peaceful conditions, and not hidden behind neutral colors.

For example, a missing conflict object means no conflict data is available. It does not mean no active war. A missing score for press freedom, political freedom, HDI, or ecology means no numeric score is available for that layer.

## Layer API

The layer definitions in `src/lib/mapLayers.ts` are the bridge between static indicator records and map display. Each layer defines its label, description, kind, no-data label, legend entries, binning logic, and CSS fill class.

Future real indicators should plug into the same API by generating static JSON fields for each map-unit registry ID. Updating the bin thresholds, labels, or provenance can happen in the layer module and source registry without changing the geometry renderer.

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
