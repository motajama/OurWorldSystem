import type { GeoFeatureProperties, MapUnitRegistryRecord } from '$lib/types';

export type RegistryIndexes = {
	byId: Map<string, MapUnitRegistryRecord>;
	byExternalIso3: Map<string, MapUnitRegistryRecord[]>;
	byNaturalEarthIsoA3: Map<string, MapUnitRegistryRecord[]>;
	byNaturalEarthAdm0A3: Map<string, MapUnitRegistryRecord[]>;
	byNaturalEarthSovA3: Map<string, MapUnitRegistryRecord[]>;
	byNameAlias: Map<string, MapUnitRegistryRecord[]>;
};

export type RegistryMatchReason =
	| 'iso_a3'
	| 'adm0_a3'
	| 'name_alias'
	| 'sov_a3'
	| 'ambiguous';

export type RegistryMatch = {
	record: MapUnitRegistryRecord | null;
	reason: RegistryMatchReason;
	field: string;
	value: string;
	ambiguousCandidates: MapUnitRegistryRecord[];
};

const invalidNaturalEarthCodes = new Set(['', '-99']);

function normalizeCode(value: unknown): string | null {
	if (typeof value !== 'string') {
		return null;
	}

	const normalized = value.trim().toUpperCase();

	return invalidNaturalEarthCodes.has(normalized) ? null : normalized;
}

function normalizeName(value: unknown): string | null {
	if (typeof value !== 'string') {
		return null;
	}

	const normalized = value.trim().toLocaleLowerCase();

	return normalized.length > 0 ? normalized : null;
}

export async function loadMapUnitRegistry(basePath = ''): Promise<MapUnitRegistryRecord[]> {
	const response = await fetch(`${basePath}/data/map-units.registry.json`);

	if (!response.ok) {
		throw new Error(`Failed to load map-unit registry: ${response.status}`);
	}

	return (await response.json()) as MapUnitRegistryRecord[];
}

export function buildRegistryIndexes(registry: MapUnitRegistryRecord[]): RegistryIndexes {
	const byId = new Map<string, MapUnitRegistryRecord>();
	const byExternalIso3 = new Map<string, MapUnitRegistryRecord[]>();
	const byNaturalEarthIsoA3 = new Map<string, MapUnitRegistryRecord[]>();
	const byNaturalEarthAdm0A3 = new Map<string, MapUnitRegistryRecord[]>();
	const byNaturalEarthSovA3 = new Map<string, MapUnitRegistryRecord[]>();
	const byNameAlias = new Map<string, MapUnitRegistryRecord[]>();

	function addCandidate(index: Map<string, MapUnitRegistryRecord[]>, key: string, record: MapUnitRegistryRecord) {
		const candidates = index.get(key) ?? [];

		if (!candidates.some((candidate) => candidate.id === record.id)) {
			candidates.push(record);
			index.set(key, candidates);
		}
	}

	for (const record of registry) {
		const id = normalizeCode(record.id);

		if (id) {
			byId.set(id, record);
		}

		const externalIso3 = normalizeCode(record.external_ids.iso3);

		if (externalIso3) {
			addCandidate(byExternalIso3, externalIso3, record);
		}

		for (const code of record.natural_earth.iso_a3) {
			const normalizedCode = normalizeCode(code);

			if (normalizedCode) addCandidate(byNaturalEarthIsoA3, normalizedCode, record);
		}

		for (const code of record.natural_earth.adm0_a3) {
			const normalizedCode = normalizeCode(code);

			if (normalizedCode) addCandidate(byNaturalEarthAdm0A3, normalizedCode, record);
		}

		for (const code of record.natural_earth.sov_a3) {
			const normalizedCode = normalizeCode(code);

			if (normalizedCode) addCandidate(byNaturalEarthSovA3, normalizedCode, record);
		}

		for (const alias of [
			record.display_name,
			record.short_name,
			...record.natural_earth.name_aliases
		]) {
			const normalizedAlias = normalizeName(alias);

			if (normalizedAlias) {
				addCandidate(byNameAlias, normalizedAlias, record);
			}
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

function uniqueCandidates(candidates: MapUnitRegistryRecord[]): MapUnitRegistryRecord[] {
	const seen = new Set<string>();
	const unique: MapUnitRegistryRecord[] = [];

	for (const candidate of candidates) {
		if (!seen.has(candidate.id)) {
			seen.add(candidate.id);
			unique.push(candidate);
		}
	}

	return unique;
}

function resolveCandidate(
	candidates: MapUnitRegistryRecord[],
	reason: RegistryMatchReason,
	field: string,
	value: string
): RegistryMatch | null {
	const unique = uniqueCandidates(candidates);

	if (unique.length === 0) {
		return null;
	}

	if (unique.length === 1) {
		return {
			record: unique[0],
			reason,
			field,
			value,
			ambiguousCandidates: []
		};
	}

	return {
		record: null,
		reason: 'ambiguous',
		field,
		value,
		ambiguousCandidates: unique
	};
}

function directIdCandidate(indexes: RegistryIndexes, code: string): MapUnitRegistryRecord[] {
	const record = indexes.byId.get(code);
	return record ? [record] : [];
}

function findCodeMatch(
	code: string,
	field: 'ISO_A3' | 'ADM0_A3',
	reason: 'iso_a3' | 'adm0_a3',
	indexes: RegistryIndexes
): RegistryMatch | null {
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

		if (match) {
			return match;
		}
	}

	return null;
}

export function findRegistryMatchForNaturalEarthFeature(
	properties: GeoFeatureProperties,
	indexes: RegistryIndexes
): RegistryMatch | null {
	const isoA3 = normalizeCode(properties.ISO_A3);

	if (isoA3) {
		const match = findCodeMatch(isoA3, 'ISO_A3', 'iso_a3', indexes);

		if (match) {
			return match;
		}
	}

	const adm0A3 = normalizeCode(properties.ADM0_A3);

	if (adm0A3) {
		const match = findCodeMatch(adm0A3, 'ADM0_A3', 'adm0_a3', indexes);

		if (match) {
			return match;
		}
	}

	for (const key of ['ADMIN', 'NAME_LONG', 'NAME'] as const) {
		const name = normalizeName(properties[key]);

		if (!name) {
			continue;
		}

		const match = resolveCandidate(indexes.byNameAlias.get(name) ?? [], 'name_alias', key, name);

		if (match) {
			return match;
		}
	}

	const sovA3 = normalizeCode(properties.SOV_A3);

	if (sovA3 && !isoA3 && !adm0A3) {
		const match = resolveCandidate(
			indexes.byNaturalEarthSovA3.get(sovA3) ?? [],
			'sov_a3',
			'SOV_A3',
			sovA3
		);

		if (match) {
			return match;
		}
	}

	return null;
}

export function findRegistryRecordForNaturalEarthFeature(
	properties: GeoFeatureProperties,
	indexes: RegistryIndexes
): MapUnitRegistryRecord | null {
	return findRegistryMatchForNaturalEarthFeature(properties, indexes)?.record ?? null;
}
