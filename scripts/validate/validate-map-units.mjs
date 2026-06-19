import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');
const registryPath = path.join(repoRoot, 'static/data/map-units.registry.json');
const indicatorsPath = path.join(repoRoot, 'static/data/world-system.latest.json');
const worldTopojsonPath = path.join(repoRoot, 'static/geo/world.topojson');
const allowedUnregisteredIndicatorTypes = new Set(['special', 'no_data', 'disputed']);
const minimumNaturalEarthCoverage = 0.95;

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

function normalizeCode(value) {
	if (typeof value !== 'string') return null;
	const normalized = value.trim().toUpperCase();
	return normalized.length > 0 && normalized !== '-99' ? normalized : null;
}

function normalizeName(value) {
	if (typeof value !== 'string') return null;
	const normalized = value.trim().toLowerCase().replace(/\s+/g, ' ');
	return normalized.length > 0 ? normalized : null;
}

async function readJson(filePath) {
	const text = await readFile(filePath, 'utf8');
	return JSON.parse(text);
}

function firstGeometryCollection(topojson) {
	if (!isObject(topojson?.objects)) return [];

	const preferred = topojson.objects.ne_110m_admin_0_countries;
	if (preferred?.type === 'GeometryCollection' && Array.isArray(preferred.geometries)) {
		return preferred.geometries;
	}

	const collection = Object.values(topojson.objects).find(
		(object) => object?.type === 'GeometryCollection' && Array.isArray(object.geometries)
	);
	return collection?.geometries ?? [];
}

function registryIndexes(registry) {
	const byCode = new Map();
	const byName = new Map();

	for (const record of Array.isArray(registry) ? registry : []) {
		if (!isObject(record)) continue;

		const naturalEarth = isObject(record.natural_earth) ? record.natural_earth : {};
		for (const code of [
			...(Array.isArray(naturalEarth.iso_a3) ? naturalEarth.iso_a3 : []),
			...(Array.isArray(naturalEarth.adm0_a3) ? naturalEarth.adm0_a3 : []),
			...(Array.isArray(naturalEarth.sov_a3) ? naturalEarth.sov_a3 : []),
			record?.external_ids?.iso3,
			record?.external_ids?.world_bank,
			record?.id
		]) {
			const normalizedCode = normalizeCode(code);
			if (normalizedCode && !byCode.has(normalizedCode)) byCode.set(normalizedCode, record);
		}

		for (const alias of [
			record.display_name,
			record.short_name,
			...(Array.isArray(naturalEarth.name_aliases) ? naturalEarth.name_aliases : [])
		]) {
			const normalizedName = normalizeName(alias);
			if (normalizedName && !byName.has(normalizedName)) byName.set(normalizedName, record);
		}
	}

	return { byCode, byName };
}

function findRegistryRecordForFeature(properties, indexes) {
	for (const key of ['ISO_A3', 'ADM0_A3', 'SOV_A3']) {
		const code = normalizeCode(properties?.[key]);
		if (!code) continue;
		const record = indexes.byCode.get(code);
		if (record) return record;
	}

	for (const key of ['NAME', 'NAME_LONG', 'ADMIN']) {
		const name = normalizeName(properties?.[key]);
		if (!name) continue;
		const record = indexes.byName.get(name);
		if (record) return record;
	}

	return null;
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

		if (record?.external_ids?.iso3 === '-99') {
			errors.push(`${label}: external_ids.iso3 must not be "-99".`);
		}

		if (record?.review_status === 'needs_review') {
			const notes = Array.isArray(record.data_notes) ? record.data_notes : [];
			if (!notes.some((note) => note.includes('Generated from Natural Earth Admin 0 geometry'))) {
				errors.push(`${label}: generated records must include a Natural Earth generation note.`);
			}
		} else if (
			record?.review_status !== undefined &&
			record?.review_status !== 'reviewed'
		) {
			errors.push(
				`${label}: review_status must be "needs_review", "reviewed", or absent for curated records.`
			);
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

function validateNaturalEarthCoverage(topojson, registry) {
	const errors = [];
	const warnings = [];
	const geometries = firstGeometryCollection(topojson);
	const indexes = registryIndexes(registry);
	const matched = [];
	const unmatched = [];

	for (const [index, geometry] of geometries.entries()) {
		const record = findRegistryRecordForFeature(geometry?.properties ?? {}, indexes);
		if (record) {
			matched.push({ feature_index: index, registry_id: record.id });
		} else {
			unmatched.push({
				feature_index: index,
				name:
					geometry?.properties?.NAME_LONG ??
					geometry?.properties?.NAME ??
					geometry?.properties?.ADMIN ??
					`Feature ${index}`,
				iso_a3: geometry?.properties?.ISO_A3 ?? null,
				adm0_a3: geometry?.properties?.ADM0_A3 ?? null
			});
		}
	}

	const coverage = geometries.length === 0 ? 0 : matched.length / geometries.length;

	if (geometries.length === 0) {
		errors.push('Natural Earth geometry contains no base features.');
	} else if (coverage < minimumNaturalEarthCoverage) {
		errors.push(
			`Natural Earth registry coverage is below 95%: ${matched.length}/${geometries.length}.`
		);
	}

	if (unmatched.length > 0) {
		warnings.push(
			`Unmatched Natural Earth base geometries: ${unmatched
				.slice(0, 20)
				.map((feature) => `${feature.name} (${feature.iso_a3 ?? feature.adm0_a3 ?? 'no code'})`)
				.join(', ')}${unmatched.length > 20 ? ', ...' : ''}`
		);
	}

	return {
		errors,
		warnings,
		coverage: {
			matched: matched.length,
			total: geometries.length,
			unmatched: unmatched.length
		}
	};
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
const worldTopojson = await readJson(worldTopojsonPath);
const registryResult = validateRegistry(registry);
const indicatorResult = validateIndicators(indicators, registryResult.ids);
const naturalEarthResult = validateNaturalEarthCoverage(worldTopojson, registry);
const errors = [
	...registryResult.errors,
	...indicatorResult.errors,
	...naturalEarthResult.errors
];
const warnings = [
	...registryResult.warnings,
	...indicatorResult.warnings,
	...naturalEarthResult.warnings
];

console.log('Map-unit validation report');
console.log(`Registry records: ${Array.isArray(registry) ? registry.length : 0}`);
console.log(
	`Mock indicator records: ${Array.isArray(indicators?.map_units) ? indicators.map_units.length : 0}`
);
console.log(
	`Natural Earth coverage: ${naturalEarthResult.coverage.matched}/${naturalEarthResult.coverage.total}`
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
