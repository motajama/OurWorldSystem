import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { feature } from 'topojson-client';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');

const paths = {
	worldTopology: path.join(repoRoot, 'static/geo/world.topojson'),
	registry: path.join(repoRoot, 'static/data/map-units.registry.json')
};

const invalidNaturalEarthCodes = new Set(['', '-99']);
const requiredMatches = new Map([
	['DNK', 'Denmark'],
	['GRL', 'Greenland'],
	['SWE', 'Sweden'],
	['NOR', 'Norway'],
	['FIN', 'Finland'],
	['ISL', 'Iceland'],
	['CAN', 'Canada'],
	['USA', 'United States']
]);
const optionalMatches = new Map([['FRO', 'Faroe Islands']]);
const curatedAdm0Aliases = new Map([
	['SAH', 'ESH'],
	['PSX', 'PSE'],
	['SDS', 'SSD'],
	['KOS', 'XKO']
]);

function readJson(filePath) {
	return JSON.parse(fs.readFileSync(filePath, 'utf8'));
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

function addCandidate(index, key, record) {
	const candidates = index.get(key) ?? [];
	if (!candidates.some((candidate) => candidate.id === record.id)) {
		candidates.push(record);
		index.set(key, candidates);
	}
}

function buildRegistryIndexes(registry) {
	const byId = new Map();
	const byExternalIso3 = new Map();
	const byNaturalEarthIsoA3 = new Map();
	const byNaturalEarthAdm0A3 = new Map();
	const byNaturalEarthSovA3 = new Map();
	const byNameAlias = new Map();

	for (const record of Array.isArray(registry) ? registry : []) {
		const id = normalizeCode(record?.id);
		if (id) byId.set(id, record);

		const externalIso3 = normalizeCode(record?.external_ids?.iso3);
		if (externalIso3) addCandidate(byExternalIso3, externalIso3, record);

		for (const code of record?.natural_earth?.iso_a3 ?? []) {
			const normalizedCode = normalizeCode(code);
			if (normalizedCode) addCandidate(byNaturalEarthIsoA3, normalizedCode, record);
		}

		for (const code of record?.natural_earth?.adm0_a3 ?? []) {
			const normalizedCode = normalizeCode(code);
			if (normalizedCode) addCandidate(byNaturalEarthAdm0A3, normalizedCode, record);
		}

		for (const code of record?.natural_earth?.sov_a3 ?? []) {
			const normalizedCode = normalizeCode(code);
			if (normalizedCode) addCandidate(byNaturalEarthSovA3, normalizedCode, record);
		}

		for (const alias of [
			record?.display_name,
			record?.short_name,
			...(record?.natural_earth?.name_aliases ?? [])
		]) {
			const normalizedAlias = normalizeName(alias);
			if (normalizedAlias) addCandidate(byNameAlias, normalizedAlias, record);
		}
	}

	return {
		byId,
		byExternalIso3,
		byNaturalEarthIsoA3,
		byNaturalEarthAdm0A3,
		byNaturalEarthSovA3,
		byNameAlias
	};
}

function uniqueCandidates(candidates) {
	const seen = new Set();
	const unique = [];

	for (const candidate of candidates) {
		if (!seen.has(candidate.id)) {
			seen.add(candidate.id);
			unique.push(candidate);
		}
	}

	return unique;
}

function resolveCandidate(candidates, reason, field, value) {
	const unique = uniqueCandidates(candidates);
	if (unique.length === 0) return null;
	if (unique.length === 1) {
		return { record: unique[0], reason, field, value, ambiguousCandidates: [] };
	}
	return { record: null, reason: 'ambiguous', field, value, ambiguousCandidates: unique };
}

function directIdCandidate(indexes, code) {
	const record = indexes.byId.get(code);
	return record ? [record] : [];
}

function findCodeMatch(code, field, reason, indexes) {
	const candidateGroups =
		field === 'ISO_A3'
			? [
					indexes.byExternalIso3.get(code) ?? [],
					indexes.byNaturalEarthIsoA3.get(code) ?? [],
					directIdCandidate(indexes, code)
				]
			: [
					indexes.byNaturalEarthAdm0A3.get(code) ?? [],
					directIdCandidate(indexes, code),
					indexes.byExternalIso3.get(code) ?? []
				];

	for (const candidates of candidateGroups) {
		const match = resolveCandidate(candidates, reason, field, code);
		if (match) return match;
	}

	return null;
}

function findRegistryMatchForNaturalEarthFeature(properties, indexes) {
	const isoA3 = normalizeCode(properties.ISO_A3);
	if (isoA3) {
		const match = findCodeMatch(isoA3, 'ISO_A3', 'iso_a3', indexes);
		if (match) return match;
	}

	const adm0A3 = normalizeCode(properties.ADM0_A3);
	if (adm0A3) {
		const match = findCodeMatch(adm0A3, 'ADM0_A3', 'adm0_a3', indexes);
		if (match) return match;
	}

	for (const key of ['ADMIN', 'NAME_LONG', 'NAME']) {
		const name = normalizeName(properties[key]);
		if (!name) continue;
		const match = resolveCandidate(indexes.byNameAlias.get(name) ?? [], 'name_alias', key, name);
		if (match) return match;
	}

	const sovA3 = normalizeCode(properties.SOV_A3);
	if (sovA3 && !isoA3 && !adm0A3) {
		const match = resolveCandidate(indexes.byNaturalEarthSovA3.get(sovA3) ?? [], 'sov_a3', 'SOV_A3', sovA3);
		if (match) return match;
	}

	return null;
}

function getTopologyObject(topology) {
	const object = topology.objects?.ne_110m_admin_0_countries;
	if (object?.type) return object;
	throw new Error('No ne_110m_admin_0_countries object found in static/geo/world.topojson.');
}

function normalizeFeatureResult(result) {
	if (result.type === 'FeatureCollection') return result.features;
	if (result.type === 'Feature') return [result];
	return [];
}

function pickedProperties(properties) {
	return {
		NAME: properties.NAME ?? null,
		NAME_LONG: properties.NAME_LONG ?? null,
		ADMIN: properties.ADMIN ?? null,
		ISO_A3: properties.ISO_A3 ?? null,
		ADM0_A3: properties.ADM0_A3 ?? null,
		SOV_A3: properties.SOV_A3 ?? null
	};
}

function diagnosticRow(featureIndex, properties, match) {
	return {
		feature_index: featureIndex,
		...pickedProperties(properties),
		matched_registry_id: match?.record?.id ?? null,
		matched_display_name: match?.record?.display_name ?? null,
		match_reason: match?.reason ?? null,
		match_field: match?.field ?? null,
		match_value: match?.value ?? null,
		ambiguous_candidates: match?.ambiguousCandidates?.map((record) => record.id) ?? []
	};
}

const topology = readJson(paths.worldTopology);
const registry = readJson(paths.registry);
const indexes = buildRegistryIndexes(registry);
const geoFeatures = normalizeFeatureResult(feature(topology, getTopologyObject(topology)));
const errors = [];
const rowsToPrint = [];
const printedIndexes = new Set();

for (const [featureIndex, geoFeature] of geoFeatures.entries()) {
	const properties = geoFeature.properties ?? {};
	const match = findRegistryMatchForNaturalEarthFeature(properties, indexes);
	const isoA3 = normalizeCode(properties.ISO_A3);
	const adm0A3 = normalizeCode(properties.ADM0_A3);
	const sovA3 = normalizeCode(properties.SOV_A3);

	if (isoA3 && match?.record && match.record.id !== isoA3) {
		errors.push(
			`feature ${featureIndex} ${properties.NAME ?? ''}: valid ISO_A3=${isoA3} matched ${match.record.id}.`
		);
	}

	if (adm0A3 && match?.record && match.record.id !== adm0A3) {
		const curatedRegistryId = curatedAdm0Aliases.get(adm0A3);
		if (curatedRegistryId !== match.record.id) {
			errors.push(
				`feature ${featureIndex} ${properties.NAME ?? ''}: valid ADM0_A3=${adm0A3} matched ${match.record.id} without an explicit curated alias.`
			);
		}
	}

	if ((isoA3 || adm0A3) && match?.reason === 'sov_a3') {
		errors.push(
			`feature ${featureIndex} ${properties.NAME ?? ''}: SOV_A3=${sovA3} was used despite direct ISO_A3/ADM0_A3 availability.`
		);
	}

	if (match?.value === '-99') {
		errors.push(`feature ${featureIndex} ${properties.NAME ?? ''}: -99 was treated as a match value.`);
	}

	for (const [id, expectedName] of [...requiredMatches, ...optionalMatches]) {
		if (isoA3 === id || adm0A3 === id) {
			rowsToPrint.push(diagnosticRow(featureIndex, properties, match));
			printedIndexes.add(featureIndex);
			if (!match?.record) {
				if (requiredMatches.has(id)) {
					errors.push(`feature ${featureIndex} ${expectedName}: expected ${id}, but no registry record matched.`);
				}
				continue;
			}
			if (match.record.id !== id) {
				errors.push(
					`feature ${featureIndex} ${expectedName}: expected ${id}, matched ${match.record.id}.`
				);
			}
		}
	}
}

for (const [id, expectedName] of requiredMatches) {
	if (!rowsToPrint.some((row) => row.ISO_A3 === id || row.ADM0_A3 === id)) {
		errors.push(`${expectedName}: no Natural Earth feature with ISO_A3/ADM0_A3=${id} was found.`);
	}
}

for (const [id, expectedName] of optionalMatches) {
	const found = geoFeatures.some((geoFeature) => {
		const properties = geoFeature.properties ?? {};
		return normalizeCode(properties.ISO_A3) === id || normalizeCode(properties.ADM0_A3) === id;
	});

	if (found && !rowsToPrint.some((row) => row.ISO_A3 === id || row.ADM0_A3 === id)) {
		errors.push(`${expectedName}: Natural Earth feature is present but was not printed.`);
	}
}

for (const [featureIndex, geoFeature] of geoFeatures.entries()) {
	if (printedIndexes.has(featureIndex)) continue;
	const properties = geoFeature.properties ?? {};
	const match = findRegistryMatchForNaturalEarthFeature(properties, indexes);
	if (match?.reason === 'ambiguous') {
		rowsToPrint.push(diagnosticRow(featureIndex, properties, match));
	}
}

console.log('Feature registry matching diagnostics:');
for (const row of rowsToPrint.sort((a, b) => a.feature_index - b.feature_index)) {
	console.log(JSON.stringify(row));
}

if (errors.length > 0) {
	console.error('\nFeature registry matching validation failed:');
	for (const error of errors) console.error(`- ${error}`);
	process.exit(1);
}

console.log(`Feature registry matching validation passed for ${geoFeatures.length} Natural Earth features.`);
