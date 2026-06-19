import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');

const paths = {
	registry: path.join(repoRoot, 'static/data/map-units.registry.json'),
	qualityOfLife: path.join(
		repoRoot,
		'static/data/indicators/quality-of-life.world-bank.latest.json'
	),
	worldSystemDemo: path.join(repoRoot, 'static/data/world-system.latest.json'),
	extractionDependency: path.join(
		repoRoot,
		'static/data/indicators/extraction-dependency.world-bank.latest.json'
	),
	productiveComplexity: path.join(
		repoRoot,
		'static/data/indicators/productive-complexity.latest.json'
	),
	productiveCapability: path.join(
		repoRoot,
		'static/data/indicators/productive-capability.world-bank.latest.json'
	),
	curatedOverrides: path.join(repoRoot, 'static/data/world-system.curated-overrides.json'),
	output: path.join(repoRoot, 'static/data/indicators/world-system.provisional.latest.json')
};

const validClasses = new Set([
	'core',
	'semi-periphery',
	'periphery',
	'uncertain',
	'disputed',
	'no_data'
]);

const notes = [
	'This is a provisional proxy model and not a final world-systems classification.',
	'Core classification is deliberately conservative.',
	'Quality-of-life data alone cannot generate core status.',
	'Demo seed data cannot generate core status.',
	'Extraction autonomy is a negative filter/corroborating condition, not positive proof of core status.',
	'Core status requires provisional positive structural support from the productive capability proxy, future productive complexity, value capture, geopolitical-financial power, or a curated_reviewed override with rationale.',
	'The productive capability proxy is based on WDI export structure and is not final productive complexity or value-chain control evidence.',
	'Many high-income countries may be provisionally semi-periphery until GVC/value-capture data are added.',
	'Future versions should include value-chain position, ecological externalization, trade structure, extraction, financial centrality, and conflict/political indicators.'
];

const methodologyNote =
	'Experimental conservative provisional world-system proxy. Existing demo world-system records are treated as legacy demo seeds, not curated classifications. Real manual classifications must come from static/data/world-system.curated-overrides.json with source curated_reviewed and a rationale. Derived core requires positive structural evidence from the provisional productive capability export-structure proxy, later productive complexity, value capture, or geopolitical-financial power, plus low extraction-dependency/autonomy filters. Demo seed data cannot create core status. Extraction autonomy and low extraction dependency can corroborate core but cannot create it. High quality-of-life alone is capped at semi-periphery or uncertain. The productive capability proxy is not final productive complexity and does not measure value-chain control. This is not a final Wallersteinian or dependency-theory classification.';

function clamp(value, min, max) {
	return Math.min(max, Math.max(min, value));
}

function round(value, places = 2) {
	const factor = 10 ** places;
	return Math.round(value * factor) / factor;
}

async function readJson(filePath) {
	const text = await readFile(filePath, 'utf8');
	return JSON.parse(text);
}

function isFiniteNumber(value) {
	return typeof value === 'number' && Number.isFinite(value);
}

async function readJsonIfPresent(filePath) {
	try {
		return await readJson(filePath);
	} catch (error) {
		if (error?.code === 'ENOENT') return null;
		throw error;
	}
}

function normalizeScoreToHundred(value) {
	if (!isFiniteNumber(value)) return null;
	return round(clamp(value <= 1 ? value * 100 : value, 0, 100), 2);
}

function normalizedLogIncome(income) {
	if (!isFiniteNumber(income) || income <= 0) return null;
	return clamp((Math.log(income) - Math.log(1000)) / (Math.log(75000) - Math.log(1000)), 0, 1);
}

function normalizeWorldSystemDemoData(input) {
	const records = Array.isArray(input?.map_units) ? input.map_units : [];
	return new Map(
		records
			.filter((record) => record && typeof record === 'object' && typeof record.id === 'string')
			.map((record) => [record.id, record])
	);
}

function normalizeCuratedOverrides(input) {
	const records = Array.isArray(input?.records) ? input.records : [];
	return new Map(
		records
			.filter((record) => record && typeof record === 'object' && typeof record.id === 'string')
			.filter((record) => record.world_system?.source === 'curated_reviewed')
			.map((record) => [record.id, record])
	);
}

