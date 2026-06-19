import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');

const paths = {
	registry: path.join(repoRoot, 'static/data/map-units.registry.json'),
	sourceManifest: path.join(repoRoot, 'static/data/source-manifest.json'),
	indicatorIndex: path.join(repoRoot, 'static/data/indicators/index.json'),
	productiveComplexity: path.join(
		repoRoot,
		'static/data/indicators/productive-complexity.latest.json'
	),
	extractionDependency: path.join(
		repoRoot,
		'static/data/indicators/extraction-dependency.world-bank.latest.json'
	),
	output: path.join(
		repoRoot,
		'static/data/indicators/world-system.structural-v1.placeholder.json'
	)
};

const plannedSourceIds = [
	'oecd_tiva',
	'un_comtrade',
	'cepii_baci',
	'atlas_economic_complexity',
	'world_bank_wdi_extraction',
	'unep_material_flows',
	'yale_epi',
	'global_ewaste_monitor',
	'unctad_fdi',
	'sipri_military_expenditure'
];

const componentRequirements = {
	value_capture: ['oecd_tiva', 'un_comtrade', 'cepii_baci', 'unctad_fdi'],
	productive_complexity: ['atlas_economic_complexity', 'un_comtrade', 'cepii_baci'],
	extraction_autonomy: [
		'world_bank_wdi_extraction',
		'un_comtrade',
		'cepii_baci',
		'unep_material_flows',
		'unctad_fdi'
	],
	ecological_externalization: ['unep_material_flows', 'yale_epi', 'global_ewaste_monitor'],
	geopolitical_financial_power: ['unctad_fdi', 'sipri_military_expenditure']
};

