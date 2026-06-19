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
	'Extraction autonomy is a negative filter/corroborating condition, not positive proof of core status.',
	'Derived core status requires positive structural support from productive complexity, value capture, geopolitical-financial power, or curated review.',
	'Many high-income countries may be provisionally semi-periphery until GVC/value-capture data are added.',
	'Future versions should include value-chain position, ecological externalization, trade structure, extraction, financial centrality, and conflict/political indicators.'
];

const methodologyNote =
	'Experimental conservative provisional world-system proxy. Existing demo world-system records are preserved as demo_curated. Other records use World Bank WDI quality-of-life and income-related indicators only as welfare proxies. Derived core requires positive structural evidence such as productive complexity, value capture, geopolitical-financial power, or curated/demo review, plus low extraction-dependency/autonomy filters. Extraction autonomy and low extraction dependency can corroborate core but cannot create it. High quality-of-life alone is capped at semi-periphery or uncertain. This is not a final Wallersteinian or dependency-theory classification.';

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

function componentsFromRecords(qualityRecord, extractionRecord, productiveRecord) {
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
		geopolitical_financial_power_score: null
	};
}

function emptyComponents() {
	return componentsFromRecords(null, null, null);
}

function positiveStructuralSupports(components, curatedCore = false) {
	const supports = [];

	if (
		isFiniteNumber(components.productive_complexity_score) &&
		components.productive_complexity_score >= 75
	) {
		supports.push('productive_complexity_score >= 75');
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
	if (curatedCore) {
		supports.push('curated/demo class was already core');
	}

	return supports;
}

function negativeOrFilterSupports(components) {
	const supports = [];

	if (isFiniteNumber(components.extraction_autonomy_score) && components.extraction_autonomy_score >= 75) {
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

function structuralSupports(components, curatedCore = false) {
	return [
		...positiveStructuralSupports(components, curatedCore),
		...negativeOrFilterSupports(components)
	];
}

function hasStructuralComponent(components) {
	return (
		components.extraction_dependency_score !== null ||
		components.extraction_autonomy_score !== null ||
		components.productive_complexity_score !== null ||
		components.value_capture_score !== null ||
		components.geopolitical_financial_power_score !== null
	);
}

function isDisputedRegistryRecord(registryRecord) {
	return (
		registryRecord.map_unit_type === 'disputed' ||
		registryRecord.recognition_status === 'disputed'
	);
}

function isSpecialOrTerritory(registryRecord) {
	return registryRecord.map_unit_type === 'territory' || registryRecord.map_unit_type === 'special';
}

function sourceForComponents(components) {
	return hasStructuralComponent(components)
		? 'derived_conservative_structural_proxy'
		: 'derived_world_bank_quality_proxy';
}

function confidenceFor(classValue, components, positiveSupportCount, signalsConflict) {
	if (classValue === 'core') {
		return positiveSupportCount >= 1 ? 'medium' : 'low';
	}
	if (!hasStructuralComponent(components)) return 'low';
	if (signalsConflict) return 'low';
	return 'medium';
}

function demoRecordFor(registryRecord, demoUnit, qualityRecord, extractionRecord, productiveRecord) {
	const demoWorldSystem = demoUnit.world_system ?? {};
	const classValue = validClasses.has(demoWorldSystem.class) ? demoWorldSystem.class : 'uncertain';
	const score = normalizeScoreToHundred(demoWorldSystem.score);
	const confidence = ['low', 'medium', 'high'].includes(demoWorldSystem.confidence)
		? demoWorldSystem.confidence
		: 'medium';
	const components = componentsFromRecords(qualityRecord, extractionRecord, productiveRecord);
	const positiveSupports = positiveStructuralSupports(components, classValue === 'core');
	const filterSupports = negativeOrFilterSupports(components);
	const supports = structuralSupports(components, classValue === 'core');

	return {
		id: registryRecord.id,
		world_system: {
			class: classValue,
			score,
			confidence,
			source: 'demo_curated',
			explanation: `${demoWorldSystem.explanation ?? 'Demo curated world-system class.'} This record is preserved from static/data/world-system.latest.json demo data and needs methodological review.`
		},
		components: {
			...components,
			structural_supports: supports,
			positive_structural_supports: positiveSupports,
			negative_or_filter_supports: filterSupports,
			previous_proxy_class: classValue,
			downgraded_from_previous_proxy_core: false,
			classification_reason: 'demo_curated_preserved'
		},
		review_status: demoUnit.review_status === 'reviewed' ? 'reviewed' : 'needs_review'
	};
}

function noDataRecord(
	registryRecord,
	qualityRecord,
	extractionRecord,
	productiveRecord,
	classValue = 'no_data',
	explanation = null
) {
	const components = componentsFromRecords(qualityRecord, extractionRecord, productiveRecord);
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
		review_status: 'needs_review'
	};
}

function derivedRecordFor(registryRecord, qualityRecord, extractionRecord, productiveRecord) {
	const components = componentsFromRecords(qualityRecord, extractionRecord, productiveRecord);
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
			classValue,
			classValue === 'uncertain'
				? 'Special or territory record with comparability problems. Provisional classification is uncertain until reviewed against comparable structural data.'
				: 'Special or territory record without comparable quality-of-life, extraction, or productive-complexity data in the current proxy model.'
		);
	}

	if (!hasQualityOrIncome && !hasAnyStructuralData) {
		return noDataRecord(registryRecord, null, null, null);
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
		components.extraction_dependency_score >= 35;
	const signalsConflict = highQualityResourceConflict || highIncomeResourceConflict;
	const missingPositiveCoreEvidence = positiveSupports.length === 0;
	const hasSemiSignal =
		(qualityScore !== null && qualityScore >= 0.65) ||
		(isFiniteNumber(components.extraction_autonomy_score) &&
			components.extraction_autonomy_score >= 45) ||
		(isFiniteNumber(components.productive_complexity_score) &&
			components.productive_complexity_score >= 45);
	const hasPeripherySignal =
		(qualityScore !== null && qualityScore < 0.55) ||
		highExtractionDependency ||
		lowExtractionAutonomy;
	const coreRequirementsMet =
		qualityScore !== null &&
		qualityScore >= 0.88 &&
		positiveSupports.length >= 1 &&
		filterSupports.length >= 1 &&
		!coreBlockedByExtraction;

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
		reason = 'conservative_core_with_positive_structural_support';
		explanation = `Provisional conservative core: quality-of-life score is at least 0.88, positive structural support is present (${positiveSupports.join(', ')}), and extraction-dependency/autonomy filters corroborate the classification (${filterSupports.join(', ')}). This remains provisional until value-capture/GVC evidence is added.`;
	} else if (qualityScore !== null && qualityScore >= 0.88 && missingPositiveCoreEvidence) {
		classValue = 'semi-periphery';
		reason = 'core_like_welfare_autonomy_missing_positive_structural_evidence';
		explanation =
			'Core-like welfare/autonomy profile, but no positive structural evidence of value capture or productive complexity is currently available.';
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
		reason === 'core_like_welfare_autonomy_missing_positive_structural_evidence'
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
		review_status: 'needs_review'
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
	const curatedDemoCoreCount = coreCandidates.filter(
		(record) => record.world_system.source === 'demo_curated'
	).length;
	const highScoreNonCore = records
		.filter((record) => record.world_system.class !== 'core' && (record.world_system.score ?? -1) >= 78)
		.sort((a, b) => (b.world_system.score ?? -1) - (a.world_system.score ?? -1));
	const preventedMissingPositive = records
		.filter(
			(record) =>
				record.components.classification_reason ===
				'core_like_welfare_autonomy_missing_positive_structural_evidence'
		)
		.sort((a, b) => (b.world_system.score ?? -1) - (a.world_system.score ?? -1));

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
		curated_demo_core_count: curatedDemoCoreCount,
		high_score_non_core_count: highScoreNonCore.length,
		downgraded_from_previous_proxy_core_count: downgraded.length,
		core_candidates: coreCandidates.slice(0, 30).map(summarize),
		high_score_non_core: highScoreNonCore.slice(0, 30).map(summarize),
		prevented_missing_positive_structural_evidence: preventedMissingPositive
			.slice(0, 60)
			.map(summarize),
		downgraded_high_quality: downgraded.slice(0, 30).map(summarize)
	};
}

