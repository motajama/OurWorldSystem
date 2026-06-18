import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');
const registryPath = path.join(repoRoot, 'static/data/map-units.registry.json');
const indicatorsPath = path.join(repoRoot, 'static/data/world-system.latest.json');
const allowedUnregisteredIndicatorTypes = new Set(['special', 'no_data', 'disputed']);

function isObject(value) {
	return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function valuesOnlyContainInvalidNaturalEarthCode(values) {
	return (
		Array.isArray(values) &&
		values.length > 0 &&
		values.every((value) => typeof value === 'string' && value.trim() === '-99')
	);
}

async function readJson(filePath) {
	const text = await readFile(filePath, 'utf8');
	return JSON.parse(text);
}

function validateRegistry(registry) {
	const errors = [];
	const warnings = [];
	const ids = new Set();

	if (!Array.isArray(registry)) {
		return {
			errors: ['Registry root must be an array.'],
			warnings,
			ids
		};
	}

	for (const [index, record] of registry.entries()) {
		const label = isObject(record) && typeof record.id === 'string' ? record.id : `index ${index}`;

		if (!isObject(record)) {
			errors.push(`Registry record at index ${index} must be an object.`);
			continue;
		}

		if (typeof record.id !== 'string' || record.id.trim().length === 0) {
			errors.push(`Registry record at index ${index} is missing a string id.`);
			continue;
		}

		if (record.id === '-99') {
			errors.push(`Registry id "-99" is forbidden (${label}).`);
		}

		if (ids.has(record.id)) {
			errors.push(`Duplicate registry id: ${record.id}`);
		}

		ids.add(record.id);

		if (!isObject(record.natural_earth)) {
			errors.push(`${label}: natural_earth must be an object.`);
			continue;
		}

		for (const key of ['adm0_a3', 'iso_a3', 'sov_a3']) {
			const values = record.natural_earth[key];

			if (!Array.isArray(values)) {
				errors.push(`${label}: natural_earth.${key} must be an array.`);
				continue;
			}

			if (valuesOnlyContainInvalidNaturalEarthCode(values)) {
				errors.push(`${label}: natural_earth.${key} contains only "-99".`);
			}
		}

		if (!Array.isArray(record.natural_earth.name_aliases)) {
			errors.push(`${label}: natural_earth.name_aliases must be an array.`);
			continue;
		}

		if (
			record.natural_earth.adm0_a3.length === 0 &&
			record.natural_earth.iso_a3.length === 0 &&
			record.natural_earth.sov_a3.length === 0 &&
			record.natural_earth.name_aliases.length === 0
		) {
			warnings.push(`${label}: has no Natural Earth code or name aliases.`);
		}
	}

	return { errors, warnings, ids };
}

function validateIndicators(data, registryIds) {
	const errors = [];
	const warnings = [];
	const mapUnits = data?.map_units;

	if (!Array.isArray(mapUnits)) {
		return {
			errors: ['world-system.latest.json must contain a map_units array.'],
			warnings
		};
	}

	for (const unit of mapUnits) {
		if (!isObject(unit) || typeof unit.id !== 'string') {
			errors.push('Mock indicator record is missing a string id.');
			continue;
		}

		if (unit.id === '-99') {
			errors.push('Mock indicator id "-99" is forbidden.');
			continue;
		}

		if (!registryIds.has(unit.id) && !allowedUnregisteredIndicatorTypes.has(unit.map_unit_type)) {
			errors.push(
				`${unit.id}: mock indicator id is not in the registry and is not explicitly special, no_data, or disputed.`
			);
		}

		if (!registryIds.has(unit.id)) {
			warnings.push(`${unit.id}: mock indicator record is not in the registry.`);
		}
	}

	return { errors, warnings };
}

const registry = await readJson(registryPath);
const indicators = await readJson(indicatorsPath);
const registryResult = validateRegistry(registry);
const indicatorResult = validateIndicators(indicators, registryResult.ids);
const errors = [...registryResult.errors, ...indicatorResult.errors];
const warnings = [...registryResult.warnings, ...indicatorResult.warnings];

console.log('Map-unit validation report');
console.log(`Registry records: ${Array.isArray(registry) ? registry.length : 0}`);
console.log(
	`Mock indicator records: ${Array.isArray(indicators?.map_units) ? indicators.map_units.length : 0}`
);

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
