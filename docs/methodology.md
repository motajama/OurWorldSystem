# Methodology Draft

OurWorldSystem treats world-system classification as a reproducible, data-driven model output. A class such as core, semi-periphery, or periphery is not a moral judgment about people, culture, or legitimacy. It is a summary of structural position in a global system of production, exchange, extraction, governance, and ecological externalization.

## Current Status

The first frontend scaffold uses Natural Earth geometry and mock indicator data. Scores, classes, confidence values, and explanations are placeholders for interface development.

## Geometry Method

The base map uses Natural Earth Admin 0 countries. Natural Earth Admin 0 countries are rendered primarily as de facto control boundaries suitable for small-scale web mapping. Geometry is not the same as political recognition.

Natural Earth breakaway and disputed areas are handled as a separate overlay when the optional source layer is available. The overlay is intentionally subtle. It is a signal that the source geometry contains disputed or special-status features, not a settlement of sovereignty.

OurWorldSystem joins geometry to mock indicator records by Natural Earth identifiers such as `ISO_A3` and `ADM0_A3`. Indicator data remains separate from geometry.

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