function previousProxyClassFromScore(score) {
	if (!isFiniteNumber(score)) return 'no_data';
	if (score >= 78) return 'core';
	if (score >= 55) return 'semi-periphery';
	return 'periphery';
}

function previousProxyScore(qualityScore, incomeSignal) {
	if (qualityScore !== null && incomeSignal !== null) {
		return round((qualityScore * 0.85 + incomeSignal * 0.15) * 100, 2);
	}
	if (qualityScore !== null) return round(qualityScore * 100, 2);
	if (incomeSignal !== null) return round(incomeSignal * 100, 2);
	return null;
}

function recordsById(data, predicate = () => true) {
	const records = Array.isArray(data?.records) ? data.records : [];
	return new Map(
		records
			.filter((record) => record && typeof record === 'object' && typeof record.id === 'string')
			.filter(predicate)
			.map((record) => [record.id, record])
	);
}

function componentsFromRecords(
	qualityRecord,
	extractionRecord,
	productiveRecord,
	productiveCapabilityRecord
) {
	return {
		quality_of_life_score: isFiniteNumber(qualityRecord?.quality_of_life_score)
			? round(qualityRecord.quality_of_life_score, 4)
			: null,
		gni_per_capita_ppp: isFiniteNumber(qualityRecord?.values?.gni_per_capita_ppp?.value)
			? round(qualityRecord.values.gni_per_capita_ppp.value, 2)
			: null,
		life_expectancy: isFiniteNumber(qualityRecord?.values?.life_expectancy?.value)
			? round(qualityRecord.values.life_expectancy.value, 3)
			: null,
		secondary_enrollment_gross: isFiniteNumber(
			qualityRecord?.values?.secondary_enrollment_gross?.value
		)
			? round(qualityRecord.values.secondary_enrollment_gross.value, 3)
			: null,
		extraction_dependency_score: isFiniteNumber(extractionRecord?.extraction_dependency_score)
			? round(extractionRecord.extraction_dependency_score, 2)
			: null,
		extraction_autonomy_score: isFiniteNumber(extractionRecord?.extraction_autonomy_score)
			? round(extractionRecord.extraction_autonomy_score, 2)
			: null,
		value_capture_score: null,
		productive_complexity_score: isFiniteNumber(productiveRecord?.productive_complexity_score)
			? round(productiveRecord.productive_complexity_score, 2)
			: null,
		productive_capability_score: isFiniteNumber(
			productiveCapabilityRecord?.productive_capability_score
		)
			? round(productiveCapabilityRecord.productive_capability_score, 2)
			: null,
		productive_capability_data_quality: ['good', 'partial', 'sparse'].includes(
			productiveCapabilityRecord?.data_quality
		)
			? productiveCapabilityRecord.data_quality
			: null,
		geopolitical_financial_power_score: null
	};
}

function emptyComponents() {
	return componentsFromRecords(null, null, null, null);
}

function positiveStructuralSupports(components) {
	const supports = [];

	if (
		isFiniteNumber(components.productive_complexity_score) &&
		components.productive_complexity_score >= 75
	) {
		supports.push('productive_complexity_score >= 75');
	}
	if (
		isFiniteNumber(components.productive_capability_score) &&
		components.productive_capability_score >= 70 &&
		components.productive_capability_data_quality !== 'sparse'
	) {
		supports.push('productive_capability_score >= 70');
	}
	if (isFiniteNumber(components.value_capture_score) && components.value_capture_score >= 70) {
		supports.push('value_capture_score >= 70');
	}
	if (
		isFiniteNumber(components.geopolitical_financial_power_score) &&
		components.geopolitical_financial_power_score >= 70
	) {
		supports.push('geopolitical_financial_power_score >= 70');
	}
	return supports;
}

function negativeOrFilterSupports(components) {
	const supports = [];

	if (
		isFiniteNumber(components.extraction_autonomy_score) &&
		components.extraction_autonomy_score >= 75
	) {
		supports.push('extraction_autonomy_score >= 75');
	}
	if (
		isFiniteNumber(components.extraction_dependency_score) &&
		components.extraction_dependency_score <= 20
	) {
		supports.push('extraction_dependency_score <= 20');
	}

	return supports;
}

