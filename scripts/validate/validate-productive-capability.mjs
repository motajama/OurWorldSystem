import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');

const paths = {
	registry: path.join(repoRoot, 'static/data/map-units.registry.json'),
	sourceManifest: path.join(repoRoot, 'static/data/source-manifest.json'),
	output: path.join(repoRoot, 'static/data/indicators/productive-capability.world-bank.latest.json')
};

const validQuality = new Set(['good', 'partial', 'sparse']);
const errors = [];

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
	return (
		value === null ||
		(typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100)
	);
}

console.log('Productive capability proxy validation report');

if (!(await exists(paths.output))) {
	console.error('Missing static/data/indicators/productive-capability.world-bank.latest.json.');
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

if (data?.dataset_id !== 'productive_capability_world_bank_latest') {
	errors.push('dataset_id must be productive_capability_world_bank_latest.');
}

if (data?.source_id !== 'world_bank_wdi_extraction') {
	errors.push('source_id must be world_bank_wdi_extraction.');
}

if (!sourceIds.has(data?.source_id)) {
	errors.push(`source_id not found in source manifest: ${data?.source_id ?? 'missing'}.`);
}

if (data?.model_component !== 'productive_capability_proxy') {
	errors.push('model_component must be productive_capability_proxy.');
}

if (data?.status !== 'provisional_proxy') {
	errors.push('status must be provisional_proxy.');
}

if (typeof data?.generated_at !== 'string' || Number.isNaN(Date.parse(data.generated_at))) {
	errors.push('generated_at must be an ISO-compatible timestamp string.');
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

		if (record.latest_year !== null && !Number.isInteger(record.latest_year)) {
			errors.push(`${label}: latest_year must be an integer or null.`);
		}

		if (!isObject(record.values)) {
			errors.push(`${label}: values must be an object.`);
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
					typeof valueRecord.indicator !== 'string' ||
					valueRecord.indicator.trim().length === 0
				) {
					errors.push(`${label}.${valueKey}: indicator must be present.`);
				}
			}
		}

		if (!isScoreOrNull(record.productive_capability_score)) {
			errors.push(
				`${label}: productive_capability_score must be null or a finite number from 0 to 100.`
			);
		}

		if (typeof record.positive_structural_support !== 'boolean') {
			errors.push(`${label}: positive_structural_support must be boolean.`);
		}

		if (!validQuality.has(record.data_quality)) {
			errors.push(`${label}: data_quality must be good, partial, or sparse.`);
		}

		if (!Array.isArray(record.sources) || !record.sources.includes('world_bank_wdi_extraction')) {
			errors.push(`${label}: sources must include world_bank_wdi_extraction.`);
		}
	}
}

const scoredRecords = (data.records ?? [])
	.filter((record) => typeof record.productive_capability_score === 'number')
	.sort((a, b) => b.productive_capability_score - a.productive_capability_score);
const supportCount = (data.records ?? []).filter(
	(record) => record.positive_structural_support
).length;

console.log(`Records: ${Array.isArray(data?.records) ? data.records.length : 0}`);
console.log(`Registry ids: ${registryIds.size}`);
console.log(`Support count: ${supportCount}`);
console.log('Top 30 productive capability scores:');
console.log(
	JSON.stringify(
		scoredRecords.slice(0, 30).map((record) => ({
			id: record.id,
			score: record.productive_capability_score,
			data_quality: record.data_quality,
			support: record.positive_structural_support
		})),
		null,
		2
	)
);

if (errors.length > 0) {
	console.error('\nErrors:');
	for (const error of errors) console.error(`- ${error}`);
	process.exit(1);
}

console.log('\nNo hard errors found.');
