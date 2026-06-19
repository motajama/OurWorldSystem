import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');
const registryPath = path.join(repoRoot, 'static/data/map-units.registry.json');
const indicatorIndexPath = path.join(repoRoot, 'static/data/indicators/index.json');
const indicatorPath = path.join(
	repoRoot,
	'static/data/indicators/quality-of-life.world-bank.latest.json'
);
const generatedCandidatesPath = path.join(
	repoRoot,
	'static/data/generated/map-units.candidates.json'
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
const indicatorIndex = await readJson(indicatorIndexPath);
const registryIds = new Set(Array.isArray(registry) ? registry.map((record) => record.id) : []);
const errors = [];
const warnings = [];

console.log('Indicator validation report');

if (!Array.isArray(indicatorIndex)) {
	errors.push('static/data/indicators/index.json root must be an array.');
} else {
	const seenIndicatorIds = new Set();
	for (const [index, entry] of indicatorIndex.entries()) {
		const label = isObject(entry) && typeof entry.id === 'string' ? entry.id : `index ${index}`;

		if (!isObject(entry)) {
			errors.push(`Indicator index entry at index ${index} must be an object.`);
			continue;
		}

		for (const field of ['id', 'path', 'description']) {
			if (typeof entry[field] !== 'string' || entry[field].trim().length === 0) {
				errors.push(`${label}: indicator index ${field} must be a non-empty string.`);
			}
		}

		for (const field of ['required', 'available']) {
			if (typeof entry[field] !== 'boolean') {
				errors.push(`${label}: indicator index ${field} must be boolean.`);
			}
		}

		if (!Array.isArray(entry.source_ids)) {
			errors.push(`${label}: indicator index source_ids must be an array.`);
		}

		if (typeof entry.id === 'string') {
			if (seenIndicatorIds.has(entry.id)) errors.push(`Duplicate indicator index id: ${entry.id}`);
			seenIndicatorIds.add(entry.id);
		}
	}
}

if (await exists(generatedCandidatesPath)) {
	const generated = await readJson(generatedCandidatesPath);

	if (generated?.meta?.authoritative !== false) {
		errors.push('Generated candidate registry must set meta.authoritative to false.');
	}

	if (!Array.isArray(generated?.candidates)) {
		errors.push('Generated candidate registry must contain a candidates array.');
	} else {
		const candidateIds = new Set();
		for (const [index, candidate] of generated.candidates.entries()) {
			const label =
				isObject(candidate) && typeof candidate.candidate_id === 'string'
					? candidate.candidate_id
					: `candidate index ${index}`;

			if (!isObject(candidate)) {
				errors.push(`${label}: candidate must be an object.`);
				continue;
			}

			if (
				typeof candidate.candidate_id !== 'string' ||
				candidate.candidate_id.trim().length === 0
			) {
				errors.push(`${label}: candidate_id must be a non-empty string.`);
			} else if (candidateIds.has(candidate.candidate_id)) {
				errors.push(`Duplicate generated candidate id: ${candidate.candidate_id}`);
			}
			candidateIds.add(candidate.candidate_id);

			if (registryIds.has(candidate.candidate_id)) {
				errors.push(`${label}: candidate_id must not be treated as an authoritative registry id.`);
			}

			if (candidate.needs_review !== true) {
				errors.push(`${label}: needs_review must be true.`);
			}

			if (candidate.generated_from !== 'natural_earth') {
				errors.push(`${label}: generated_from must be natural_earth.`);
			}

			if (!['low', 'medium', 'high'].includes(candidate.confidence)) {
				errors.push(`${label}: confidence must be low, medium, or high.`);
			}

			if (!isObject(candidate.natural_earth)) {
				errors.push(`${label}: natural_earth must be an object.`);
			}
		}
	}
}

if (!(await exists(indicatorPath))) {
	console.log('World Bank quality-of-life indicator output not present; skipping optional check.');
} else {
	const data = await readJson(indicatorPath);
	const records = data?.records;
	const seenIds = new Set();

	if (!Array.isArray(records)) {
		errors.push('records must be an array.');
	} else {
		for (const [index, record] of records.entries()) {
			const label =
				isObject(record) && typeof record.id === 'string' ? record.id : `index ${index}`;

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

				if (
					typeof valueRecord.indicator !== 'string' ||
					valueRecord.indicator.trim().length === 0
				) {
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
}
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