function structuralSupports(components) {
	return [...positiveStructuralSupports(components), ...negativeOrFilterSupports(components)];
}

function hasStructuralComponent(components) {
	return (
		components.extraction_dependency_score !== null ||
		components.extraction_autonomy_score !== null ||
		components.productive_capability_score !== null ||
		components.productive_complexity_score !== null ||
		components.value_capture_score !== null ||
		components.geopolitical_financial_power_score !== null
	);
}

function isDisputedRegistryRecord(registryRecord) {
	return (
		registryRecord.map_unit_type === 'disputed' || registryRecord.recognition_status === 'disputed'
	);
}

function isSpecialOrTerritory(registryRecord) {
	return registryRecord.map_unit_type === 'territory' || registryRecord.map_unit_type === 'special';
}

function sourceForComponents(components) {
	if (isFiniteNumber(components.productive_capability_score)) {
		return 'derived_productive_capability_proxy';
	}

	return hasStructuralComponent(components)
		? 'derived_conservative_structural_proxy'
		: 'derived_world_bank_quality_proxy';
}

function confidenceFor(classValue, components, positiveSupportCount, signalsConflict) {
	if (classValue === 'core') {
		if (components.productive_capability_data_quality === 'partial') return 'low';
		return positiveSupportCount >= 1 && hasExtractionData(components) ? 'medium' : 'low';
	}
	if (!hasStructuralComponent(components)) return 'low';
	if (signalsConflict) return 'low';
	return 'medium';
}

function hasExtractionData(components) {
	return (
		isFiniteNumber(components.extraction_dependency_score) ||
		isFiniteNumber(components.extraction_autonomy_score)
	);
}

function curatedOverrideRecordFor(
	registryRecord,
	overrideRecord,
	qualityRecord,
	extractionRecord,
	productiveRecord,
	productiveCapabilityRecord
) {
	const overrideWorldSystem = overrideRecord.world_system ?? {};
	const classValue = validClasses.has(overrideWorldSystem.class)
		? overrideWorldSystem.class
		: 'uncertain';
	const components = componentsFromRecords(
		qualityRecord,
		extractionRecord,
		productiveRecord,
		productiveCapabilityRecord
	);
	const positiveSupports = positiveStructuralSupports(components);
	const filterSupports = negativeOrFilterSupports(components);
	const supports = structuralSupports(components);
	const rationale =
		typeof overrideWorldSystem.rationale === 'string' &&
		overrideWorldSystem.rationale.trim().length > 0
			? overrideWorldSystem.rationale.trim()
			: null;

	return {
		id: registryRecord.id,
		world_system: {
			class: classValue,
			score: normalizeScoreToHundred(overrideWorldSystem.score),
			confidence: ['low', 'medium', 'high'].includes(overrideWorldSystem.confidence)
				? overrideWorldSystem.confidence
				: 'medium',
			source: 'curated_reviewed',
			explanation:
				rationale ??
				'Manual curated_reviewed override is missing a rationale and should be corrected before publication.',
			rationale,
			reviewed_by: overrideWorldSystem.reviewed_by ?? null,
			reviewed_at: overrideWorldSystem.reviewed_at ?? null
		},
		components: {
			...components,
			structural_supports: supports,
			positive_structural_supports: positiveSupports,
			negative_or_filter_supports: filterSupports,
			previous_proxy_class: classValue,
			downgraded_from_previous_proxy_core: false,
			classification_reason: 'curated_reviewed_override'
		},
		review_status: 'reviewed',
		classification_status: 'curated_reviewed'
	};
}

