# Methodology Draft

OurWorldSystem treats world-system classification as a reproducible, data-driven model output. A class such as core, semi-periphery, or periphery is not a moral judgment about people, culture, or legitimacy. It is a summary of structural position in a global system of production, exchange, extraction, governance, and ecological externalization.

## Current Status

The first frontend scaffold uses Natural Earth geometry and mock indicator data. Scores, classes, confidence values, and explanations are placeholders for interface development.

## Geometry Method

The base map uses Natural Earth Admin 0 countries. Natural Earth Admin 0 countries are rendered primarily as de facto control boundaries suitable for small-scale web mapping. Geometry is not the same as political recognition.

Natural Earth breakaway and disputed areas are handled as a separate overlay when the optional source layer is available. The overlay is intentionally subtle. It is a signal that the source geometry contains disputed or special-status features, not a settlement of sovereignty.

OurWorldSystem does not treat Natural Earth identifiers as stable political or semantic IDs. Natural Earth supplies geometry and source properties; OurWorldSystem supplies a transparent map-unit registry. The registry stores neutral application IDs, display names, Natural Earth aliases, external dataset IDs, recognition status, sovereignty notes, and review dates.

Natural Earth placeholder codes such as `-99` are never valid semantic IDs. They can appear in source properties, but they are ignored for registry matching. The frontend tries registry aliases first, then development-only mock indicator IDs, and finally renders unmatched geometry as neutral `no_data` map units. Missing registry coverage therefore does not hide geometry.

Indicator data remains separate from geometry and registry metadata. Future public datasets should map into registry IDs through documented crosswalks rather than by assuming one source code system is authoritative.

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
