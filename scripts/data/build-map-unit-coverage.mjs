import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');

const paths = {
	worldTopojson: 'static/geo/world.topojson',
	disputedTopojson: 'static/geo/disputed.topojson',
	registry: 'static/data/map-units.registry.json',
	worldSystem: 'static/data/world-system.latest.json',
	indicatorIndex: 'static/data/indicators/index.json',
	report: 'data/processed/map-unit-coverage.report.json',
	candidates: 'static/data/generated/map-units.candidates.json',
	summary: 'static/data/generated/map-unit-coverage.summary.json'
};

const invalidCodes = new Set(['', '-99']);

function isObject(value) {
	return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

async function exists(relativePath) {
	try {
		await access(path.join(repoRoot, relativePath));
		return true;
	} catch {
		return false;
	}
}

async function readJson(relativePath) {
	const text = await readFile(path.join(repoRoot, relativePath), 'utf8');
	return JSON.parse(text);
}

async function writeJson(relativePath, data) {
	const target = path.join(repoRoot, relativePath);
	await mkdir(path.dirname(target), { recursive: true });
	await writeFile(target, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

function firstGeometryCollection(topojson) {
	if (!isObject(topojson?.objects)) return [];
	const collection = Object.values(topojson.objects).find(
		(object) => object?.type === 'GeometryCollection' && Array.isArray(object.geometries)
	);
	return collection?.geometries ?? [];
}

function normalizeCode(value) {
	if (typeof value !== 'string') return null;
	const normalized = value.trim().toUpperCase();
	return invalidCodes.has(normalized) ? null : normalized;
}

function normalizeName(value) {
	if (typeof value !== 'string') return null;
	const normalized = value.trim().toLowerCase().replace(/\s+/g, ' ');
	return normalized.length > 0 ? normalized : null;
}

function slug(value) {
	const normalized = String(value ?? '')
		.normalize('NFKD')
		.replace(/[\u0300-\u036f]/g, '')
		.toUpperCase()
		.replace(/[^A-Z0-9]+/g, '_')
		.replace(/^_+|_+$/g, '');
	return normalized || 'UNKNOWN';
}

function compactObject(value) {
	return Object.fromEntries(
		Object.entries(value).filter(
			([, entryValue]) => entryValue !== undefined && entryValue !== null
		)
	);
}

function percentage(numerator, denominator) {
	if (denominator === 0) return 0;
	return Number(((numerator / denominator) * 100).toFixed(2));
}

function registryIndexes(registry) {
	const byId = new Map();
	const byCode = new Map();
	const byName = new Map();
	const duplicateIds = [];
	const aliasOwners = new Map();
	const duplicateAliases = [];
	const invalidIdRecords = [];

	for (const [index, record] of registry.entries()) {
		if (!isObject(record)) continue;

		if (record.id === '-99') invalidIdRecords.push({ index, id: record.id });

		if (typeof record.id === 'string') {
			if (byId.has(record.id)) duplicateIds.push(record.id);
			byId.set(record.id, record);
		}

		const naturalEarth = isObject(record.natural_earth) ? record.natural_earth : {};
		for (const code of [
			...(Array.isArray(naturalEarth.iso_a3) ? naturalEarth.iso_a3 : []),
			...(Array.isArray(naturalEarth.adm0_a3) ? naturalEarth.adm0_a3 : []),
			...(Array.isArray(naturalEarth.sov_a3) ? naturalEarth.sov_a3 : [])
		]) {
			const normalizedCode = normalizeCode(code);
			if (normalizedCode) byCode.set(normalizedCode, record);
		}

		for (const alias of [
			record.display_name,
			record.short_name,
			...(Array.isArray(naturalEarth.name_aliases) ? naturalEarth.name_aliases : [])
		]) {
			const normalizedName = normalizeName(alias);
			if (!normalizedName) continue;

			const previousOwner = aliasOwners.get(normalizedName);
			if (previousOwner && previousOwner !== record.id) {
				duplicateAliases.push({
					alias,
					normalized_alias: normalizedName,
					record_ids: [...new Set([previousOwner, record.id])]
				});
			}
			aliasOwners.set(normalizedName, record.id);
			byName.set(normalizedName, record);
		}
	}

	return { byId, byCode, byName, duplicateIds, duplicateAliases, invalidIdRecords };
}

function findRegistryRecord(properties, indexes) {
	for (const key of ['ISO_A3', 'ADM0_A3', 'SOV_A3']) {
		const code = normalizeCode(properties?.[key]);
		if (!code) continue;
		const record = indexes.byCode.get(code);
		if (record) return record;
	}

	for (const key of ['ADMIN', 'NAME_LONG', 'NAME', 'NAME_SORT', 'BRK_NAME']) {
		const name = normalizeName(properties?.[key]);
		if (!name) continue;
		const record = indexes.byName.get(name);
		if (record) return record;
	}

	return null;
}

function candidateId(prefix, properties, index) {
	const adm0 = normalizeCode(properties?.ADM0_A3);
	const iso = normalizeCode(properties?.ISO_A3);
	const name =
		properties?.NAME_LONG ?? properties?.ADMIN ?? properties?.NAME ?? properties?.BRK_NAME;
	const stableParts = [adm0, iso, slug(name)].filter(Boolean);
	return `${prefix}${stableParts.length > 0 ? stableParts.join('::') : 'FEATURE'}::${index}`;
}

function confidenceForProperties(properties) {
	if (
		normalizeCode(properties?.ISO_A3) &&
		normalizeName(properties?.NAME_LONG ?? properties?.ADMIN)
	) {
		return 'high';
	}
	if (
		normalizeCode(properties?.ADM0_A3) ||
		normalizeName(properties?.NAME_LONG ?? properties?.ADMIN)
	) {
		return 'medium';
	}
	return 'low';
}

function createBaseCandidate(geometry, index, generatedAt) {
	const properties = geometry.properties ?? {};
	const possibleIso3 = normalizeCode(properties.ISO_A3) ?? normalizeCode(properties.ADM0_A3);

	return compactObject({
		candidate_id: candidateId('NE::', properties, index),
		suggested_display_name:
			properties.NAME_LONG ??
			properties.ADMIN ??
			properties.NAME ??
			properties.BRK_NAME ??
			`Feature ${index}`,
		map_unit_type: properties.TYPE ?? 'map_unit',
		recognition_status: 'unknown',
		natural_earth: properties,
		possible_iso3: possibleIso3,
		possible_world_bank_code: possibleIso3,
		confidence: confidenceForProperties(properties),
		reason: 'Natural Earth base feature does not match the authoritative map-unit registry.',
		needs_review: true,
		generated_from: 'natural_earth',
		generated_at: generatedAt
	});
}

function createDisputedCandidate(geometry, index, generatedAt) {
	const properties = geometry.properties ?? {};
	const possibleIso3 = normalizeCode(properties.ISO_A3) ?? normalizeCode(properties.ADM0_A3);

	return compactObject({
		candidate_id: candidateId('NE_DISPUTED::', properties, index),
		suggested_display_name:
			properties.BRK_NAME ??
			properties.NAME_SORT ??
			properties.NAME_LONG ??
			properties.ADMIN ??
			properties.NAME ??
			`Disputed feature ${index}`,
		map_unit_type: 'disputed',
		recognition_status: 'unknown/disputed',
		sovereignty_note:
			'Generated review candidate from Natural Earth disputed/breakaway geometry. OurWorldSystem does not adjudicate sovereignty.',
		natural_earth: properties,
		possible_iso3: possibleIso3,
		possible_world_bank_code: possibleIso3,
		confidence: 'low',
		reason:
			'Natural Earth disputed overlay feature does not match a disputed or special registry record.',
		needs_review: true,
		generated_from: 'natural_earth',
		generated_at: generatedAt
	});
}

function idsFromDataset(data) {
	if (Array.isArray(data?.map_units))
		return data.map_units.map((record) => record?.id).filter(Boolean);
	if (Array.isArray(data?.records)) return data.records.map((record) => record?.id).filter(Boolean);
	return [];
}

function datasetCoverage(label, ids, registryIds, baseMatchedRegistryIds, baseFeatureCount) {
	const uniqueIds = [...new Set(ids)];
	const registryMatches = uniqueIds.filter((id) => registryIds.has(id));
	const baseMatches = uniqueIds.filter((id) => baseMatchedRegistryIds.has(id));

	return {
		id: label,
		record_count: ids.length,
		unique_record_count: uniqueIds.length,
		registry_matches: registryMatches.length,
		natural_earth_base_matches: baseMatches.length,
		coverage_against_registry_percent: percentage(registryMatches.length, registryIds.size),
		coverage_against_natural_earth_base_percent: percentage(baseMatches.length, baseFeatureCount)
	};
}

function staticPathFromIndicatorPath(indicatorPath) {
	if (typeof indicatorPath !== 'string' || indicatorPath.trim().length === 0) return null;
	const normalized = indicatorPath.startsWith('/') ? indicatorPath.slice(1) : indicatorPath;
	return normalized.startsWith('data/') ? path.join('static', normalized) : normalized;
}

const generatedAt = new Date().toISOString();
const [worldTopojson, registry, worldSystem, indicatorIndex] = await Promise.all([
	readJson(paths.worldTopojson),
	readJson(paths.registry),
	readJson(paths.worldSystem),
	readJson(paths.indicatorIndex)
]);

const disputedTopojson = (await exists(paths.disputedTopojson))
	? await readJson(paths.disputedTopojson)
	: null;
const baseGeometries = firstGeometryCollection(worldTopojson);
const disputedGeometries = disputedTopojson ? firstGeometryCollection(disputedTopojson) : [];
const indexes = registryIndexes(Array.isArray(registry) ? registry : []);
const registryIds = new Set(indexes.byId.keys());
const matchedBase = [];
const unmatchedBase = [];
const matchedDisputed = [];
const unmatchedDisputed = [];
const baseMatchedRegistryIds = new Set();

for (const [index, geometry] of baseGeometries.entries()) {
	const record = findRegistryRecord(geometry.properties ?? {}, indexes);
	if (record) {
		matchedBase.push({ feature_index: index, registry_id: record.id });
		baseMatchedRegistryIds.add(record.id);
	} else {
		unmatchedBase.push(createBaseCandidate(geometry, index, generatedAt));
	}
}

for (const [index, geometry] of disputedGeometries.entries()) {
	const record = findRegistryRecord(geometry.properties ?? {}, indexes);
	if (record) {
		matchedDisputed.push({ feature_index: index, registry_id: record.id });
	} else {
		unmatchedDisputed.push(createDisputedCandidate(geometry, index, generatedAt));
	}
}

const datasetCoverages = [
	datasetCoverage(
		'world_system_mock',
		idsFromDataset(worldSystem),
		registryIds,
		baseMatchedRegistryIds,
		baseGeometries.length
	)
];

let worldBankRecords = null;
let ucdpConflictRecords = null;

if (Array.isArray(indicatorIndex)) {
	for (const entry of indicatorIndex) {
		if (!entry?.available) continue;

		const datasetPath = staticPathFromIndicatorPath(entry.path);
		if (!datasetPath || !(await exists(datasetPath))) continue;

		const data = await readJson(datasetPath);
		const ids = idsFromDataset(data);
		const coverage = datasetCoverage(
			entry.id,
			ids,
			registryIds,
			baseMatchedRegistryIds,
			baseGeometries.length
		);
		datasetCoverages.push(coverage);

		if (entry.id === 'quality_of_life_world_bank_latest') worldBankRecords = ids.length;
		if (entry.id === 'conflict_ucdp_latest') ucdpConflictRecords = ids.length;
	}
}

const report = {
	generated_at: generatedAt,
	inputs: paths,
	counts: {
		total_base_natural_earth_features: baseGeometries.length,
		total_disputed_overlay_features: disputedGeometries.length,
		registry_record_count: registryIds.size,
		matched_base_features: matchedBase.length,
		unmatched_base_features: unmatchedBase.length,
		matched_disputed_features: matchedDisputed.length,
		unmatched_disputed_features: unmatchedDisputed.length,
		mock_world_system_records: idsFromDataset(worldSystem).length,
		world_bank_quality_of_life_records: worldBankRecords,
		ucdp_conflict_records: ucdpConflictRecords
	},
	dataset_coverage: datasetCoverages,
	quality_checks: {
		records_with_id_minus_99_errors: indexes.invalidIdRecords,
		duplicate_registry_ids: indexes.duplicateIds,
		duplicate_alias_warnings: indexes.duplicateAliases
	},
	matches: {
		base: matchedBase,
		disputed: matchedDisputed
	},
	unmatched: {
		base: unmatchedBase.map((candidate) => candidate.candidate_id),
		disputed: unmatchedDisputed.map((candidate) => candidate.candidate_id)
	}
};

const candidates = {
	meta: {
		generated_at: generatedAt,
		generated_from: 'natural_earth',
		authoritative: false,
		notes: [
			'Generated candidates are review inputs only.',
			'Do not treat these records as authoritative map-unit registry records.',
			'Manually review and promote only verified records into static/data/map-units.registry.json.'
		]
	},
	candidates: [...unmatchedBase, ...unmatchedDisputed]
};

const summary = {
	generated_at: generatedAt,
	authoritative: false,
	total_base_natural_earth_features: report.counts.total_base_natural_earth_features,
	total_disputed_overlay_features: report.counts.total_disputed_overlay_features,
	registry_record_count: report.counts.registry_record_count,
	matched_base_features: report.counts.matched_base_features,
	unmatched_base_features: report.counts.unmatched_base_features,
	matched_disputed_features: report.counts.matched_disputed_features,
	unmatched_disputed_features: report.counts.unmatched_disputed_features,
	generated_candidate_count: candidates.candidates.length,
	dataset_coverage: datasetCoverages
};

await Promise.all([
	writeJson(paths.report, report),
	writeJson(paths.candidates, candidates),
	writeJson(paths.summary, summary)
]);

console.log('Map-unit coverage report complete');
console.log(`Base Natural Earth features: ${baseGeometries.length}`);
console.log(`Matched base features: ${matchedBase.length}`);
console.log(`Unmatched base features: ${unmatchedBase.length}`);
console.log(`Disputed overlay features: ${disputedGeometries.length}`);
console.log(`Matched disputed features: ${matchedDisputed.length}`);
console.log(`Unmatched disputed features: ${unmatchedDisputed.length}`);
console.log(`Generated candidates: ${candidates.candidates.length}`);