function demoRecordFor(
	registryRecord,
	demoUnit,
	qualityRecord,
	extractionRecord,
	productiveRecord,
	productiveCapabilityRecord
) {
	const demoWorldSystem = demoUnit.world_system ?? {};
	const demoClass = validClasses.has(demoWorldSystem.class) ? demoWorldSystem.class : 'uncertain';
	const classValue = demoClass === 'core' ? 'semi-periphery' : demoClass;
	const score = normalizeScoreToHundred(demoWorldSystem.score);
	const confidence = ['low', 'medium', 'high'].includes(demoWorldSystem.confidence)
		? demoWorldSystem.confidence
		: 'medium';
	const components = componentsFromRecords(
		qualityRecord,
		extractionRecord,
		productiveRecord,
		productiveCapabilityRecord
	);
	const positiveSupports = positiveStructuralSupports(components);
	const filterSupports = negativeOrFilterSupports(components);
	const supports = structuralSupports(components);
	const reinterpretedCore = demoClass === 'core';

	return {
		id: registryRecord.id,
		world_system: {
			class: classValue,
			score,
			confidence: reinterpretedCore ? 'low' : confidence,
			source: reinterpretedCore ? 'legacy_demo_seed_reinterpreted' : 'legacy_demo_seed',
			explanation: reinterpretedCore
				? 'Original demo seed marked this as core, but demo data are not treated as real curated classification. Without reviewed classification or sufficient productive capability support, provisional class is semi-periphery.'
				: `${demoWorldSystem.explanation ?? 'Demo seed world-system class.'} This record is a UI/demo seed from static/data/world-system.latest.json and is not a reviewed structural classification.`
		},
		components: {
			...components,
			structural_supports: supports,
			positive_structural_supports: positiveSupports,
			negative_or_filter_supports: filterSupports,
			previous_proxy_class: demoClass,
			downgraded_from_previous_proxy_core: reinterpretedCore,
			classification_reason: reinterpretedCore
				? 'legacy_demo_seed_core_reinterpreted_without_structural_evidence'
				: 'legacy_demo_seed'
		},
		review_status: 'needs_review',
		classification_status: 'demo_only'
	};
}

function noDataRecord(
	registryRecord,
	qualityRecord,
	extractionRecord,
	productiveRecord,
	productiveCapabilityRecord,
	classValue = 'no_data',
	explanation = null
) {
	const components = componentsFromRecords(
		qualityRecord,
		extractionRecord,
		productiveRecord,
		productiveCapabilityRecord
	);
	return {
		id: registryRecord.id,
		world_system: {
			class: classValue,
			score: null,
			confidence: 'low',
			source: sourceForComponents(components),
			explanation:
				explanation ??
				'No sufficient World Bank quality-of-life or income data is available for this provisional proxy.'
		},
		components: {
			...components,
			structural_supports: [],
			positive_structural_supports: [],
			negative_or_filter_supports: [],
			previous_proxy_class: 'no_data',
			downgraded_from_previous_proxy_core: false,
			classification_reason: classValue
		},
		review_status: 'needs_review',
		classification_status: 'provisional_model'
	};
}

