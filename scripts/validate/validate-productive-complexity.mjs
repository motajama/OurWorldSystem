import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');

const paths = {
	registry: path.join(repoRoot, 'static/data/map-units.registry.json'),
	sourceManifest: path.join(repoRoot, 'static/data/source-manifest.json'),
	output: path.join(repoRoot, 'static/data/indicators/productive-complexity.latest.json')
};

const validStatuses = new Set(['data_loaded', 'no_source_file']);
const validQuality = new Set(['good', 'partial', 'sparse']);
const errors = [];
const warnings = [];

async function exists(filePath) {
	try {
		await access(filePath);
		return true;
	} catch {
		return false;
	}
}

async function readJson(filePath) {
	const text = await readFile(filePath, 'utf8');
	return JSON.parse(text);
}

function isObject(value) {
	return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function isScoreOrNull(value) {
	return value === null || (typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100);
}

console.log('Productive complexity validation report');

if (!(await exists(paths.output))) {
	console.error('Missing static/data/indicators/productive-complexity.latest.json.');
	process.exit(1);
}

const [registry, sourceManifest, data] = await Promise.all([
	readJson(paths.registry),
	readJson(paths.sourceManifest),
	readJson(paths.output)
]);
const registryIds = new Set(Array.isArray(registry) ? registry.map((record) => record.id) : []);
const sourceIds = new Set(
	Array.isArray(sourceManifest?.sources) ? sourceManifest.sources.map((source) => source.id) : []
);
const seenIds = new Set();

if (data?.dataset_id !== 'productive_complexity_latest') {
	errors.push('dataset_id must be productive_complexity_latest.');
}

if (data?.source_id !== 'atlas_economic_complexity') {
	errors.push('source_id must be atlas_economic_complexity.');
}

if (!sourceIds.has(data?.source_id)) {
	errors.push(`source_id not found in source manifest: ${data?.source_id ?? 'missing'}.`);
}

if (data?.model_component !== 'productive_complexity') {
	errors.push('model_component must be productive_complexity.');
}

if (!validStatuses.has(data?.status)) {
	errors.push('status must be data_loaded or no_source_file.');
}

if (typeof data?.generated_at !== 'string' || Number.isNaN(Date.parse(data.generated_at))) {
	errors.push('generated_at must be an ISO-compatible timestamp string.');
}

if (!Array.isArray(data?.records)) {
	errors.push('records must be an array.');
} else {
	if (data.status === 'data_loaded' && data.records.length === 0) {
		errors.push('status=data_loaded requires at least one record.');
	}

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

		if (seenIds.has(record.id)) errors.push(`${label}: duplicate id.`);
		seenIds.add(record.id);

		if (!registryIds.has(record.id)) {
			errors.push(`${label}: id is not in map-units registry.`);
		}

		if (record.source_country_code === '-99') {
			errors.push(`${label}: source_country_code must never be -99.`);
		}

		if (!Number.isInteger(record.latest_year)) {
			errors.push(`${label}: latest_year must be an integer.`);
		}

		if (!isObject(record.values)) {
			errors.push(`${label}: values must be an object.`);
		} else if (Object.keys(record.values).length === 0) {
			warnings.push(`${label}: values object is empty.`);
		} else {
			for (const [valueKey, valueRecord] of Object.entries(record.values)) {
				if (!isObject(valueRecord)) {
					errors.push(`${label}.${valueKey}: value record must be an object.`);
					continue;
				}
				if (typeof valueRecord.value !== 'number' || !Number.isFinite(valueRecord.value)) {
					errors.push(`${label}.${valueKey}: value must be a finite number.`);
				}
				if (!Number.isInteger(valueRecord.year)) {
					errors.push(`${label}.${valueKey}: year must be an integer.`);
				}
				if (
					typeof valueRecord.source_column !== 'string' ||
					valueRecord.source_column.trim().length === 0
				) {
					errors.push(`${label}.${valueKey}: source_column must be a non-empty string.`);
				}
			}
		}

		if (!isScoreOrNull(record.productive_complexity_score)) {
			errors.push(`${label}: productive_complexity_score must be null or a finite number from 0 to 100.`);
		}

		if (record.score_method !== 'percentile_rank_of_available_indicators') {
			errors.push(`${label}: score_method must be percentile_rank_of_available_indicators.`);
		}

		if (!validQuality.has(record.data_quality)) {
			errors.push(`${label}: data_quality must be good, partial, or sparse.`);
		}

		if (!Array.isArray(record.sources) || !record.sources.includes('atlas_economic_complexity')) {
			errors.push(`${label}: sources must include atlas_economic_complexity.`);
		}
	}
}

if (!Array.isArray(data?.unmatched_source_rows)) {
	errors.push('unmatched_source_rows must be an array.');
}

if (!Array.isArray(data?.notes)) {
	errors.push('notes must be an array.');
}

console.log(`Status: ${data?.status ?? 'unknown'}`);
console.log(`Records: ${Array.isArray(data?.records) ? data.records.length : 0}`);
console.log(`Registry ids: ${registryIds.size}`);

if (warnings.length > 0) {
	console.log('\nWarnings:');
	for (const warning of warnings) console.log(`- ${warning}`);
}

if (errors.length > 0) {
	console.error('\nErrors:');
	for (const error of errors) console.error(`- ${error}`);
	process.exit(1);
}

console.log('\nNo hard errors found.');
