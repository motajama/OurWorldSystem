# World-System Structural Methodology

OurWorldSystem treats world-system classes as transparent model outputs about structural position in the capitalist world-economy. They are not moral judgments about people, culture, legitimacy, or deservingness. The terms core, semi-periphery, and periphery describe patterned relations of value capture, production, extraction, coercion, finance, and ecological externalization.

This document defines the intended methodology for a future structural model v1. It does not claim that the current map already computes that model.

## Wallersteinian Basis

In a Wallersteinian world-systems frame, the relevant unit is not simply a formally sovereign country. It is a position within a capitalist world-economy organized through unequal exchange, differentiated production, and durable asymmetries of power.

- `core` positions tend to capture high shares of value, coordinate or control advanced production and finance, externalize ecological costs, and exercise institutional or geopolitical leverage.
- `semi-periphery` positions combine features of core and periphery. They may host significant manufacturing, services, or regional power while remaining dependent in some value chains, financial structures, technologies, or ecological exchanges.
- `periphery` positions tend to face weaker value capture, stronger extraction dependency, lower control over high-value production, and greater exposure to externalized ecological, financial, or coercive pressures.

These are relational categories. A map unit's position should be inferred from multiple evidence families rather than from income level or living standards alone.

## Why HDI And GNI Are Insufficient

HDI, GNI per capita, life expectancy, education, and similar quality-of-life indicators are important social outcomes. They are not, by themselves, a world-systems classification.

Using HDI or GNI alone would miss several core world-system questions:

- whether a map unit captures value or mainly supplies low-margin labor, resources, or assembly;
- whether it controls complex productive capabilities or depends on imported technology and foreign-owned production networks;
- whether export earnings depend on extractive commodities or externally governed supply chains;
- whether local consumption is achieved by externalizing material, carbon, waste, or labor costs elsewhere;
- whether the map unit exercises monetary, financial, military, institutional, or rule-setting power.

The current provisional proxy uses World Bank quality-of-life and income-related signals only because they are available in the initial static pipeline. It is useful for early visualization coverage, but it is not a final Wallersteinian model.

## Structural Evidence Families

Structural model v1 should distinguish at least five component families.

### A. Value Capture And GVC Position

This component should estimate where value is captured in global value chains, not merely where gross exports occur. Relevant evidence may include domestic value added in exports, foreign value added dependence, upstream/downstream position, participation in high-value services, and whether export sectors are controlled by domestic or foreign firms.

Planned source families include OECD TiVA, UN Comtrade, CEPII BACI, UNCTAD FDI, and documented ownership or value-chain crosswalks where open data permits.

### B. Productive Complexity

This component should estimate the sophistication, diversity, and non-substitutability of productive capabilities. A map unit with complex, diversified production can occupy a different structural position from one with similar income but narrow commodity or enclave dependence.

The first implemented structural component is `productive_complexity`. It is imported from local Atlas of Economic Complexity CSV downloads when available and written to `static/data/indicators/productive-complexity.latest.json`. The importer uses country-level economic complexity where present, can use export diversity where present, and can derive a simple diversity count from country-product export rows when product export values are available.

Productive complexity is not core status. It approximates whether a map unit participates in complex, diversified, higher-capability production and export structures. It does not measure value capture, ownership, ecological externalization, coercive power, or financial centrality by itself.

Source family: Atlas of Economic Complexity / Harvard Growth Lab, staged locally under `data/raw/atlas-economic-complexity/`.

### C. Extraction Dependency

This component should estimate dependence on extractive exports, externally financed resource sectors, enclave production, and vulnerability to commodity terms-of-trade shocks. The intended direction is `extraction_autonomy`: higher values mean less structural dependence on externally governed extraction.

Planned evidence includes commodity export composition, resource rents where appropriate, material-flow accounts, and FDI concentration in extractive sectors.

### D. Ecological Unequal Exchange And Externalization

This component should estimate whether consumption, production, and waste patterns externalize ecological costs onto other map units, or whether the map unit disproportionately bears those costs. It should distinguish territorial emissions from consumption-linked material and waste burdens when data allows.

Planned source families include UNEP material flows, Yale EPI, the Global E-waste Monitor, and other open material-footprint, emissions, and waste-flow datasets.

### E. Geopolitical, Financial, And Institutional Power

This component should estimate capacity to shape rules, absorb shocks, project coercive power, influence institutions, and occupy privileged financial positions. Income without institutional leverage is not equivalent to core position.

Planned evidence includes military expenditure, reserve-currency and financial-center indicators where open data exists, FDI centrality, sanctions exposure or capacity where responsibly measurable, and participation in rule-setting institutions.

## Provisional Model Versus Structural Model

The current dataset `world_system_provisional_latest` is a temporary proxy. It preserves checked-in demo records and otherwise derives broad coverage from World Bank WDI quality-of-life and income-related indicators. Its bins are temporary and each record is marked for review.

The future dataset `world_system_structural_v1` should be a separate model with its own source IDs, component scores, data coverage, explanation, limitations, and review status. It should not overwrite or silently replace the provisional proxy until validation, documentation, and review are complete.

The structural v1 scaffold currently emits a placeholder file with `model_status: "not_yet_computable"`. That is intentional: the required source pipelines and component transformations are not complete yet. It may include available `productive_complexity` component values for review, but it still does not infer a final world-system class or total score.

## Confidence Levels

Confidence is not the same as class. It should summarize the strength, completeness, and consistency of evidence.

- `high`: broad component coverage, recent source years, consistent signals, reviewed crosswalks, and no major unresolved special-case issue.
- `medium`: adequate but incomplete component coverage, some older or partial data, or a classification near a threshold.
- `low`: sparse component coverage, major missing source families, disputed joins, strong contradiction between components, or unreviewed generated registry metadata.

Confidence must never be raised simply because a numeric score is precise. A precise score from incomplete inputs remains low confidence.

## Missing Data Handling

Missing data is a first-class state. Missing values must remain `null` or explicitly absent according to schema; they must not be converted to zero, average, peaceful, low-risk, or peripheral by default.

Structural v1 should distinguish:

- missing source coverage;
- unavailable source licensing or retrieval;
- unmatched source identifiers;
- map units that are present in the registry but not comparable in a given source;
- genuine model uncertainty from conflicting evidence.

Placeholder outputs may include registry records with all component values set to `null` and a limitation explaining that the model is not yet computable.

## Disputed And Special Map Units

OurWorldSystem uses the term map unit where sovereignty, recognition, or administrative status is disputed or ambiguous. The model must not decide sovereignty disputes.

For disputed and special map units:

- keep neutral display language and source attribution;
- record source crosswalk limitations explicitly;
- do not merge or split units solely to satisfy one external dataset;
- preserve no-data when comparable data is unavailable;
- include a limitation when source data is reported only under another authority, aggregate, or naming convention.

## Model Limitations

Any structural v1 output should state its limitations plainly:

- global sources often encode state-centric assumptions that do not fit all map units;
- value-chain and ownership data can be incomplete, lagged, or unavailable for smaller and disputed units;
- ecological externalization is difficult to reduce to one scalar score;
- geopolitical and financial power indicators may overrepresent formal institutions and underrepresent informal dependency;
- component weighting is a modeling choice and should be versioned, reviewed, and open to critique;
- a map unit can occupy different positions across different sectors and historical periods.

The model should therefore be presented as a reproducible, inspectable classification attempt, not as an absolute truth.