function derivedRecordFor(
	registryRecord,
	qualityRecord,
	extractionRecord,
	productiveRecord,
	productiveCapabilityRecord
) {
	const components = componentsFromRecords(
		qualityRecord,
		extractionRecord,
		productiveRecord,
		productiveCapabilityRecord
	);
	const qualityScore = isFiniteNumber(qualityRecord?.quality_of_life_score)
		? clamp(qualityRecord.quality_of_life_score, 0, 1)
		: null;
	const income = qualityRecord?.values?.gni_per_capita_ppp?.value;
	const incomeSignal = normalizedLogIncome(income);
	const score = previousProxyScore(qualityScore, incomeSignal);
	const previousClass = previousProxyClassFromScore(score);
	const positiveSupports = positiveStructuralSupports(components);
	const filterSupports = negativeOrFilterSupports(components);
	const supports = structuralSupports(components);
	const hasQualityOrIncome = qualityScore !== null || incomeSignal !== null;
	const hasAnyStructuralData = hasStructuralComponent(components);
	const disputed = isDisputedRegistryRecord(registryRecord);
	const specialOrTerritory = isSpecialOrTerritory(registryRecord);

	if (disputed) {
		return noDataRecord(
			registryRecord,
			qualityRecord,
			extractionRecord,
			productiveRecord,
			productiveCapabilityRecord,
			'disputed',
			'Disputed map unit without explicit curated classification. The provisional model does not decide sovereignty disputes.'
		);
	}

	if (specialOrTerritory) {
		const classValue = hasQualityOrIncome || hasAnyStructuralData ? 'uncertain' : 'no_data';
		return noDataRecord(
			registryRecord,
			qualityRecord,
			extractionRecord,
			productiveRecord,
			productiveCapabilityRecord,
			classValue,
			classValue === 'uncertain'
				? 'Special or territory record with comparability problems. Provisional classification is uncertain until reviewed against comparable structural data.'
				: 'Special or territory record without comparable quality-of-life, extraction, or productive-complexity data in the current proxy model.'
		);
	}

	if (!hasQualityOrIncome && !hasAnyStructuralData) {
		return noDataRecord(registryRecord, null, null, null, null);
	}

	const highQualityResourceConflict =
		qualityScore !== null &&
		qualityScore >= 0.8 &&
		isFiniteNumber(components.extraction_dependency_score) &&
		components.extraction_dependency_score >= 45;
	const highIncomeResourceConflict =
		incomeSignal !== null &&
		incomeSignal >= 0.8 &&
		isFiniteNumber(components.extraction_dependency_score) &&
		components.extraction_dependency_score >= 45;
	const highExtractionDependency =
		isFiniteNumber(components.extraction_dependency_score) &&
		components.extraction_dependency_score >= 55;
	const lowExtractionAutonomy =
		isFiniteNumber(components.extraction_autonomy_score) &&
		components.extraction_autonomy_score < 35;
	const coreBlockedByExtraction =
		isFiniteNumber(components.extraction_dependency_score) &&
		components.extraction_dependency_score > 25;
	const coreBlockedByAutonomy =
		isFiniteNumber(components.extraction_autonomy_score) &&
		components.extraction_autonomy_score < 65;
	const signalsConflict = highQualityResourceConflict || highIncomeResourceConflict;
	const productiveCapabilityCoreSupport =
		isFiniteNumber(components.productive_capability_score) &&
		components.productive_capability_score >= 70 &&
		components.productive_capability_data_quality !== 'sparse';
	const missingPositiveCoreEvidence = !productiveCapabilityCoreSupport;
	const hasSemiSignal =
		(qualityScore !== null && qualityScore >= 0.65) ||
		(isFiniteNumber(components.extraction_autonomy_score) &&
			components.extraction_autonomy_score >= 45) ||
		(isFiniteNumber(components.productive_capability_score) &&
			components.productive_capability_score >= 45) ||
		(isFiniteNumber(components.productive_complexity_score) &&
			components.productive_complexity_score >= 45);
	const hasPeripherySignal =
		(qualityScore !== null && qualityScore < 0.55) ||
		highExtractionDependency ||
		lowExtractionAutonomy;
	const coreRequirementsMet =
		qualityScore !== null &&
		qualityScore >= 0.88 &&
		productiveCapabilityCoreSupport &&
		!coreBlockedByExtraction &&
		!coreBlockedByAutonomy;

	let classValue;
	let reason;
	let explanation;

	if (signalsConflict) {
		classValue = 'uncertain';
		reason = 'conflicting_high_welfare_and_extraction_dependency';
		explanation =
			'Indicators conflict strongly: welfare or income proxy is high, but extraction dependency is also high. Provisional classification is uncertain pending structural value-chain review.';
	} else if (coreRequirementsMet) {
		classValue = 'core';
		reason = 'provisional_core_with_productive_capability_support';
		explanation =
			'Provisional core candidate based on high welfare, low extraction dependency, and productive capability proxy. Final core status requires value-capture/GVC evidence.';
	} else if (qualityScore !== null && qualityScore >= 0.88 && missingPositiveCoreEvidence) {
		classValue = 'semi-periphery';
		reason = 'core_like_welfare_autonomy_missing_productive_capability_support';
		explanation =
			'Core-like welfare/autonomy profile, but positive productive capability evidence is missing or insufficient.';
	} else if (hasSemiSignal) {
		classValue = 'semi-periphery';
		reason = 'mixed_or_structurally_unconfirmed_position';
		explanation =
			'Provisional semi-periphery: available welfare, extraction autonomy, or productive-complexity signals suggest a mixed or core-like but structurally unconfirmed position. Semi-periphery is treated as a mixed structural position, not a residual income category.';
	} else if (hasPeripherySignal) {
		classValue = 'periphery';
		reason = 'low_welfare_or_extraction_dependency_signal';
		explanation =
			'Provisional periphery: available indicators show low welfare proxy, high extraction dependency, or low extraction autonomy. This remains provisional pending fuller structural data.';
	} else if (!hasQualityOrIncome && hasAnyStructuralData) {
		classValue = 'uncertain';
		reason = 'structural_data_without_welfare_proxy';
		explanation =
			'Structural component data exists, but quality-of-life and income proxies are missing. Provisional classification is uncertain pending comparable welfare and value-chain evidence.';
	} else {
		classValue = 'uncertain';
		reason = 'insufficient_or_ambiguous_evidence';
		explanation =
			'Available indicators are insufficient or ambiguous for a conservative provisional world-system class.';
	}

	const downgraded = previousClass === 'core' && classValue !== 'core';
	const confidence =
		reason === 'core_like_welfare_autonomy_missing_productive_capability_support'
			? 'low'
			: confidenceFor(classValue, components, positiveSupports.length, signalsConflict);

	return {
		id: registryRecord.id,
		world_system: {
			class: classValue,
			score,
			confidence,
			source: sourceForComponents(components),
			explanation
		},
		components: {
			...components,
			structural_supports: supports,
			positive_structural_supports: positiveSupports,
			negative_or_filter_supports: filterSupports,
			previous_proxy_class: previousClass,
			downgraded_from_previous_proxy_core: downgraded,
			classification_reason: reason
		},
		review_status: 'needs_review',
		classification_status: 'provisional_model'
	};
}

