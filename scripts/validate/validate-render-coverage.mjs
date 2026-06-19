import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { geoEqualEarth, geoPath } from 'd3';
import { feature } from 'topojson-client';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');

const paths = {
	worldTopology: path.join(repoRoot, 'static/geo/world.topojson'),
	registry: path.join(repoRoot, 'static/data/map-units.registry.json'),
	worldSystem: path.join(repoRoot, 'static/data/world-system.latest.json'),
	worldBankQuality: path.join(
		repoRoot,
		'static/data/indicators/quality-of-life.world-bank.latest.json'
	)
};

const invalidNaturalEarthCodes = new Set(['', '-99']);

function readJson(filePath) {
	return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function readJsonIfPresent(filePath) {
	if (!fs.existsSync(filePath)) return null;
	return readJson(filePath);
}

function normalizeCode(value) {
	if (typeof value !== 'string') return null;

	const normalized = value.trim().toUpperCase();

	return invalidNaturalEarthCodes.has(normalized) ? null : normalized;
}

function normalizeName(value) {
	if (typeof value !== 'string') return null;

	const normalized = value.trim().toLocaleLowerCase();

	return normalized.length > 0 ? normalized : null;
}

function buildRegistryIndexes(registry) {
	const byNaturalEarthCode = new Map();
	const byNameAlias = new Map();

	for (const record of registry) {
		for (const code of [
			...(record.natural_earth?.iso_a3 ?? []),
			...(record.natural_earth?.adm0_a3 ?? []),
			...(record.natural_earth?.sov_a3 ?? [])
		]) {
			const normalizedCode = normalizeCode(code);

			if (normalizedCode) {
				byNaturalEarthCode.set(normalizedCode, record);
			}
		}

		for (const alias of [
			record.display_name,
			record.short_name,
			...(record.natural_earth?.name_aliases ?? [])
		]) {
			const normalizedAlias = normalizeName(alias);

			if (normalizedAlias) {
				byNameAlias.set(normalizedAlias, record);
			}
		}
	}

	return { byNaturalEarthCode, byNameAlias };
}

function findRegistryRecordForNaturalEarthFeature(properties, indexes) {
	for (const key of ['ISO_A3', 'ADM0_A3', 'SOV_A3']) {
		const code = normalizeCode(properties?.[key]);

		if (!code) continue;

		const record = indexes.byNaturalEarthCode.get(code);

		if (record) return record;
	}

	for (const key of ['ADMIN', 'NAME_LONG', 'NAME']) {
		const name = normalizeName(properties?.[key]);

		if (!name) continue;

		const record = indexes.byNameAlias.get(name);

		if (record) return record;
	}

	return null;
}

function getTopologyObject(topology, preferredKeys) {
	const objects = topology.objects ?? {};
	const keys = Object.keys(objects);
	const orderedKeys = [...preferredKeys, ...keys.filter((key) => !preferredKeys.includes(key))];

	for (const key of orderedKeys) {
		const object = objects[key];

		if (object?.type) {
			return { key, object };
		}
	}

	throw new Error('No valid TopoJSON object found in static/geo/world.topojson.');
}

function normalizeFeatureResult(result) {
	if (result.type === 'FeatureCollection') return result.features;
	if (result.type === 'Feature') return [result];
	return [];
}

function isRecordObject(value) {
	return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function normalizeWorldSystemDemoData(input) {
	let records = [];

	if (Array.isArray(input)) {
		records = input;
	} else if (isRecordObject(input) && Array.isArray(input.map_units)) {
		records = input.map_units;
	} else if (isRecordObject(input) && Array.isArray(input.records)) {
		records = input.records;
	} else if (isRecordObject(input)) {
		records = Object.entries(input)
			.filter(([key, value]) => key !== 'meta' && isRecordObject(value))
			.map(([id, value]) => ({ id, ...value }));
	}

	return new Map(
		records
			.filter((record) => isRecordObject(record) && typeof record.id === 'string')
			.map((record) => [record.id, record])
	);
}

const topology = readJson(paths.worldTopology);
const registry = readJson(paths.registry);
const worldSystem = readJson(paths.worldSystem);
const worldBankQuality = readJsonIfPresent(paths.worldBankQuality);

const topologyObject = getTopologyObject(topology, ['ne_110m_admin_0_countries']);
const geoFeatures = normalizeFeatureResult(feature(topology, topologyObject.object));
const registryIndexes = buildRegistryIndexes(registry);
const worldSystemDemoById = normalizeWorldSystemDemoData(worldSystem);
const worldBankQualityById = new Map(
	(worldBankQuality?.records ?? []).map((record) => [record.id, record])
);

const featureCollection = {
	type: 'FeatureCollection',
	features: geoFeatures
};
const projection = geoEqualEarth().fitExtent(
	[
		[12, 12],
		[1000 - 12, 520 - 12]
	],
	featureCollection
);
const pathGenerator = geoPath(projection);

let drawableCount = 0;
let registryMatchedCount = 0;
const matchedRegistryIds = new Set();

for (const geoFeature of geoFeatures) {
	const drawablePath = pathGenerator(geoFeature);

	if (!drawablePath) continue;

	drawableCount += 1;

	const registryRecord = findRegistryRecordForNaturalEarthFeature(
		geoFeature.properties ?? {},
		registryIndexes
	);

	if (!registryRecord) continue;

	registryMatchedCount += 1;
	matchedRegistryIds.add(registryRecord.id);
}

const worldSystemMatchedCount = [...worldSystemDemoById.keys()].filter((id) =>
	matchedRegistryIds.has(id)
).length;
const worldBankQualityMatchedCount = [...worldBankQualityById.keys()].filter((id) =>
	matchedRegistryIds.has(id)
).length;
const minimumDrawableCount = Math.ceil(geoFeatures.length * 0.95);

console.log(`Natural Earth feature count: ${geoFeatures.length}`);
console.log(`registry record count: ${Array.isArray(registry) ? registry.length : 0}`);
console.log(`world-system demo record count: ${worldSystemDemoById.size}`);
console.log(`World Bank quality record count: ${worldBankQualityById.size}`);
console.log(`expected drawable geometry count: ${drawableCount}`);
console.log(`registry match count: ${registryMatchedCount}`);
console.log(`world-system demo match count: ${worldSystemMatchedCount}`);
console.log(`World Bank quality match count: ${worldBankQualityMatchedCount}`);

if (drawableCount < minimumDrawableCount) {
	console.error(
		`Render coverage failed: ${drawableCount} drawable paths is below 95% of ${geoFeatures.length} Natural Earth features.`
	);
	process.exit(1);
}
