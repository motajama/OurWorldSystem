import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');

const paths = {
	registry: path.join(repoRoot, 'static/data/map-units.registry.json'),
	sourceManifest: path.join(repoRoot, 'static/data/source-manifest.json'),
	output: path.join(
		repoRoot,
		'static/data/indicators/extraction-dependency.world-bank.latest.json'
	)
};

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

function topRecords(records, field) {
	return records
		.filter((record) => typeof record[field] === 'number' && Number.isFinite(record[field]))
		.sort((a, b) => b[field] - a[field])
		.slice(0, 10)
		.map((record) => ({
			id: record.id,
			score: record[field],
			latest_year: record.latest_year
		}));
}

console.log('Extraction dependency validation report');

if (!(await exists(paths.output))) {
	console.error('Missing static/data/indicators/extraction-dependency.world-bank.latest.json.');
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
const scoreDistribution = {
	no_score: 0,
	low_dependency: 0,
	medium_dependency: 0,
	high_dependency: 0
};

if (data?.dataset_id !== 'extraction_dependency_world_bank_latest') {
	errors.push('dataset_id must be extraction_dependency_world_bank_latest.');
}

if (data?.source_id !== 'world_bank_wdi_extraction') {
	errors.push('source_id must be world_bank_wdi_extraction.');
}

if (!sourceIds.has(data?.source_id)) {
	errors.push(`source_id not found in source manifest: ${data?.source_id ?? 'missing'}.`);
}

if (data?.model_component !== 'extraction_dependency') {
	errors.push('model_component must be extraction_dependency.');
}

if (typeof data?.generated_at !== 'string' || Number.isNaN(Date.parse(data.generated_at))) {
	errors.push('generated_at must be an ISO-compatible timestamp string.');
}

if (!isObject(data?.indicators)) {
	errors.push('indicators must be an object.');
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
		} else {
			for (const [valueKey, valueRecord] of Object.entries(record.values)) {
				if (valueRecord === null) continue;
				if (!isObject(valueRecord)) {
					errors.push(`${label}.${valueKey}: value record must be null or an object.`);
					continue;
				}
				if (
					valueRecord.value !== null &&
					(typeof valueRecord.value !== 'number' || !Number.isFinite(valueRecord.value))
				) {
					errors.push(`${label}.${valueKey}: value must be null or a finite number.`);
				}
				if (!Number.isInteger(valueRecord.year)) {
					errors.push(`${label}.${valueKey}: year must be an integer.`);
				}
				if (
					typeof valueRecord.indicator !== 'string' ||
					valueRecord.indicator.trim().length === 0
				) {
					errors.push(`${label}.${valueKey}: indicator must be a non-empty string.`);
				}
			}
		}

		if (!isScoreOrNull(record.extraction_dependency_score)) {
			errors.push(`${label}: extraction_dependency_score must be null or 0-100.`);
		}

		if (!isScoreOrNull(record.extraction_autonomy_score)) {
			errors.push(`${label}: extraction_autonomy_score must be null or 0-100.`);
		}

		if (!validQuality.has(record.data_quality)) {
			errors.push(`${label}: data_quality must be good, partial, or sparse.`);
		}

		if (!Array.isArray(record.sources) || !record.sources.includes('world_bank_wdi_extraction')) {
			errors.push(`${label}: sources must include world_bank_wdi_extraction.`);
		}

		const score = record.extraction_dependency_score;
		if (typeof score !== 'number') scoreDistribution.no_score += 1;
		else if (score >= 65) scoreDistribution.high_dependency += 1;
		else if (score >= 35) scoreDistribution.medium_dependency += 1;
		else scoreDistribution.low_dependency += 1;

		if (Object.keys(record.values ?? {}).length === 0) {
			warnings.push(`${label}: values object is empty.`);
		}
	}
}

for (const field of ['unmatched_source_countries', 'ignored_aggregate_regions', 'notes']) {
	if (!Array.isArray(data?.[field])) {
		errors.push(`${field} must be an array.`);
	}
}

if (!isObject(data?.latest_years)) {
	errors.push('latest_years must be an object.');
}

const records = Array.isArray(data?.records) ? data.records : [];
console.log(`Records: ${records.length}`);
console.log(`No score count: ${scoreDistribution.no_score}`);
console.log(`Score distribution: ${JSON.stringify(scoreDistribution, null, 2)}`);
console.log(
	`Top 10 extraction_dependency_score: ${JSON.stringify(
		topRecords(records, 'extraction_dependency_score'),
		null,
		2
	)}`
);
console.log(
	`Top 10 extraction_autonomy_score: ${JSON.stringify(
		topRecords(records, 'extraction_autonomy_score'),
		null,
		2
	)}`
);

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
