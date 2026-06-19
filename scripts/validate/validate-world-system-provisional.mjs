import { access, readFile } from 'node:fs/promises';
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
	provisionalWorldSystem: path.join(
		repoRoot,
		'static/data/indicators/world-system.provisional.latest.json'
	)
};

const validClasses = new Set([
	'core',
	'semi-periphery',
	'periphery',
	'uncertain',
	'disputed',
	'no_data'
]);
const validConfidence = new Set(['low', 'medium', 'high']);
const validSources = new Set([
	'derived_world_bank_quality_proxy',
	'derived_conservative_structural_proxy',
	'derived_productive_capability_proxy',
	'legacy_demo_seed',
	'legacy_demo_seed_reinterpreted',
	'curated_reviewed'
]);
const positiveSupportPatterns = [
	'productive_capability',
	'productive_complexity',
	'value_capture',
	'geopolitical_financial_power'
];

async function readJson(filePath) {
	const text = await readFile(filePath, 'utf8');
	return JSON.parse(text);
}

async function exists(filePath) {
	try {
		await access(filePath);
		return true;
	} catch {
		return false;
	}
}

function isObject(value) {
	return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function isFiniteNumber(value) {
	return typeof value === 'number' && Number.isFinite(value);
}

function hasPositiveStructuralSupport(record) {
	const componentSupports = Array.isArray(record.components?.positive_structural_supports)
		? record.components.positive_structural_supports
		: [];
	const legacySupports = Array.isArray(record.components?.structural_supports)
		? record.components.structural_supports
		: [];
	const supports = [...componentSupports, ...legacySupports].map((support) =>
		String(support).toLowerCase()
	);

	return supports.some((support) =>
		positiveSupportPatterns.some((pattern) => support.includes(pattern))
	);
}

function highScoreSemiPeriphery(record) {
	return (
		record.world_system?.class === 'semi-periphery' && (record.world_system?.score ?? -1) >= 78
	);
}

const errors = [];

if (!(await exists(paths.provisionalWorldSystem))) {
	console.error('Missing static/data/indicators/world-system.provisional.latest.json.');
	process.exit(1);
}

const [registry, qualityOfLife, data] = await Promise.all([
	readJson(paths.registry),
	readJson(paths.qualityOfLife),
	readJson(paths.provisionalWorldSystem)
]);
const registryIds = new Set(Array.isArray(registry) ? registry.map((record) => record.id) : []);
const worldBankComparableIds = new Set(
	(qualityOfLife.records ?? [])
		.filter(
			(record) =>
				typeof record.quality_of_life_score === 'number' ||
				typeof record.values?.gni_per_capita_ppp?.value === 'number'
		)
		.map((record) => record.id)
);
const seenIds = new Set();
const distribution = {};
let noDataWithWorldBankData = 0;
const coreRecords = [];
const demoSeedReinterpretedRecords = [];
const highScoreSemiPeripheryRecords = [];

if (data?.dataset_id !== 'world_system_provisional_latest') {
	errors.push('dataset_id must be world_system_provisional_latest.');
}

if (typeof data?.model_status !== 'string' || !data.model_status.includes('provisional')) {
	errors.push('model_status must be a string containing provisional.');
}

if (!Array.isArray(data?.records)) {
	errors.push('records must be an array.');
} else {
	for (const [index, record] of data.records.entries()) {
		const label = isObject(record) && typeof record.id === 'string' ? record.id : `index ${index}`;

		if (!isObject(record)) {
			errors.push(`${label}: record must be an object.`);
			continue;
		}

		if (typeof record.id !== 'string' || record.id.trim().length === 0) {
			errors.push(`${label}: id must be a non-empty string.`);
			continue;
		}

		if (seenIds.has(record.id)) {
			errors.push(`${label}: duplicate id.`);
		}
		seenIds.add(record.id);

		if (!registryIds.has(record.id)) {
			errors.push(`${label}: id is not in map-units registry.`);
		}

		if (!isObject(record.world_system)) {
			errors.push(`${label}: world_system must be an object.`);
			continue;
		}

		const classValue = record.world_system.class;
		distribution[classValue] = (distribution[classValue] ?? 0) + 1;

		if (!validClasses.has(classValue)) {
			errors.push(`${label}: invalid class ${classValue}.`);
		}

		const score = record.world_system.score;
		if (
			score !== null &&
			(typeof score !== 'number' || !Number.isFinite(score) || score < 0 || score > 100)
		) {
			errors.push(`${label}: score must be null or a finite number from 0 to 100.`);
		}

		if (!validConfidence.has(record.world_system.confidence)) {
			errors.push(`${label}: confidence must be low, medium, or high.`);
		}

		if (!validSources.has(record.world_system.source)) {
			errors.push(`${label}: source must be present and valid.`);
		}

		if (!isObject(record.components)) {
			errors.push(`${label}: components must be present.`);
			continue;
		}

		const structuralSupports = Array.isArray(record.components.structural_supports)
			? record.components.structural_supports
			: [];
		const positiveStructuralSupports = Array.isArray(record.components.positive_structural_supports)
			? record.components.positive_structural_supports
			: [];
		const onlyQualityProxy = record.world_system.source === 'derived_world_bank_quality_proxy';
		const curatedReviewed = record.world_system.source === 'curated_reviewed';
		const demoSource = String(record.world_system.source).includes('demo');
		const legacyDemoSource = String(record.world_system.source).includes('legacy_demo');
		const derivedSource = String(record.world_system.source).startsWith('derived');
		const positiveSupportExists = hasPositiveStructuralSupport(record);
		const curatedReviewedWithRationale =
			curatedReviewed &&
			typeof record.world_system.rationale === 'string' &&
			record.world_system.rationale.trim().length > 0;

		if (onlyQualityProxy && classValue === 'core') {
			errors.push(`${label}: quality-only proxy records must not be core.`);
		}

		if ((demoSource || legacyDemoSource) && classValue === 'core') {
			errors.push(`${label}: demo seed records must not be core.`);
		}

		if (
			derivedSource &&
			classValue === 'core' &&
			!isFiniteNumber(record.components.productive_capability_score)
		) {
			errors.push(
				`${label}: derived core requires productive_capability_score data in the provisional model.`
			);
		}

		if (
			derivedSource &&
			classValue === 'core' &&
			(!isFiniteNumber(record.components.productive_capability_score) ||
				record.components.productive_capability_score < 70)
		) {
			errors.push(`${label}: derived core requires productive_capability_score >= 70.`);
		}

		if (
			classValue === 'core' &&
			isFiniteNumber(record.components.extraction_dependency_score) &&
			record.components.extraction_dependency_score > 25
		) {
			errors.push(`${label}: core requires extraction_dependency_score missing or <= 25.`);
		}

		if (classValue === 'core' && record.world_system.confidence === 'high') {
			errors.push(`${label}: confidence must never be high for core in the provisional model.`);
		}

		if (derivedSource && classValue === 'core' && !positiveSupportExists) {
			errors.push(
				`${label}: derived core structural_supports must include productive_complexity, value_capture, or equivalent positive support.`
			);
		}

		if (
			classValue === 'core' &&
			(record.world_system.confidence === 'medium' || record.world_system.confidence === 'high') &&
			!positiveSupportExists &&
			!curatedReviewedWithRationale
		) {
			errors.push(
				`${label}: medium/high-confidence core requires positive structural support or curated_reviewed rationale.`
			);
		}

		if (
			classValue === 'core' &&
			!curatedReviewedWithRationale &&
			positiveStructuralSupports.length === 0
		) {
			errors.push(
				`${label}: core requires positive_structural_supports or curated_reviewed rationale.`
			);
		}

		if (classValue === 'core' && !curatedReviewedWithRationale && !positiveSupportExists) {
			errors.push(
				`${label}: core requires either a curated_reviewed override with rationale or positive structural support such as productive_complexity/value_capture.`
			);
		}

		if (
			typeof record.world_system.explanation !== 'string' ||
			record.world_system.explanation.trim().length === 0
		) {
			errors.push(`${label}: explanation must be present.`);
		}

		if (typeof record.review_status !== 'string' || record.review_status.trim().length === 0) {
			errors.push(`${label}: review_status must be present.`);
		}

		if (classValue === 'no_data' && worldBankComparableIds.has(record.id)) {
			noDataWithWorldBankData += 1;
		}

		if (classValue === 'core') {
			coreRecords.push({
				id: record.id,
				source: record.world_system.source,
				confidence: record.world_system.confidence,
				score: record.world_system.score,
				structural_supports: structuralSupports,
				positive_structural_supports: positiveStructuralSupports,
				negative_or_filter_supports: record.components.negative_or_filter_supports ?? [],
				reason: record.components.classification_reason,
				explanation: record.world_system.explanation
			});
		}

		if (record.world_system.source === 'legacy_demo_seed_reinterpreted') {
			demoSeedReinterpretedRecords.push({
				id: record.id,
				class: classValue,
				score: record.world_system.score,
				confidence: record.world_system.confidence,
				source: record.world_system.source,
				reason: record.components.classification_reason,
				explanation: record.world_system.explanation
			});
		}

		if (highScoreSemiPeriphery(record)) {
			highScoreSemiPeripheryRecords.push({
				id: record.id,
				score: record.world_system.score,
				confidence: record.world_system.confidence,
				source: record.world_system.source,
				quality_of_life_score: record.components.quality_of_life_score,
				productive_capability_score: record.components.productive_capability_score,
				productive_capability_data_quality: record.components.productive_capability_data_quality,
				productive_complexity_score: record.components.productive_complexity_score,
				value_capture_score: record.components.value_capture_score,
				structural_supports: structuralSupports,
				reason: record.components.classification_reason
			});
		}
	}
}

const comparableCount = worldBankComparableIds.size;
const noDataComparableRatio = comparableCount === 0 ? 0 : noDataWithWorldBankData / comparableCount;

console.log('Provisional world-system validation report');
console.log(`Records: ${Array.isArray(data?.records) ? data.records.length : 0}`);
console.log(`Registry ids: ${registryIds.size}`);
console.log(`World Bank comparable ids: ${comparableCount}`);
console.log(`Class distribution: ${JSON.stringify(distribution, null, 2)}`);
console.log(`Core records: ${JSON.stringify(coreRecords, null, 2)}`);
console.log(
	`Demo seed records reinterpreted: ${JSON.stringify(demoSeedReinterpretedRecords, null, 2)}`
);
console.log(
	`High-score semi-periphery records: ${JSON.stringify(highScoreSemiPeripheryRecords, null, 2)}`
);
console.log(
	`no_data among World Bank comparable ids: ${noDataWithWorldBankData}/${comparableCount}`
);
console.log(`Model status: ${data?.model_status ?? 'missing'}`);
console.log(
	`Downgraded/core candidate diagnostics: ${JSON.stringify(
		{
			previous_proxy_core_count: data?.diagnostics?.previous_proxy_core_count ?? null,
			downgraded_from_previous_proxy_core_count:
				data?.diagnostics?.downgraded_from_previous_proxy_core_count ?? null,
			core_count: data?.diagnostics?.core_count ?? null,
			derived_core_count: data?.diagnostics?.derived_core_count ?? null,
			curated_reviewed_core_count: data?.diagnostics?.curated_reviewed_core_count ?? null,
			demo_seed_reinterpreted_count: data?.diagnostics?.demo_seed_reinterpreted_count ?? null,
			high_score_non_core_count: data?.diagnostics?.high_score_non_core_count ?? null,
			core_candidate_count: Array.isArray(data?.diagnostics?.core_candidates)
				? data.diagnostics.core_candidates.length
				: null,
			downgraded_high_quality_count: Array.isArray(data?.diagnostics?.downgraded_high_quality)
				? data.diagnostics.downgraded_high_quality.length
				: null
		},
		null,
		2
	)}`
);

if (comparableCount > 0 && noDataComparableRatio > 0.4) {
	errors.push(
		`More than 40% no_data among records with World Bank comparable data: ${noDataComparableRatio.toFixed(3)}.`
	);
}

if (errors.length > 0) {
	console.error('\nErrors:');
	for (const error of errors) {
		console.error(`- ${error}`);
	}
	process.exit(1);
}

console.log('\nNo hard errors found.');
