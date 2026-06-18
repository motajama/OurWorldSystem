import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');
const registryPath = path.join(repoRoot, 'static/data/map-units.registry.json');
const manifestPath = path.join(repoRoot, 'static/data/source-manifest.json');
const conflictPath = path.join(repoRoot, 'static/data/indicators/conflict.ucdp.latest.json');

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

function isBooleanOrNull(value) {
	return value === true || value === false || value === null;
}

function isNonnegativeNumberOrNull(value) {
	return value === null || (typeof value === 'number' && Number.isFinite(value) && value >= 0);
}

const registry = await readJson(registryPath);
const manifest = await readJson(manifestPath);
const registryIds = new Set(Array.isArray(registry) ? registry.map((record) => record.id) : []);
const sourceIds = new Set(Array.isArray(manifest.sources) ? manifest.sources.map((source) => source.id) : []);
const errors = [];
const warnings = [];

console.log('UCDP conflict indicator validation report');

if (!(await exists(conflictPath))) {
	console.log('UCDP conflict indicator output not present; skipping optional check.');
	process.exit(0);
}

const data = await readJson(conflictPath);
const seenIds = new Set();
const records = data?.records;

if (!Array.isArray(data.source_ids)) {
	errors.push('source_ids must be an array.');
} else {
	for (const sourceId of data.source_ids) {
		if (!sourceIds.has(sourceId)) errors.push(`source id not found in source manifest: ${sourceId}`);
	}
}

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

		if (seenIds.has(record.id)) errors.push(`Duplicate conflict record id: ${record.id}`);
		seenIds.add(record.id);

		if (!registryIds.has(record.id)) {
			errors.push(`${record.id}: conflict id is not in map-units registry.`);
		}

		const summary = record.conflict_summary;
		if (!isObject(summary)) {
			errors.push(`${label}: conflict_summary must be an object.`);
			continue;
		}

		if (record.territory !== null) {
			if (!isObject(record.territory)) {
				errors.push(`${label}.territory: must be null or an object.`);
			} else {
				if (!isBooleanOrNull(record.territory.has_organized_violence)) {
					errors.push(`${label}.territory.has_organized_violence: must be boolean or null.`);
				}
				for (const field of [
					'fatalities_best_estimate',
					'fatalities_low',
					'fatalities_high',
					'event_count'
				]) {
					if (!isNonnegativeNumberOrNull(record.territory[field])) {
						errors.push(`${label}.territory.${field}: must be null or a nonnegative number.`);
					}
				}
			}
		}

		if (isObject(record.state_involvement)) {
			if (!isBooleanOrNull(record.state_involvement.involved_in_state_based_conflict)) {
				errors.push(
					`${label}.state_involvement.involved_in_state_based_conflict: must be boolean or null.`
				);
			}
		} else {
			errors.push(`${label}.state_involvement: must be an object.`);
		}

		for (const field of ['war_on_territory', 'involved_in_conflict']) {
			if (!isBooleanOrNull(summary[field])) {
				errors.push(`${label}.${field}: must be boolean or null.`);
			}
		}

		if (!isNonnegativeNumberOrNull(summary.fatalities_best_estimate)) {
			errors.push(`${label}.fatalities_best_estimate: must be null or a nonnegative number.`);
		}

		if (summary.child_casualties_verified !== null) {
			errors.push(`${label}.child_casualties_verified must remain null until a child-casualty source exists.`);
		}

		if (!Array.isArray(record.sources)) {
			errors.push(`${label}: sources must be an array.`);
		} else {
			for (const sourceId of record.sources) {
				if (!sourceIds.has(sourceId)) {
					errors.push(`${label}: source id not found in source manifest: ${sourceId}`);
				}
			}
		}

		if (!['good', 'partial', 'sparse'].includes(record.data_quality)) {
			warnings.push(`${label}: data_quality is not one of good, partial, sparse.`);
		}
	}
}

console.log(`Records: ${Array.isArray(records) ? records.length : 0}`);
console.log(`Registry ids: ${registryIds.size}`);
console.log(`Unmatched source rows: ${Array.isArray(data.unmatched_source_rows) ? data.unmatched_source_rows.length : 0}`);

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
