import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');

const paths = {
	worldTopojson: 'static/geo/world.topojson',
	registry: 'static/data/map-units.registry.json',
	report: 'data/processed/map-unit-registry-seed-report.json'
};

const invalidCodes = new Set(['', '-99']);
const matchedNote = 'Matched Natural Earth feature during registry seed.';
const generatedNote = 'Generated from Natural Earth Admin 0 geometry; needs review.';
const disputedSovereigntyNote =
	'Generated from a Natural Earth feature marked as unrecognized, breakaway, or disputed; OurWorldSystem does not adjudicate sovereignty.';
const indeterminateSovereigntyNote =
	'Generated from a Natural Earth feature with a non-standard or indeterminate classification; OurWorldSystem does not adjudicate sovereignty.';
const dependencySovereigntyNote =
	'Generated from a Natural Earth feature marked as an Admin-0 dependency; OurWorldSystem records it as a territory pending review.';

async function readJson(relativePath) {
	const text = await readFile(path.join(repoRoot, relativePath), 'utf8');
	return JSON.parse(text);
}

async function writeJson(relativePath, data) {
	const target = path.join(repoRoot, relativePath);
	await mkdir(path.dirname(target), { recursive: true });
	await writeFile(target, `${JSON.stringify(data, null, '\t')}\n`, 'utf8');
}

