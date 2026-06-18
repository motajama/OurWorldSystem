import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');
const registryPath = path.join(repoRoot, 'static/data/map-units.registry.json');
const indicatorPath = path.join(
	repoRoot,
	'static/data/indicators/quality-of-life.world-bank.latest.json'
);

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

const registry = await readJson(registryPath);
const registryIds = new Set(Array.isArray(registry) ? registry.map((record) => record.id) : []);
const errors = [];
const warnings = [];

console.log('Indicator validation report');

if (!(await exists(indicatorPath))) {
	console.log('World Bank quality-of-life indicator output not present; skipping optional check.');
	process.exit(0);
}

const data = await readJson(indicatorPath);
const records = data?.records;
const seenIds = new Set();

if (!Array.isArray(records)) {
	errors.push('records must be an array.');
} else {
	for (const [index, record] of records.entries()) {
		const label = isObject(record) && typeof record.id === 'string' ? record.id : `index ${index}`;

		if (!isObject(record)) {
			errors.push(`Record at ${label} must be an object.`);
			continue;
		}

		if (typeof record.id !== 'string' || record.id.trim().length === 0) {
			errors.push(`Record at index ${index} is missing a string id.`);
			continue;
		}

		if (seenIds.has(record.id)) {
			errors.push(`Duplicate indicator record id: ${record.id}`);
		}
		seenIds.add(record.id);

		if (!registryIds.has(record.id)) {
			errors.push(`${record.id}: indicator id is not in map-units registry.`);
		}

		if (!isObject(record.values)) {
			errors.push(`${label}: values must be an object.`);
			continue;
		}

		for (const [valueKey, valueRecord] of Object.entries(record.values)) {
			if (!isObject(valueRecord)) {
				errors.push(`${label}.${valueKey}: value record must be an object.`);
				continue;
			}

			if (typeof valueRecord.value !== 'number' || !Number.isFinite(valueRecord.value)) {
				errors.push(`${label}.${valueKey}: value must be a finite number.`);
			}

			if (typeof valueRecord.indicator !== 'string' || valueRecord.indicator.trim().length === 0) {
				errors.push(`${label}.${valueKey}: indicator must be present.`);
			}

			if (!Number.isInteger(valueRecord.year)) {
				errors.push(`${label}.${valueKey}: year must be an integer.`);
			}
		}

		const score = record.quality_of_life_score;
		if (
			score !== null &&
			(typeof score !== 'number' || !Number.isFinite(score) || score < 0 || score > 1)
		) {
			errors.push(`${label}: quality_of_life_score must be null or a number between 0 and 1.`);
		}

		if (Object.keys(record.values).length === 0) {
			warnings.push(`${label}: record has no indicator values.`);
		}
	}
}

console.log(`Records: ${Array.isArray(records) ? records.length : 0}`);
console.log(`Registry ids: ${registryIds.size}`);

if (warnings.length > 0) {
	console.log('\nWarnings:');
	for (const warning of warnings) {
		console.log(`- ${warning}`);
	}
}

if (errors.length > 0) {
	console.error('\nErrors:');
	for (const error of errors) {
		console.error(`- ${error}`);
	}
	process.exit(1);
}

console.log('\nNo hard errors found.');
