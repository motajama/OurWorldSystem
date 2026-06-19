import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');

const paths = {
	registry: path.join(repoRoot, 'static/data/map-units.registry.json'),
	structuralWorldSystem: path.join(
		repoRoot,
		'static/data/indicators/world-system.structural-v1.placeholder.json'
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
const validModelStatuses = new Set(['not_yet_computable', 'draft', 'review', 'published']);
const validConfidence = new Set(['low', 'medium', 'high']);
const validReviewStatus = new Set(['not_started', 'needs_review', 'reviewed']);
const validComponentStatus = new Set(['missing', 'partial', 'available']);
const componentKeys = [
	'value_capture',
	'productive_complexity',
	'extraction_autonomy',
	'ecological_externalization',
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

function isFiniteScore(value) {
	return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100;
}

const errors = [];
const warnings = [];

if (!(await exists(paths.structuralWorldSystem))) {
	console.error('Missing static/data/indicators/world-system.structural-v1.placeholder.json.');
	process.exit(1);
}

const [registry, data] = await Promise.all([
	readJson(paths.registry),
	readJson(paths.structuralWorldSystem)
]);
const registryIds = new Set(Array.isArray(registry) ? registry.map((record) => record.id) : []);
const seenIds = new Set();
const distribution = {};

if (data?.dataset_id !== 'world_system_structural_v1') {
	errors.push('dataset_id must be world_system_structural_v1.');
}

if (!validModelStatuses.has(data?.model_status)) {
	errors.push('model_status must be one of not_yet_computable, draft, review, or published.');
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

		distribution[record.class] = (distribution[record.class] ?? 0) + 1;
		if (!validClasses.has(record.class)) {
			errors.push(`${label}: invalid class ${record.class}.`);
		}

		if (record.score !== null && !isFiniteScore(record.score)) {
			errors.push(`${label}: score must be null or a finite number from 0 to 100.`);
		}

		if (!validConfidence.has(record.confidence)) {
			errors.push(`${label}: confidence must be low, medium, or high.`);
		}

		if (!isObject(record.components)) {
			errors.push(`${label}: components must be an object.`);
		} else {
			for (const componentKey of componentKeys) {
				const value = record.components[componentKey];
				if (value !== null && !isFiniteScore(value)) {
					errors.push(`${label}: components.${componentKey} must be null or 0-100.`);
				}
			}
		}

		if (!isObject(record.data_coverage)) {
			errors.push(`${label}: data_coverage must be an object.`);
		} else {
			for (const field of ['available_source_ids', 'missing_source_ids']) {
				if (!Array.isArray(record.data_coverage[field])) {
					errors.push(`${label}: data_coverage.${field} must be an array.`);
				}
			}

			const componentStatus = record.data_coverage.component_status;
			if (!isObject(componentStatus)) {
				errors.push(`${label}: data_coverage.component_status must be an object.`);
			} else {
				for (const componentKey of componentKeys) {
					if (!validComponentStatus.has(componentStatus[componentKey])) {
						errors.push(
							`${label}: data_coverage.component_status.${componentKey} must be missing, partial, or available.`
						);
					}
				}
			}

			if (
				record.data_coverage.component_inputs !== undefined &&
				!isObject(record.data_coverage.component_inputs)
			) {
				errors.push(`${label}: data_coverage.component_inputs must be an object when present.`);
			}
		}

		if (typeof record.explanation !== 'string' || record.explanation.trim().length === 0) {
			errors.push(`${label}: explanation must be a non-empty string.`);
		}

		if (!Array.isArray(record.limitations)) {
			errors.push(`${label}: limitations must be an array.`);
		} else if (record.limitations.length === 0) {
			warnings.push(`${label}: limitations array is empty.`);
		}

		if (!Array.isArray(record.sources)) {
			errors.push(`${label}: sources must be an array.`);
		}

		if (!validReviewStatus.has(record.review_status)) {
			errors.push(`${label}: review_status must be not_started, needs_review, or reviewed.`);
		}

		if (data.model_status === 'not_yet_computable') {
			if (record.score !== null) {
				errors.push(`${label}: placeholder output must not include final world-system scores.`);
			}
		}
	}
}

for (const field of ['planned_source_ids', 'missing_source_ids', 'notes']) {
	if (!Array.isArray(data?.[field])) {
		errors.push(`${field} must be an array.`);
	}
}

if (!isObject(data?.component_requirements)) {
	errors.push('component_requirements must be an object.');
} else {
	for (const componentKey of componentKeys) {
		if (!Array.isArray(data.component_requirements[componentKey])) {
			errors.push(`component_requirements.${componentKey} must be an array.`);
		}
	}
}

if (data?.component_inputs !== undefined && !isObject(data.component_inputs)) {
	errors.push('component_inputs must be an object when present.');
}

if (data?.model_status !== 'not_yet_computable' && Array.isArray(data?.records)) {
	const computableRecords = data.records.filter((record) => record.score !== null);
	if (computableRecords.length === 0) {
		warnings.push('model_status is beyond placeholder, but no records have scores.');
	}
}

console.log('Structural world-system validation report');
console.log(`Records: ${Array.isArray(data?.records) ? data.records.length : 0}`);
console.log(`Registry ids: ${registryIds.size}`);
console.log(`Model status: ${data?.model_status ?? 'unknown'}`);
console.log(`Class distribution: ${JSON.stringify(distribution, null, 2)}`);

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
