import type { MapUnit, MapUnitId } from '$lib/types';

type RecordWithOptionalId = Partial<MapUnit> & { id?: unknown };

function isRecordObject(value: unknown): value is Record<string, unknown> {
	return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function recordsFromUnknownWorldSystemData(input: unknown): RecordWithOptionalId[] {
	if (Array.isArray(input)) {
		return input.filter(isRecordObject);
	}

	if (!isRecordObject(input)) {
		return [];
	}

	if (Array.isArray(input.map_units)) {
		return input.map_units.filter(isRecordObject);
	}

	if (Array.isArray(input.records)) {
		return input.records.filter(isRecordObject);
	}

	return Object.entries(input)
		.filter(([key, value]) => key !== 'meta' && isRecordObject(value))
		.map(([id, value]) => Object.assign({ id }, value));
}

export function normalizeWorldSystemDemoData(input: unknown): Map<MapUnitId, MapUnit> {
	const recordsById = new Map<MapUnitId, MapUnit>();

	for (const record of recordsFromUnknownWorldSystemData(input)) {
		if (typeof record.id !== 'string' || record.id.trim().length === 0) {
			continue;
		}

		recordsById.set(record.id, record as MapUnit);
	}

	return recordsById;
}