function diagnosticsFor(records, registry) {
	const registryById = new Map(registry.map((record) => [record.id, record]));
	const distribution = records.reduce((counts, record) => {
		const classValue = record.world_system.class;
		counts[classValue] = (counts[classValue] ?? 0) + 1;
		return counts;
	}, {});
	const previousProxyCoreCount = records.filter(
		(record) => record.components.previous_proxy_class === 'core'
	).length;
	const downgraded = records
		.filter((record) => record.components.downgraded_from_previous_proxy_core)
		.sort(
			(a, b) =>
				(b.components.quality_of_life_score ?? -1) - (a.components.quality_of_life_score ?? -1)
		);
	const coreCandidates = records
		.filter((record) => record.world_system.class === 'core')
		.sort((a, b) => (b.world_system.score ?? -1) - (a.world_system.score ?? -1));
	const derivedCoreCount = coreCandidates.filter((record) =>
		record.world_system.source.startsWith('derived')
	).length;
	const derivedProductiveCapabilityCore = coreCandidates.filter(
		(record) =>
			record.world_system.source === 'derived_productive_capability_proxy' ||
			record.components.classification_reason ===
				'provisional_core_with_productive_capability_support'
	);
	const curatedReviewedCoreCount = coreCandidates.filter(
		(record) => record.world_system.source === 'curated_reviewed'
	).length;
	const demoSeedReinterpreted = records
		.filter((record) => record.world_system.source === 'legacy_demo_seed_reinterpreted')
		.sort((a, b) => (b.world_system.score ?? -1) - (a.world_system.score ?? -1));
	const legacyDemoSeedCount = records.filter(
		(record) =>
			record.world_system.source === 'legacy_demo_seed' ||
			record.world_system.source === 'legacy_demo_seed_reinterpreted'
	).length;
	const highScoreNonCore = records
		.filter(
			(record) => record.world_system.class !== 'core' && (record.world_system.score ?? -1) >= 78
		)
		.sort((a, b) => (b.world_system.score ?? -1) - (a.world_system.score ?? -1));
	const preventedMissingPositive = records
		.filter(
			(record) =>
				record.components.classification_reason ===
				'core_like_welfare_autonomy_missing_productive_capability_support'
		)
		.sort((a, b) => (b.world_system.score ?? -1) - (a.world_system.score ?? -1));
	const topProductiveCapabilityScores = records
		.filter((record) => isFiniteNumber(record.components.productive_capability_score))
		.sort(
			(a, b) =>
				(b.components.productive_capability_score ?? -1) -
				(a.components.productive_capability_score ?? -1)
		);
	const highScoreKeptSemiByProductiveCapability = records
		.filter(
			(record) =>
				record.world_system.class === 'semi-periphery' &&
				(record.world_system.score ?? -1) >= 78 &&
				(!isFiniteNumber(record.components.productive_capability_score) ||
					record.components.productive_capability_score < 70 ||
					record.components.productive_capability_data_quality === 'sparse')
		)
		.sort((a, b) => (b.world_system.score ?? -1) - (a.world_system.score ?? -1));
	const movedFromSemiToCoreByProductiveCapability = derivedProductiveCapabilityCore
		.filter(
			(record) =>
				record.components.previous_proxy_class === 'semi-periphery' ||
				record.components.classification_reason ===
					'provisional_core_with_productive_capability_support'
		)
		.sort(
			(a, b) =>
				(b.components.productive_capability_score ?? -1) -
				(a.components.productive_capability_score ?? -1)
		);

	const summarize = (record) => ({
		id: record.id,
		name: registryById.get(record.id)?.display_name ?? record.id,
		class: record.world_system.class,
		score: record.world_system.score,
		confidence: record.world_system.confidence,
		quality_of_life_score: record.components.quality_of_life_score,
		extraction_dependency_score: record.components.extraction_dependency_score,
		extraction_autonomy_score: record.components.extraction_autonomy_score,
		productive_complexity_score: record.components.productive_complexity_score,
		productive_capability_score: record.components.productive_capability_score,
		productive_capability_data_quality: record.components.productive_capability_data_quality,
		value_capture_score: record.components.value_capture_score,
		geopolitical_financial_power_score: record.components.geopolitical_financial_power_score,
		structural_supports: record.components.structural_supports,
		positive_structural_supports: record.components.positive_structural_supports,
		negative_or_filter_supports: record.components.negative_or_filter_supports,
		reason: record.components.classification_reason
	});

	return {
		total_records: records.length,
		previous_proxy_core_count: previousProxyCoreCount,
		class_distribution: distribution,
		core_count: coreCandidates.length,
		derived_core_count: derivedCoreCount,
		derived_productive_capability_core_count: derivedProductiveCapabilityCore.length,
		curated_reviewed_core_count: curatedReviewedCoreCount,
		legacy_demo_seed_count: legacyDemoSeedCount,
		demo_seed_reinterpreted_count: demoSeedReinterpreted.length,
		high_score_non_core_count: highScoreNonCore.length,
		downgraded_from_previous_proxy_core_count: downgraded.length,
		core_candidates: coreCandidates.slice(0, 30).map(summarize),
		demo_seed_reinterpreted: demoSeedReinterpreted.slice(0, 60).map(summarize),
		high_score_non_core: highScoreNonCore.slice(0, 30).map(summarize),
		prevented_missing_positive_structural_evidence: preventedMissingPositive
			.slice(0, 60)
			.map(summarize),
		top_productive_capability_scores: topProductiveCapabilityScores.slice(0, 30).map(summarize),
		high_score_kept_semi_periphery_productive_capability_missing_low:
			highScoreKeptSemiByProductiveCapability.slice(0, 30).map(summarize),
		moved_from_semi_periphery_to_core_by_productive_capability:
			movedFromSemiToCoreByProductiveCapability.slice(0, 30).map(summarize),
		downgraded_high_quality: downgraded.slice(0, 30).map(summarize)
	};
}