async function main() {
	const [registry, qualityOfLife, worldSystemDemo, extractionDependency, productiveComplexity] =
		await Promise.all([
			readJson(paths.registry),
			readJson(paths.qualityOfLife),
			readJson(paths.worldSystemDemo),
			readJsonIfPresent(paths.extractionDependency),
			readJsonIfPresent(paths.productiveComplexity)
		]);
	const demoById = normalizeWorldSystemDemoData(worldSystemDemo);
	const qualityById = new Map((qualityOfLife.records ?? []).map((record) => [record.id, record]));
	const extractionById = recordsById(extractionDependency, (record) =>
		isFiniteNumber(record.extraction_autonomy_score)
	);
	const productiveById = recordsById(productiveComplexity, (record) =>
		isFiniteNumber(record.productive_complexity_score)
	);

	const records = registry.map((registryRecord) => {
		const demoUnit = demoById.get(registryRecord.id);
		const qualityRecord = qualityById.get(registryRecord.id);
		const extractionRecord = extractionById.get(registryRecord.id);
		const productiveRecord = productiveById.get(registryRecord.id);

		return demoUnit
			? demoRecordFor(
					registryRecord,
					demoUnit,
					qualityRecord,
					extractionRecord,
					productiveRecord
				)
			: derivedRecordFor(registryRecord, qualityRecord, extractionRecord, productiveRecord);
	});

	const diagnostics = diagnosticsFor(records, registry);

	const output = {
		dataset_id: 'world_system_provisional_latest',
		source_ids: [
			'world_bank_wdi',
			'world_bank_wdi_extraction',
			'atlas_economic_complexity',
			'mock_demo_data'
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
	console.log(`Curated/demo core count: ${diagnostics.curated_demo_core_count}`);
	console.log(`High-score non-core count: ${diagnostics.high_score_non_core_count}`);
	console.log(`Previous proxy core count: ${diagnostics.previous_proxy_core_count}`);
	console.log(
		`Records downgraded from previous proxy core: ${diagnostics.downgraded_from_previous_proxy_core_count}`
	);
	console.log('Records prevented from becoming core because positive structural evidence is missing:');
	console.log(JSON.stringify(diagnostics.prevented_missing_positive_structural_evidence, null, 2));
	console.log('Top 30 core candidates with components:');
	console.log(JSON.stringify(diagnostics.core_candidates, null, 2));
	console.log('Top 30 high-score non-core countries:');
	console.log(JSON.stringify(diagnostics.high_score_non_core, null, 2));
	console.log('Top 30 downgraded high-quality countries with reason:');
	console.log(JSON.stringify(diagnostics.downgraded_high_quality, null, 2));
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
