import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');

const requiredFiles = [
	'static/geo/world.topojson',
	'static/data/world-system.latest.json',
	'static/data/map-units.registry.json',
	'static/data/source-manifest.json'
];

const indicatorIndexFile = 'static/data/indicators/index.json';
const coverageSummaryFile = 'static/data/generated/map-unit-coverage.summary.json';
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

async function readJson(relativePath) {
	const text = await readFile(path.join(repoRoot, relativePath), 'utf8');
	return JSON.parse(text);
}

function toRelativeStaticPath(urlPath) {
	if (typeof urlPath !== 'string' || urlPath.trim().length === 0) return null;
	const normalized = urlPath.startsWith('/') ? urlPath.slice(1) : urlPath;
	return normalized.startsWith('data/') ? path.join('static', normalized) : normalized;
}

function recordCount(data) {
	if (Array.isArray(data)) return data.length;
	if (Array.isArray(data?.records)) return data.records.length;
	if (Array.isArray(data?.map_units)) return data.map_units.length;
	return null;
}

async function checkRequiredFile(relativePath) {
	if (!(await exists(path.join(repoRoot, relativePath)))) {
		errors.push(`Missing required file: ${relativePath}`);
		return null;
	}

	try {
		const data = await readJson(relativePath);
		console.log(`required ok: ${relativePath}`);
		return data;
	} catch (error) {
		errors.push(`Invalid JSON in required file ${relativePath}: ${error.message}`);
		return null;
	}
}

async function readOptionalJson(relativePath, label) {
	if (!(await exists(path.join(repoRoot, relativePath)))) {
		console.log(`optional missing: ${label} (${relativePath})`);
		return null;
	}

	try {
		const data = await readJson(relativePath);
		console.log(`optional ok: ${label} (${relativePath})`);
		return data;
	} catch (error) {
		warnings.push(`Invalid JSON in optional file ${relativePath}: ${error.message}`);
		console.log(`optional malformed: ${label} (${relativePath})`);
		return null;
	}
}

console.log('Data healthcheck');
console.log('\nRequired files:');

const requiredData = new Map();
for (const relativePath of requiredFiles) {
	requiredData.set(relativePath, await checkRequiredFile(relativePath));
}

console.log('\nCounts:');
const registry = requiredData.get('static/data/map-units.registry.json');
const worldSystem = requiredData.get('static/data/world-system.latest.json');
console.log(`registry records: ${Array.isArray(registry) ? registry.length : 0}`);
console.log(
	`mock world-system records: ${Array.isArray(worldSystem?.map_units) ? worldSystem.map_units.length : 0}`
);

console.log('\nOptional files:');
const indicatorIndex = await readOptionalJson(indicatorIndexFile, 'indicator index');

if (Array.isArray(indicatorIndex)) {
	for (const entry of indicatorIndex) {
		const id = typeof entry?.id === 'string' ? entry.id : 'unknown indicator';
		for (const field of ['id', 'path', 'description']) {
			if (typeof entry?.[field] !== 'string' || entry[field].trim().length === 0) {
				warnings.push(`${id}: indicator index entry is missing string field ${field}.`);
			}
		}
		for (const field of ['required', 'available']) {
			if (typeof entry?.[field] !== 'boolean') {
				warnings.push(`${id}: indicator index entry is missing boolean field ${field}.`);
			}
		}
		if (!Array.isArray(entry?.source_ids)) {
			warnings.push(`${id}: indicator index entry is missing source_ids array.`);
		}

		const datasetPath = toRelativeStaticPath(entry?.path);
		const datasetExists = datasetPath ? await exists(path.join(repoRoot, datasetPath)) : false;

		if (entry?.available === false && datasetExists) {
			warnings.push(`${id}: available is false but file exists at ${datasetPath}.`);
		}

		if (entry?.available === false) {
			console.log(`optional unavailable: ${id}`);
			continue;
		}

		if (!datasetPath) {
			warnings.push(`${id}: indicator index entry is missing a usable path.`);
			continue;
		}

		if (entry?.available === true && !datasetExists) {
			const severity = entry?.required === true ? 'errors' : 'warnings';
			const message = `${id}: available is true but file is missing at ${datasetPath}.`;
			if (severity === 'errors') errors.push(message);
			else warnings.push(message);
		}

		const data = await readOptionalJson(datasetPath, id);
		if (data) {
			const count = recordCount(data);
			console.log(`indicator records: ${id}: ${count ?? 'unknown'}`);
		}
	}
} else if (indicatorIndex !== null) {
	warnings.push(`${indicatorIndexFile} root should be an array.`);
}

console.log('\nCoverage summary:');
const coverageSummary = await readOptionalJson(coverageSummaryFile, 'map-unit coverage summary');
if (coverageSummary) {
	console.log(`generated candidates: ${coverageSummary.generated_candidate_count ?? 'unknown'}`);
	console.log(`matched base features: ${coverageSummary.matched_base_features ?? 'unknown'}`);
	console.log(`unmatched base features: ${coverageSummary.unmatched_base_features ?? 'unknown'}`);
} else {
	console.log('coverage summary not present; run npm run data:coverage');
}

if (warnings.length > 0) {
	console.log('\nWarnings:');
	for (const warning of warnings) console.log(`- ${warning}`);
}

if (errors.length > 0) {
	console.error('\nErrors:');
	for (const error of errors) console.error(`- ${error}`);
	process.exit(1);
}

console.log('\nHealthcheck complete.');