function isObject(value) {
	return Boolean(value && typeof value === 'object' && !Array.isArray(value));
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

function uniqueValues(values) {
	return [
		...new Set(
			values
				.filter((value) => typeof value === 'string')
				.map((value) => value.trim())
				.filter((value) => value.length > 0 && value !== '-99')
		)
	];
}

function slug(value) {
	const normalized = String(value ?? '')
		.normalize('NFKD')
		.replace(/[\u0300-\u036f]/g, '')
		.toUpperCase()
		.replace(/[^A-Z0-9]+/g, '_')
		.replace(/^_+|_+$/g, '')
		.slice(0, 48);

	return normalized || 'MAP_UNIT';
}

function firstGeometryCollection(topojson) {
	if (!isObject(topojson?.objects)) return { objectKey: null, geometries: [] };

	const preferred = topojson.objects.ne_110m_admin_0_countries;
	if (preferred?.type === 'GeometryCollection' && Array.isArray(preferred.geometries)) {
		return { objectKey: 'ne_110m_admin_0_countries', geometries: preferred.geometries };
	}

	for (const [objectKey, objectValue] of Object.entries(topojson.objects)) {
		if (objectValue?.type === 'GeometryCollection' && Array.isArray(objectValue.geometries)) {
			return { objectKey, geometries: objectValue.geometries };
		}
	}

	return { objectKey: null, geometries: [] };
}

function ensureNaturalEarth(record) {
	if (!isObject(record.natural_earth)) record.natural_earth = {};

	for (const key of ['adm0_a3', 'iso_a3', 'sov_a3', 'name_aliases']) {
		if (!Array.isArray(record.natural_earth[key])) record.natural_earth[key] = [];
	}
}

function ensureExternalIds(record) {
	if (!isObject(record.external_ids)) record.external_ids = {};

	for (const key of ['iso3', 'iso2', 'un_m49', 'world_bank', 'oecd']) {
		if (!(key in record.external_ids)) record.external_ids[key] = null;
	}
}

function addUnique(target, values) {
	const existing = new Set(target);
	for (const value of uniqueValues(values)) {
		if (!existing.has(value)) {
			target.push(value);
			existing.add(value);
		}
	}
}

function featureAliases(properties) {
	return uniqueValues([properties?.NAME, properties?.NAME_LONG, properties?.ADMIN]);
}

function featureCodes(properties) {
	return {
		adm0A3: normalizeCode(properties?.ADM0_A3),
		isoA3: normalizeCode(properties?.ISO_A3),
		sovA3: normalizeCode(properties?.SOV_A3)
	};
}

function fclassEntries(properties) {
	return [
		'FCLASS_ISO',
		'FCLASS_US',
		'FCLASS_FR',
		'FCLASS_RU',
		'FCLASS_CN'
	].map((key) => [key, String(properties?.[key] ?? '')]);
}

function hasIndeterminateType(properties) {
	return String(properties?.TYPE ?? '').toLowerCase().includes('indeterminate');
}

function hasDisputedType(properties) {
	return String(properties?.TYPE ?? '').toLowerCase().includes('disputed');
}

function hasDependencyFclass(properties) {
	return String(properties?.FCLASS_ISO ?? '').toLowerCase().includes('admin-0 dependency');
}

function hasDisputedFclass(properties) {
	const entries = fclassEntries(properties);
	const hasBreakawayOrDisputed = entries.some(([, value]) => /breakaway|disputed/i.test(value));
	const hasNonIsoUnrecognized = entries.some(
		([key, value]) => key !== 'FCLASS_ISO' && /unrecognized/i.test(value)
	);

	if (hasBreakawayOrDisputed || hasNonIsoUnrecognized) return true;

	// In the bundled Natural Earth extract, Norway has ISO_A3="-99" and
	// FCLASS_ISO="Unrecognized" even though the other recognition fields are blank.
	// Treat FCLASS_ISO alone as an ISO coding signal unless another field or TYPE
	// identifies an actual disputed/breakaway/unrecognized map unit.
	return hasDisputedType(properties);
}

function classification(properties) {
	const { adm0A3, isoA3 } = featureCodes(properties);

	if (hasIndeterminateType(properties)) {
		return {
			mapUnitType: 'special',
			recognitionStatus: 'unknown',
			sovereigntyNote: indeterminateSovereigntyNote
		};
	}

	if (hasDisputedFclass(properties) || hasDisputedType(properties)) {
		return {
			mapUnitType: 'disputed',
			recognitionStatus: 'disputed',
			sovereigntyNote: disputedSovereigntyNote
		};
	}

	if (hasDependencyFclass(properties)) {
		return {
			mapUnitType: 'territory',
			recognitionStatus: 'territory',
			sovereigntyNote: dependencySovereigntyNote
		};
	}

	if (isoA3 || adm0A3) {
		return {
			mapUnitType: 'UN member',
			recognitionStatus: 'un_member',
			sovereigntyNote: null
		};
	}

	return {
		mapUnitType: 'special',
		recognitionStatus: 'unknown',
		sovereigntyNote:
			'Generated from a Natural Earth Admin 0 feature with special or non-standard source classification; OurWorldSystem does not decide sovereignty disputes.'
	};
}

function featureSnapshot(geometry, index) {
	const properties = geometry?.properties ?? {};
	const picked = {};
	for (const key of [
		'ADM0_A3',
		'ISO_A3',
		'SOV_A3',
		'NAME',
		'NAME_LONG',
		'ADMIN',
		'TYPE',
		'FCLASS_ISO',
		'FCLASS_US',
		'FCLASS_FR',
		'FCLASS_RU',
		'FCLASS_CN'
	]) {
		picked[key] = properties[key] ?? null;
	}
	return { feature_index: index, properties: picked };
}

function buildRegistryIndexes(registry) {
	const byId = new Map();
	const byCode = new Map();
	const byName = new Map();

	for (const record of registry) {
		if (!isObject(record)) continue;

		if (typeof record.id === 'string') byId.set(record.id.toUpperCase(), record);

		const naturalEarth = isObject(record.natural_earth) ? record.natural_earth : {};
		const codeValues = [
			...(Array.isArray(naturalEarth.iso_a3) ? naturalEarth.iso_a3 : []),
			...(Array.isArray(naturalEarth.adm0_a3) ? naturalEarth.adm0_a3 : []),
			...(Array.isArray(naturalEarth.sov_a3) ? naturalEarth.sov_a3 : []),
			record?.external_ids?.iso3,
			record?.id
		];

		for (const code of codeValues) {
			const normalized = normalizeCode(code);
			if (normalized && !byCode.has(normalized)) byCode.set(normalized, record);
		}

		const nameValues = [
			record.display_name,
			record.short_name,
			...(Array.isArray(naturalEarth.name_aliases) ? naturalEarth.name_aliases : [])
		];

		for (const name of nameValues) {
			const normalized = normalizeName(name);
			if (normalized && !byName.has(normalized)) byName.set(normalized, record);
		}
	}

	return { byId, byCode, byName };
}

function findExistingRecord(properties, indexes) {
	const { isoA3, adm0A3, sovA3 } = featureCodes(properties);

	for (const code of [isoA3, adm0A3, sovA3]) {
		if (!code) continue;
		const record = indexes.byCode.get(code);
		if (record) return record;
	}

	for (const code of [isoA3, adm0A3]) {
		if (!code) continue;
		const record = indexes.byId.get(code);
		if (record) return record;
	}

	for (const name of featureAliases(properties)) {
		const record = indexes.byName.get(normalizeName(name));
		if (record) return record;
	}

	return null;
}

function appendMatchedNaturalEarth(record, properties) {
	ensureNaturalEarth(record);
	ensureExternalIds(record);

	const { adm0A3, isoA3, sovA3 } = featureCodes(properties);
	addUnique(record.natural_earth.adm0_a3, [adm0A3]);
	addUnique(record.natural_earth.iso_a3, [isoA3]);
	addUnique(record.natural_earth.sov_a3, [sovA3]);
	addUnique(record.natural_earth.name_aliases, featureAliases(properties));

	if (!Array.isArray(record.data_notes)) record.data_notes = [];
	if (!record.data_notes.includes(matchedNote)) record.data_notes.push(matchedNote);
}

function candidateBaseId(properties) {
	const { isoA3, adm0A3 } = featureCodes(properties);
	if (isoA3) return isoA3;
	if (adm0A3) return adm0A3;
	return `NE_${slug(properties?.NAME_LONG ?? properties?.NAME ?? properties?.ADMIN)}`;
}

function externalIdCode(properties) {
	const { adm0A3, isoA3 } = featureCodes(properties);
	if (isoA3) return isoA3;
	if (adm0A3 && !hasDisputedFclass(properties) && !hasDisputedType(properties)) return adm0A3;
	return null;
}

function uniqueId(baseId, usedIds) {
	let id = baseId;
	let suffix = 2;

	while (usedIds.has(id)) {
		id = `${baseId}_${suffix}`;
		suffix += 1;
	}

	usedIds.add(id);
	return id;
}

function createGeneratedRecord(properties, usedIds) {
	const { adm0A3, isoA3, sovA3 } = featureCodes(properties);
	const inferred = classification(properties);
	const externalCode = externalIdCode(properties);
	const id = uniqueId(candidateBaseId(properties), usedIds);
	const displayName = properties?.NAME_LONG ?? properties?.NAME ?? properties?.ADMIN ?? id;
	const shortName = properties?.NAME ?? displayName;

	return {
		id,
		display_name: displayName,
		short_name: shortName,
		map_unit_type: inferred.mapUnitType,
		recognition_status: inferred.recognitionStatus,
		sovereignty_note: inferred.sovereigntyNote,
		natural_earth: {
			adm0_a3: uniqueValues([adm0A3]),
			iso_a3: uniqueValues([isoA3]),
			sov_a3: uniqueValues([sovA3]),
			name_aliases: featureAliases(properties)
		},
		external_ids: {
			iso3: externalCode,
			iso2: null,
			un_m49: null,
			world_bank: externalCode,
			oecd: null
		},
		data_notes: [generatedNote],
		last_reviewed: null,
		review_status: 'needs_review'
	};
}

function isGeneratedRecord(record) {
	const notes = Array.isArray(record?.data_notes) ? record.data_notes : [];
	return (
		record?.review_status === 'needs_review' ||
		notes.some((note) => typeof note === 'string' && note.includes(generatedNote))
	);
}

function refreshGeneratedRecord(record, properties) {
	ensureExternalIds(record);
	const inferred = classification(properties);
	const externalCode = externalIdCode(properties);

	record.map_unit_type = inferred.mapUnitType;
	record.recognition_status = inferred.recognitionStatus;
	record.sovereignty_note = inferred.sovereigntyNote;
	record.external_ids.iso3 = externalCode;
	record.external_ids.world_bank = externalCode;

	if (record.external_ids.oecd === '-99') record.external_ids.oecd = null;
}

function sortRegistry(registry) {
	return registry.sort((a, b) => {
		const left = typeof a?.display_name === 'string' ? a.display_name : a?.id ?? '';
		const right = typeof b?.display_name === 'string' ? b.display_name : b?.id ?? '';
		const byName = left.localeCompare(right);
		return byName === 0 ? String(a?.id ?? '').localeCompare(String(b?.id ?? '')) : byName;
	});
}

const generatedAt = new Date().toISOString();
const [topojson, registryInput] = await Promise.all([
	readJson(paths.worldTopojson),
	readJson(paths.registry)
]);

if (!Array.isArray(registryInput)) {
	throw new Error(`${paths.registry} must contain a registry array.`);
}

const { objectKey, geometries } = firstGeometryCollection(topojson);
const registry = registryInput;
const usedIds = new Set(
	registry
		.map((record) => (typeof record?.id === 'string' ? record.id : null))
		.filter(Boolean)
);
const beforeCount = registry.length;
const beforeGeneratedCount = registry.filter((record) => record?.review_status === 'needs_review').length;
const beforeReviewedCount = registry.filter((record) => record?.review_status === 'reviewed' || record?.last_reviewed).length;
const matchedFeatures = [];
const generatedFeatures = [];
const generatedRecords = [];

let indexes = buildRegistryIndexes(registry);

for (const [index, geometry] of geometries.entries()) {
	const properties = geometry?.properties ?? {};
	const existingRecord = findExistingRecord(properties, indexes);

	if (existingRecord) {
		appendMatchedNaturalEarth(existingRecord, properties);
		if (isGeneratedRecord(existingRecord)) refreshGeneratedRecord(existingRecord, properties);
		matchedFeatures.push({
			...featureSnapshot(geometry, index),
			registry_id: existingRecord.id
		});
		indexes = buildRegistryIndexes(registry);
		continue;
	}

	const generatedRecord = createGeneratedRecord(properties, usedIds);
	registry.push(generatedRecord);
	generatedRecords.push(generatedRecord);
	generatedFeatures.push({
		...featureSnapshot(geometry, index),
		registry_id: generatedRecord.id
	});
	indexes = buildRegistryIndexes(registry);
}

sortRegistry(registry);

const report = {
	generated_at: generatedAt,
	inputs: paths,
	natural_earth_object_key: objectKey,
	counts: {
		natural_earth_feature_count: geometries.length,
		registry_count_before: beforeCount,
		registry_count_after: registry.length,
		generated_records_before: beforeGeneratedCount,
		generated_records_after: registry.filter((record) => record?.review_status === 'needs_review')
			.length,
		reviewed_or_curated_records_before: beforeReviewedCount,
		reviewed_or_curated_records_after: registry.filter(
			(record) => record?.review_status === 'reviewed' || record?.last_reviewed
		).length,
		matched_existing_features: matchedFeatures.length,
		generated_new_records: generatedRecords.length,
		coverage_features: matchedFeatures.length + generatedFeatures.length
	},
	matched_existing_features: matchedFeatures,
	generated_features: generatedFeatures,
	generated_record_ids: generatedRecords.map((record) => record.id),
	notes: [
		'Natural Earth Admin 0 geometry is source geometry, not political recognition.',
		'TYPE="Sovereign country" is not sufficient to infer UN membership.',
		'Unrecognized, breakaway, disputed, dependency, and indeterminate Natural Earth classifications take precedence for generated records.',
		'Generated records require human review before they should be treated as curated registry entries.',
		'Missing external IDs remain null unless Natural Earth provided a valid ISO_A3 code, or a valid ADM0_A3 code on a feature without disputed/breakaway markers.'
	]
};

await Promise.all([writeJson(paths.registry, registry), writeJson(paths.report, report)]);

console.log('Map-unit registry seed complete.');
console.log(`Natural Earth features: ${geometries.length}`);
console.log(`Registry records before: ${beforeCount}`);
console.log(`Registry records after: ${registry.length}`);
console.log(`Matched existing features: ${matchedFeatures.length}`);
console.log(`Generated new records: ${generatedRecords.length}`);
console.log(`Report: ${paths.report}`);