function isObject(value) {
	return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

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

function relativePath(filePath) {
	return path.relative(repoRoot, filePath);
}

function toRelativeStaticPath(urlPath) {
	if (typeof urlPath !== 'string' || urlPath.trim().length === 0) return null;
	const normalized = urlPath.startsWith('/') ? urlPath.slice(1) : urlPath;
	return normalized.startsWith('data/') ? path.join('static', normalized) : normalized;
}

function componentStatusFor(availableSourceIds) {
	return Object.fromEntries(
		Object.entries(componentRequirements).map(([component, requiredSourceIds]) => {
			const availableCount = requiredSourceIds.filter((sourceId) =>
				availableSourceIds.has(sourceId)
			).length;
			const status =
				availableCount === 0
					? 'missing'
					: availableCount === requiredSourceIds.length
						? 'available'
						: 'partial';

			return [component, status];
		})
	);
}

function emptyComponents() {
	return {
		value_capture: null,
		productive_complexity: null,
		extraction_autonomy: null,
		ecological_externalization: null,
		geopolitical_financial_power: null
	};
}

function productiveComplexityById(data) {
	const records = Array.isArray(data?.records) ? data.records : [];
	return new Map(
		records
			.filter(
				(record) =>
					isObject(record) &&
					typeof record.id === 'string' &&
					typeof record.productive_complexity_score === 'number' &&
					Number.isFinite(record.productive_complexity_score)
			)
			.map((record) => [record.id, record])
	);
}

function extractionDependencyById(data) {
	const records = Array.isArray(data?.records) ? data.records : [];
	return new Map(
		records
			.filter(
				(record) =>
					isObject(record) &&
					typeof record.id === 'string' &&
					typeof record.extraction_autonomy_score === 'number' &&
					Number.isFinite(record.extraction_autonomy_score)
			)
			.map((record) => [record.id, record])
	);
}

function componentLimitations(hasProductiveComplexity, hasExtractionAutonomy, isDisputed) {
	const limitations = [
		'Placeholder record only; do not use as a Wallersteinian classification.',
		hasProductiveComplexity || hasExtractionAutonomy
			? 'Available structural components are retained for review, but value capture, ecological externalization, and geopolitical-financial power remain missing.'
			: 'Value capture, productive complexity, extraction autonomy, ecological externalization, and geopolitical-financial power components are missing.',
		isDisputed
			? 'This disputed or special map unit requires neutral source crosswalk review before comparable structural scoring.'
			: 'Registry identity exists, but structural source coverage is not yet complete.'
	];

	return limitations;
}

function placeholderRecordFor(
	registryRecord,
	availableSourceIds,
	missingSourceIds,
	productiveRecord,
	extractionRecord
) {
	const isDisputed = registryRecord?.map_unit_type === 'disputed';
	const components = emptyComponents();
	if (productiveRecord) components.productive_complexity = productiveRecord.productive_complexity_score;
	if (extractionRecord) components.extraction_autonomy = extractionRecord.extraction_autonomy_score;
	const recordSources = [
		...(productiveRecord ? ['atlas_economic_complexity'] : []),
		...(extractionRecord ? ['world_bank_wdi_extraction'] : [])
	];

	return {
		id: registryRecord.id,
		class: isDisputed ? 'disputed' : 'no_data',
		score: null,
		confidence: 'low',
		components,
		data_coverage: {
			available_source_ids: [...availableSourceIds].sort(),
			missing_source_ids: missingSourceIds,
			component_status: componentStatusFor(availableSourceIds),
			component_inputs: {
				productive_complexity: productiveRecord
					? {
							source_id: 'atlas_economic_complexity',
							source_country_code: productiveRecord.source_country_code,
							latest_year: productiveRecord.latest_year,
							values: productiveRecord.values,
							score_method: productiveRecord.score_method,
							data_quality: productiveRecord.data_quality
						}
					: null,
				extraction_autonomy: extractionRecord
					? {
							source_id: 'world_bank_wdi_extraction',
							source_country_code: extractionRecord.source_country_code,
							latest_year: extractionRecord.latest_year,
							values: extractionRecord.values,
							extraction_dependency_score: extractionRecord.extraction_dependency_score,
							extraction_autonomy_score: extractionRecord.extraction_autonomy_score,
							data_quality: extractionRecord.data_quality
						}
					: null
			}
		},
		explanation:
			'Structural world-system model v1 is not yet computable. Available component values are retained for future review, but no final class or score is inferred.',
		limitations: componentLimitations(Boolean(productiveRecord), Boolean(extractionRecord), isDisputed),
		sources: recordSources,
		review_status: 'not_started'
	};
}

async function main() {
	const [registry, sourceManifest, indicatorIndex] = await Promise.all([
		readJson(paths.registry),
		readJson(paths.sourceManifest),
		readJson(paths.indicatorIndex)
	]);

	if (!Array.isArray(registry)) {
		throw new Error(`${relativePath(paths.registry)} root must be an array.`);
	}

	const sourceIdsInManifest = new Set(
		(sourceManifest?.sources ?? [])
			.filter((source) => isObject(source) && typeof source.id === 'string')
			.map((source) => source.id)
	);
	const missingManifestEntries = plannedSourceIds.filter((sourceId) => !sourceIdsInManifest.has(sourceId));

	const availableSourceIds = new Set();
	let productiveComplexity = null;
	if (await exists(paths.productiveComplexity)) {
		productiveComplexity = await readJson(paths.productiveComplexity);
		if (
			productiveComplexity?.status === 'data_loaded' &&
			Array.isArray(productiveComplexity.records) &&
			productiveComplexity.records.length > 0
		) {
			availableSourceIds.add('atlas_economic_complexity');
		}
	}
	let extractionDependency = null;
	if (await exists(paths.extractionDependency)) {
		extractionDependency = await readJson(paths.extractionDependency);
		if (
			extractionDependency?.dataset_id === 'extraction_dependency_world_bank_latest' &&
			Array.isArray(extractionDependency.records) &&
			extractionDependency.records.some(
				(record) =>
					typeof record?.extraction_autonomy_score === 'number' &&
					Number.isFinite(record.extraction_autonomy_score)
			)
		) {
			availableSourceIds.add('world_bank_wdi_extraction');
		}
	}

	for (const entry of Array.isArray(indicatorIndex) ? indicatorIndex : []) {
		if (entry?.id === 'world_system_structural_v1' || entry?.id === 'productive_complexity_latest') {
			continue;
		}

		const datasetPath = toRelativeStaticPath(entry?.path);
		const datasetExists = datasetPath ? await exists(path.join(repoRoot, datasetPath)) : false;
		if (entry?.available === true && datasetExists && Array.isArray(entry.source_ids)) {
			for (const sourceId of entry.source_ids) {
				if (sourceId === 'world_bank_wdi_extraction') continue;
				if (plannedSourceIds.includes(sourceId)) availableSourceIds.add(sourceId);
			}
		}
	}

	const missingSourceIds = plannedSourceIds.filter((sourceId) => !availableSourceIds.has(sourceId));
	const productiveRecordsById = productiveComplexityById(productiveComplexity);
	const extractionRecordsById = extractionDependencyById(extractionDependency);
	const records = registry
		.filter((record) => isObject(record) && typeof record.id === 'string')
		.map((record) =>
			placeholderRecordFor(
				record,
				availableSourceIds,
				missingSourceIds,
				productiveRecordsById.get(record.id),
				extractionRecordsById.get(record.id)
			)
		);

	const output = {
		dataset_id: 'world_system_structural_v1',
		model_status: 'not_yet_computable',
		generated_at: new Date().toISOString(),
		records,
		planned_source_ids: plannedSourceIds,
		missing_source_ids: missingSourceIds,
		component_requirements: componentRequirements,
		component_inputs: {
			productive_complexity: productiveComplexity
				? {
						path: '/data/indicators/productive-complexity.latest.json',
						status: productiveComplexity.status,
						record_count: Array.isArray(productiveComplexity.records)
							? productiveComplexity.records.length
							: 0
					}
				: {
						path: '/data/indicators/productive-complexity.latest.json',
						status: 'missing',
						record_count: 0
					},
			extraction_autonomy: extractionDependency
				? {
						path: '/data/indicators/extraction-dependency.world-bank.latest.json',
						status:
							extractionRecordsById.size > 0
								? 'component_values_loaded'
								: 'present_without_scores',
						record_count: Array.isArray(extractionDependency.records)
							? extractionDependency.records.length
							: 0,
						scored_record_count: extractionRecordsById.size
					}
				: {
						path: '/data/indicators/extraction-dependency.world-bank.latest.json',
						status: 'missing',
						record_count: 0,
						scored_record_count: 0
					}
		},
		notes: [
			'This placeholder intentionally does not compute final world-system classifications.',
			'The current provisional world-system proxy remains separate from this future structural model.',
			'Productive complexity, when present, is one component and does not determine world-system position by itself.',
			'Extraction autonomy, when present, is a World Bank WDI first approximation of extraction dependency and export structure; it requires later BACI or Comtrade product-level refinement.',
			'Implement source pipelines and reviewed component transformations before changing model_status to draft, review, or published.'
		]
	};

	await mkdir(path.dirname(paths.output), { recursive: true });
	await writeFile(paths.output, `${JSON.stringify(output, null, '\t')}\n`);

	console.log(`Wrote ${relativePath(paths.output)}`);
	console.log(`Records: ${records.length}`);
	console.log(
		`Productive complexity records: ${productiveRecordsById.size} (${
			productiveComplexity?.status ?? 'missing'
		})`
	);
	console.log(
		`Extraction autonomy records: ${extractionRecordsById.size} (${
			extractionDependency?.dataset_id ?? 'missing'
		})`
	);
	console.log(`Available planned source ids: ${[...availableSourceIds].sort().join(', ') || 'none'}`);
	console.log(`Missing planned source ids: ${missingSourceIds.join(', ') || 'none'}`);

	if (missingManifestEntries.length > 0) {
		console.log(`Missing source-manifest entries: ${missingManifestEntries.join(', ')}`);
	}

	console.log('Missing components:');
	for (const [component, requiredSourceIds] of Object.entries(componentRequirements)) {
		const missingForComponent = requiredSourceIds.filter((sourceId) => !availableSourceIds.has(sourceId));
		console.log(`- ${component}: ${missingForComponent.join(', ') || 'none'}`);
	}
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
