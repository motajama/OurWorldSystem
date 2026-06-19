import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');

const paths = {
	registry: 'static/data/map-units.registry.json',
	worldTopojson: 'static/geo/world.topojson',
	worldBankQualityOfLife: 'static/data/indicators/quality-of-life.world-bank.latest.json',
	seedReport: 'data/processed/map-unit-registry-seed-report.json',
	coverageReport: 'data/processed/map-unit-coverage.report.json',
	report: 'data/processed/registry-review-report.json'
};

const invalidCodes = new Set(['', '-99']);
const generatedNote = 'Generated from Natural Earth Admin 0 geometry';
const priorityMapUnitTypes = new Set(['special', 'no_data', 'territory', 'disputed']);
const ordinaryNaturalEarthTypes = new Set(['Sovereign country', 'Country']);
const ordinaryNaturalEarthFclasses = new Set(['', 'Admin-0 country']);
const duplicateGroupLimit = 20;
const missingIdPrintLimit = 25;

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

async function readJsonIfPresent(relativePath) {
	if (!(await exists(relativePath))) return null;
	return readJson(relativePath);
}

async function writeJson(relativePath, data) {
	const target = path.join(repoRoot, relativePath);
	await mkdir(path.dirname(target), { recursive: true });
	await writeFile(target, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
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

function normalizeCode(value) {
	if (typeof value !== 'string') return null;
	const normalized = value.trim().toUpperCase();
	return invalidCodes.has(normalized) ? null : normalized;
}

function normalizeName(value) {
	if (typeof value !== 'string') return null;
	const normalized = value
		.normalize('NFKD')
		.replace(/[\u0300-\u036f]/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, ' ')
		.trim()
		.replace(/\s+/g, ' ');
	return normalized.length > 0 ? normalized : null;
}

function unique(values) {
	return [...new Set(values.filter((value) => value !== null && value !== undefined))];
}

function externalIds(record) {
	return isObject(record?.external_ids) ? record.external_ids : {};
}

function naturalEarth(record) {
	return isObject(record?.natural_earth) ? record.natural_earth : {};
}

function naturalEarthCodes(record) {
	const source = naturalEarth(record);
	return unique([
		...(Array.isArray(source.iso_a3) ? source.iso_a3.map(normalizeCode) : []),
		...(Array.isArray(source.adm0_a3) ? source.adm0_a3.map(normalizeCode) : []),
		...(Array.isArray(source.sov_a3) ? source.sov_a3.map(normalizeCode) : [])
	]);
}

function naturalEarthNames(record) {
	const source = naturalEarth(record);
	return unique([
		record?.display_name,
		record?.short_name,
		...(Array.isArray(source.name_aliases) ? source.name_aliases : [])
	]).filter((value) => typeof value === 'string' && value.trim().length > 0);
}

function isGeneratedRecord(record) {
	const notes = Array.isArray(record?.data_notes) ? record.data_notes : [];
	return (
		record?.review_status === 'needs_review' ||
		notes.some((note) => typeof note === 'string' && note.includes(generatedNote))
	);
}

function registryIndexes(registry) {
	const byCode = new Map();
	const byName = new Map();

	for (const record of registry) {
		if (!isObject(record)) continue;

		for (const code of [
			...naturalEarthCodes(record),
			normalizeCode(record?.id),
			normalizeCode(externalIds(record).iso3),
			normalizeCode(externalIds(record).world_bank)
		]) {
			if (code && !byCode.has(code)) byCode.set(code, record);
		}

		for (const name of naturalEarthNames(record)) {
			const normalized = normalizeName(name);
			if (normalized && !byName.has(normalized)) byName.set(normalized, record);
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

	for (const key of ['NAME_LONG', 'ADMIN', 'NAME', 'NAME_SORT', 'BRK_NAME']) {
		const name = normalizeName(properties?.[key]);
		if (!name) continue;
		const record = indexes.byName.get(name);
		if (record) return record;
	}

	return null;
}

function buildNaturalEarthIndex(registry, geometries) {
	const indexes = registryIndexes(registry);
	const byRegistryId = new Map();

	for (const [featureIndex, geometry] of geometries.entries()) {
		const properties = geometry?.properties ?? {};
		const record = findRegistryRecordForFeature(properties, indexes);
		if (!record?.id) continue;

		if (!byRegistryId.has(record.id)) byRegistryId.set(record.id, []);
		byRegistryId.get(record.id).push({
			feature_index: featureIndex,
			type: properties.TYPE ?? null,
			fclasses: Object.fromEntries(
				Object.entries(properties)
					.filter(([key]) => key.startsWith('FCLASS'))
					.map(([key, value]) => [key, value || null])
			),
			properties: {
				ADM0_A3: properties.ADM0_A3 ?? null,
				ISO_A3: properties.ISO_A3 ?? null,
				SOV_A3: properties.SOV_A3 ?? null,
				NAME: properties.NAME ?? null,
				NAME_LONG: properties.NAME_LONG ?? null,
				ADMIN: properties.ADMIN ?? null,
				TYPE: properties.TYPE ?? null
			}
		});
	}

	return byRegistryId;
}

function worldBankMatchedIds(worldBankData) {
	if (!isObject(worldBankData) || !Array.isArray(worldBankData.records)) return new Set();
	return new Set(
		worldBankData.records
			.map((record) => (typeof record?.id === 'string' ? record.id.trim() : null))
			.filter(Boolean)
	);
}

function recordHasWorldBankData(record, matchedIds) {
	const ids = unique([
		record?.id,
		externalIds(record).world_bank,
		externalIds(record).iso3,
		...naturalEarthCodes(record)
	]).filter((value) => typeof value === 'string');
	return ids.some((id) => matchedIds.has(id));
}

function hasUnknownRecognition(record) {
	return record?.recognition_status === undefined || record?.recognition_status === 'unknown';
}

function hasMissingExternalId(record, key) {
	const value = externalIds(record)[key];
	return typeof value !== 'string' || value.trim().length === 0 || value.trim() === '-99';
}

function unusualNaturalEarthFacts(features) {
	const unusual = [];

	for (const feature of features) {
		if (feature.type && !ordinaryNaturalEarthTypes.has(feature.type)) {
			unusual.push(`TYPE=${feature.type}`);
		}

		for (const [key, value] of Object.entries(feature.fclasses ?? {})) {
			if (typeof value === 'string' && !ordinaryNaturalEarthFclasses.has(value)) {
				unusual.push(`${key}=${value}`);
			}
		}
	}

	return unique(unusual);
}

function needsSovereigntyNote(record, unusualFacts) {
	return (
		(record?.sovereignty_note === null ||
			record?.sovereignty_note === undefined ||
			String(record.sovereignty_note).trim().length === 0) &&
		(record?.map_unit_type === 'disputed' || unusualFacts.length > 0)
	);
}

function priorityReasons(record, features) {
	const ids = externalIds(record);
	const reasons = [];
	const unusualFacts = unusualNaturalEarthFacts(features);

	if (typeof record?.id === 'string' && record.id.startsWith('NE_'))
		reasons.push('id starts with NE_');
	if (!normalizeCode(ids.iso3)) reasons.push('missing external_ids.iso3');
	if (!normalizeCode(ids.world_bank)) reasons.push('missing external_ids.world_bank');
	if (hasUnknownRecognition(record)) reasons.push('recognition_status unknown');
	if (priorityMapUnitTypes.has(record?.map_unit_type)) {
		reasons.push(`map_unit_type ${record.map_unit_type}`);
	}
	for (const fact of unusualFacts) reasons.push(`unusual Natural Earth ${fact}`);
	if (record?.sovereignty_note) reasons.push('sovereignty_note present');
	if (needsSovereigntyNote(record, unusualFacts)) reasons.push('sovereignty_note likely needed');

	return reasons;
}

function buildPriorityRecords(registry, naturalEarthByRegistryId) {
	return registry
		.filter((record) => isObject(record) && isGeneratedRecord(record))
		.map((record) => {
			const features = naturalEarthByRegistryId.get(record.id) ?? [];
			return {
				id: record.id,
				display_name: record.display_name ?? null,
				map_unit_type: record.map_unit_type ?? null,
				recognition_status: record.recognition_status ?? null,
				external_ids: {
					iso3: externalIds(record).iso3 ?? null,
					world_bank: externalIds(record).world_bank ?? null,
					un_m49: externalIds(record).un_m49 ?? null,
					iso2: externalIds(record).iso2 ?? null
				},
				sovereignty_note: record.sovereignty_note ?? null,
				natural_earth: {
					adm0_a3: Array.isArray(naturalEarth(record).adm0_a3) ? naturalEarth(record).adm0_a3 : [],
					iso_a3: Array.isArray(naturalEarth(record).iso_a3) ? naturalEarth(record).iso_a3 : [],
					sov_a3: Array.isArray(naturalEarth(record).sov_a3) ? naturalEarth(record).sov_a3 : [],
					features
				},
				reasons: priorityReasons(record, features)
			};
		})
		.filter((record) => record.reasons.length > 0)
		.sort(
			(a, b) => b.reasons.length - a.reasons.length || a.display_name.localeCompare(b.display_name)
		);
}

function pushGroup(groups, key, value, record) {
	if (!value) return;
	const groupKey = `${key}:${value}`;
	if (!groups.has(groupKey)) groups.set(groupKey, { key, value, records: [] });
	groups.get(groupKey).records.push({
		id: record.id,
		display_name: record.display_name ?? null,
		map_unit_type: record.map_unit_type ?? null,
		review_status: record.review_status ?? null
	});
}

function duplicateGroups(registry) {
	const groups = new Map();

	for (const record of registry) {
		if (!isObject(record)) continue;

		for (const value of Array.isArray(naturalEarth(record).sov_a3)
			? naturalEarth(record).sov_a3
			: []) {
			pushGroup(groups, 'natural_earth.sov_a3', normalizeCode(value), record);
		}

		pushGroup(groups, 'display_name.normalized', normalizeName(record.display_name), record);
		pushGroup(groups, 'external_ids.iso3', normalizeCode(externalIds(record).iso3), record);
		pushGroup(
			groups,
			'external_ids.world_bank',
			normalizeCode(externalIds(record).world_bank),
			record
		);
	}

	return [...groups.values()]
		.filter((group) => group.records.length > 1)
		.sort((a, b) => b.records.length - a.records.length || a.key.localeCompare(b.key));
}

function missingIds(registry) {
	const result = {
		iso3: [],
		world_bank: [],
		un_m49: [],
		iso2: []
	};

	for (const record of registry) {
		if (!isObject(record)) continue;

		for (const key of Object.keys(result)) {
			if (hasMissingExternalId(record, key)) {
				result[key].push({
					id: record.id,
					display_name: record.display_name ?? null,
					map_unit_type: record.map_unit_type ?? null,
					review_status: record.review_status ?? null
				});
			}
		}
	}

	return result;
}

function printList(records, formatter, limit = 30) {
	if (records.length === 0) {
		console.log('  None');
		return;
	}

	for (const record of records.slice(0, limit)) {
		console.log(`  - ${formatter(record)}`);
	}

	if (records.length > limit) {
		console.log(`  ... ${records.length - limit} more`);
	}
}

function printReport(report, inputs) {
	console.log('Registry Review Report');
	console.log(`Generated at: ${report.generated_at}`);
	console.log('');

	console.log('A. Summary');
	for (const [key, value] of Object.entries(report.summary)) {
		console.log(`  ${key}: ${value}`);
	}
	console.log('');

	console.log('B. Highest-priority review list');
	printList(
		report.priority_records,
		(record) => `${record.id} — ${record.display_name} (${record.reasons.join('; ')})`,
		40
	);
	console.log('');

	console.log('C. Possible duplicates / shared sovereignty');
	printList(
		report.duplicate_groups.groups,
		(group) =>
			`${group.key}=${group.value}: ${group.records
				.map((record) => `${record.id} (${record.display_name})`)
				.join(', ')}`,
		duplicateGroupLimit
	);
	console.log('');

	console.log('D. Missing IDs');
	for (const [key, records] of Object.entries(report.missing_ids)) {
		console.log(`  external_ids.${key}: ${records.length}`);
		printList(records, (record) => `${record.id} — ${record.display_name}`, missingIdPrintLimit);
	}
	console.log('');

	console.log('E. Suggested manual review checklist');
	for (const item of report.manual_review_checklist) {
		console.log(`  - ${item}`);
	}
	console.log('');

	console.log(`JSON report: ${paths.report}`);
	console.log(
		`Optional inputs: World Bank ${inputs.worldBankQualityOfLife ? 'present' : 'missing'}, seed report ${
			inputs.seedReport ? 'present' : 'missing'
		}, coverage report ${inputs.coverageReport ? 'present' : 'missing'}`
	);
}

const [registry, topojson, worldBankData, seedReport, coverageReport] = await Promise.all([
	readJson(paths.registry),
	readJson(paths.worldTopojson),
	readJsonIfPresent(paths.worldBankQualityOfLife),
	readJsonIfPresent(paths.seedReport),
	readJsonIfPresent(paths.coverageReport)
]);

if (!Array.isArray(registry)) {
	throw new Error(`${paths.registry} must contain a registry array.`);
}

const geometries = firstGeometryCollection(topojson);
const naturalEarthByRegistryId = buildNaturalEarthIndex(registry, geometries);
const matchedWorldBankIds = worldBankMatchedIds(worldBankData);
const recordsMatchedByWorldBank = registry.filter((record) =>
	recordHasWorldBankData(record, matchedWorldBankIds)
);
const recordsMissingWorldBank = registry.filter(
	(record) => !recordHasWorldBankData(record, matchedWorldBankIds)
);
const generatedRecords = registry.filter((record) => isObject(record) && isGeneratedRecord(record));
const reviewedRecords = registry.filter(
	(record) => record?.review_status === 'reviewed' || Boolean(record?.last_reviewed)
);
const needsReviewRecords = registry.filter((record) => record?.review_status === 'needs_review');
const priorityRecords = buildPriorityRecords(registry, naturalEarthByRegistryId);
const duplicateGroupList = duplicateGroups(registry);
const missingIdGroups = missingIds(registry);

const report = {
	generated_at: new Date().toISOString(),
	inputs: {
		registry: paths.registry,
		world_topojson: paths.worldTopojson,
		world_bank_quality_of_life: worldBankData ? paths.worldBankQualityOfLife : null,
		seed_report: seedReport ? paths.seedReport : null,
		coverage_report: coverageReport ? paths.coverageReport : null
	},
	summary: {
		total_registry_records: registry.length,
		reviewed_records_count: reviewedRecords.length,
		needs_review_count: needsReviewRecords.length,
		generated_records_count: generatedRecords.length,
		records_with_recognition_status_unknown: registry.filter((record) =>
			hasUnknownRecognition(record)
		).length,
		records_without_iso3: registry.filter((record) => hasMissingExternalId(record, 'iso3')).length,
		records_without_world_bank_id: registry.filter((record) =>
			hasMissingExternalId(record, 'world_bank')
		).length,
		records_matched_by_world_bank_indicator_output: recordsMatchedByWorldBank.length,
		records_missing_world_bank_data: recordsMissingWorldBank.length
	},
	priority_records: priorityRecords,
	duplicate_groups: {
		count: duplicateGroupList.length,
		groups: duplicateGroupList
	},
	missing_ids: missingIdGroups,
	manual_review_checklist: [
		'Verify display_name.',
		'Verify map_unit_type.',
		'Verify recognition_status.',
		'Verify World Bank code.',
		'Verify whether generated record should be merged with a curated record.',
		'Add sovereignty_note only in neutral language.',
		'Never use geometry as recognition.'
	]
};

await writeJson(paths.report, report);
printReport(report, { worldBankQualityOfLife: worldBankData, seedReport, coverageReport });
