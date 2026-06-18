import type { GeoFeatureProperties, MapUnitRegistryRecord } from '$lib/types';

export type RegistryIndexes = {
	byId: Map<string, MapUnitRegistryRecord>;
	byNaturalEarthCode: Map<string, MapUnitRegistryRecord>;
	byNameAlias: Map<string, MapUnitRegistryRecord>;
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
	const byNaturalEarthCode = new Map<string, MapUnitRegistryRecord>();
	const byNameAlias = new Map<string, MapUnitRegistryRecord>();

	for (const record of registry) {
		byId.set(record.id, record);

		for (const code of [
			...record.natural_earth.iso_a3,
			...record.natural_earth.adm0_a3,
			...record.natural_earth.sov_a3
		]) {
			const normalizedCode = normalizeCode(code);

			if (normalizedCode) {
				byNaturalEarthCode.set(normalizedCode, record);
			}
		}

		for (const alias of [
			record.display_name,
			record.short_name,
			...record.natural_earth.name_aliases
		]) {
			const normalizedAlias = normalizeName(alias);

			if (normalizedAlias) {
				byNameAlias.set(normalizedAlias, record);
			}
		}
	}

	return { byId, byNaturalEarthCode, byNameAlias };
}

export function findRegistryRecordForNaturalEarthFeature(
	properties: GeoFeatureProperties,
	indexes: RegistryIndexes
): MapUnitRegistryRecord | null {
	for (const key of ['ISO_A3', 'ADM0_A3', 'SOV_A3'] as const) {
		const code = normalizeCode(properties[key]);

		if (!code) {
			continue;
		}

		const record = indexes.byNaturalEarthCode.get(code);

		if (record) {
			return record;
		}
	}

	for (const key of ['ADMIN', 'NAME_LONG', 'NAME'] as const) {
		const name = normalizeName(properties[key]);

		if (!name) {
			continue;
		}

		const record = indexes.byNameAlias.get(name);

		if (record) {
			return record;
		}
	}

	return null;
}