async function main() {
	const [
		registry,
		qualityOfLife,
		worldSystemDemo,
		extractionDependency,
		productiveComplexity,
		productiveCapability,
		curatedOverrides
	] = await Promise.all([
		readJson(paths.registry),
		readJson(paths.qualityOfLife),
		readJson(paths.worldSystemDemo),
		readJsonIfPresent(paths.extractionDependency),
		readJsonIfPresent(paths.productiveComplexity),
		readJsonIfPresent(paths.productiveCapability),
		readJsonIfPresent(paths.curatedOverrides)
	]);
	const demoById = normalizeWorldSystemDemoData(worldSystemDemo);
	const curatedOverrideById = normalizeCuratedOverrides(curatedOverrides);
	const qualityById = new Map((qualityOfLife.records ?? []).map((record) => [record.id, record]));
	const extractionById = recordsById(extractionDependency, (record) =>
		isFiniteNumber(record.extraction_autonomy_score)
	);
	const productiveById = recordsById(productiveComplexity, (record) =>
		isFiniteNumber(record.productive_complexity_score)
	);
	const productiveCapabilityById = recordsById(productiveCapability, (record) =>
		isFiniteNumber(record.productive_capability_score)
	);

	const records = registry.map((registryRecord) => {
		const curatedOverride = curatedOverrideById.get(registryRecord.id);
		const demoUnit = demoById.get(registryRecord.id);
		const qualityRecord = qualityById.get(registryRecord.id);
		const extractionRecord = extractionById.get(registryRecord.id);
		const productiveRecord = productiveById.get(registryRecord.id);
		const productiveCapabilityRecord = productiveCapabilityById.get(registryRecord.id);

		return curatedOverride
			? curatedOverrideRecordFor(
					registryRecord,
					curatedOverride,
					qualityRecord,
					extractionRecord,
					productiveRecord,
					productiveCapabilityRecord
				)
			: demoUnit
				? demoRecordFor(
						registryRecord,
						demoUnit,
						qualityRecord,
						extractionRecord,
						productiveRecord,
						productiveCapabilityRecord
					)
				: derivedRecordFor(
						registryRecord,
						qualityRecord,
						extractionRecord,
						productiveRecord,
						productiveCapabilityRecord
					);
	});

	const diagnostics = diagnosticsFor(records, registry);

	const output = {
		dataset_id: 'world_system_provisional_latest',
		source_ids: [
			'world_bank_wdi',
			'world_bank_wdi_extraction',
			'atlas_economic_complexity',
			'legacy_demo_seed',
			'world_system_curated_overrides'
		],
		model_status: 'provisional_conservative_proxy',
		generated_at: new Date().toISOString(),
		methodology_note: methodologyNote,
		records,
		diagnostics,
		notes
	};

	await mkdir(path.dirname(paths.output), { recursive: true });
	await writeFile(paths.output, `${JSON.stringify(output, null, '\t')}\n`);

	console.log(`Wrote ${path.relative(repoRoot, paths.output)}`);
	console.log(`Total records: ${diagnostics.total_records}`);
	console.log(`Class distribution: ${JSON.stringify(diagnostics.class_distribution, null, 2)}`);
	console.log(`Core count: ${diagnostics.core_count}`);
	console.log(`Derived core count: ${diagnostics.derived_core_count}`);
	console.log(
		`Derived productive-capability core count: ${diagnostics.derived_productive_capability_core_count}`
	);
	console.log(`Curated reviewed core count: ${diagnostics.curated_reviewed_core_count}`);
	console.log(`Legacy demo seed records: ${diagnostics.legacy_demo_seed_count}`);
	console.log(`Demo seed records reinterpreted: ${diagnostics.demo_seed_reinterpreted_count}`);
	console.log(`High-score non-core count: ${diagnostics.high_score_non_core_count}`);
	console.log(`Previous proxy core count: ${diagnostics.previous_proxy_core_count}`);
	console.log(
		`Records downgraded from previous proxy core: ${diagnostics.downgraded_from_previous_proxy_core_count}`
	);
	console.log(
		'Records prevented from becoming core because positive structural evidence is missing:'
	);
	console.log(JSON.stringify(diagnostics.prevented_missing_positive_structural_evidence, null, 2));
	console.log('Top 30 productive capability scores:');
	console.log(JSON.stringify(diagnostics.top_productive_capability_scores, null, 2));
	console.log(
		'High-score countries kept semi-periphery because productive capability is missing/low:'
	);
	console.log(
		JSON.stringify(
			diagnostics.high_score_kept_semi_periphery_productive_capability_missing_low,
			null,
			2
		)
	);
	console.log('Countries moved from semi-periphery to core by productive capability support:');
	console.log(
		JSON.stringify(diagnostics.moved_from_semi_periphery_to_core_by_productive_capability, null, 2)
	);
	console.log('Top 30 core candidates with components:');
	console.log(JSON.stringify(diagnostics.core_candidates, null, 2));
	console.log('Demo seed records reinterpreted:');
	console.log(JSON.stringify(diagnostics.demo_seed_reinterpreted, null, 2));
	console.log('Top 30 high-score non-core countries:');
	console.log(JSON.stringify(diagnostics.high_score_non_core, null, 2));
	console.log('Top 30 downgraded high-quality countries with reason:');
	console.log(JSON.stringify(diagnostics.downgraded_high_quality, null, 2));
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
