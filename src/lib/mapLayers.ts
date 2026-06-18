import type { MapLayerDefinition, MapLayerId, MapUnit } from '$lib/types';

export type MapLayerValue =
	| 'core'
	| 'semi-periphery'
	| 'periphery'
	| 'uncertain'
	| 'disputed'
	| 'active_war_on_territory'
	| 'involved_in_war'
	| 'no_active_war'
	| 'good'
	| 'satisfactory'
	| 'problematic'
	| 'difficult'
	| 'very_serious'
	| 'free'
	| 'partly_free'
	| 'not_free'
	| 'very_high'
	| 'high'
	| 'medium'
	| 'low'
	| 'high_extraction_risk'
	| 'medium_extraction_risk'
	| 'low_extraction_risk'
	| 'strong'
	| 'mixed'
	| 'weak'
	| 'severe'
	| 'no_data';

export type MapLayerLegendItem = {
	value: MapLayerValue;
	label: string;
	description: string;
	color: string;
	fillClass: string;
};

export const DEFAULT_MAP_LAYER_ID: MapLayerId = 'world_system';

export const MAP_LAYERS: MapLayerDefinition[] = [
	{
		id: 'world_system',
		label: 'World-system position',
		shortLabel: 'Position',
		description: 'Overall mock world-system classification with uncertainty and disputed-status output.',
		kind: 'categorical',
		noDataLabel: 'No model output'
	},
	{
		id: 'conflict',
		label: 'War and conflict',
		shortLabel: 'Conflict',
		description: 'Demo conflict layer separating war on territory, conflict involvement, and no active war.',
		kind: 'categorical',
		noDataLabel: 'No conflict data'
	},
	{
		id: 'press_freedom',
		label: 'Press freedom',
		shortLabel: 'Press',
		description: 'Demo score bins for press freedom. Current values are mock placeholders only.',
		kind: 'sequential',
		noDataLabel: 'No press freedom data'
	},
	{
		id: 'political_freedom',
		label: 'Political freedom',
		shortLabel: 'Political',
		description: 'Demo score bins for political freedom. Current values are mock placeholders only.',
		kind: 'sequential',
		noDataLabel: 'No political freedom data'
	},
	{
		id: 'quality_of_life',
		label: 'Quality of life',
		shortLabel: 'Life',
		description: 'Demo HDI bins for quality of life. Current values are mock placeholders only.',
		kind: 'sequential',
		noDataLabel: 'No quality-of-life data'
	},
	{
		id: 'exploitation',
		label: 'Extraction / externalization',
		shortLabel: 'Extraction',
		description:
			'Demo extraction-risk layer using explicit mock risk fields when present; otherwise no data.',
		kind: 'categorical',
		noDataLabel: 'No extraction data'
	},
	{
		id: 'ecology',
		label: 'Ecology',
		shortLabel: 'Ecology',
		description: 'Demo environmental-performance bins. Current values are mock placeholders only.',
		kind: 'sequential',
		noDataLabel: 'No ecology data'
	}
];

const LAYER_DEFINITIONS = new Map(MAP_LAYERS.map((layer) => [layer.id, layer]));

const LEGEND_ITEMS: Record<MapLayerId, Omit<MapLayerLegendItem, 'fillClass'>[]> = {
	world_system: [
		{
			value: 'core',
			label: 'Core',
			description: 'High structural advantage in the mock model',
			color: '#5eead4'
		},
		{
			value: 'semi-periphery',
			label: 'Semi-periphery',
			description: 'Mixed structural position in the mock model',
			color: '#facc15'
		},
		{
			value: 'periphery',
			label: 'Periphery',
			description: 'Lower structural advantage in the mock model',
			color: '#fb923c'
		},
		{
			value: 'uncertain',
			label: 'Uncertain',
			description: 'Insufficient confidence for a settled class',
			color: '#a78bfa'
		},
		{
			value: 'disputed',
			label: 'Disputed',
			description: 'Displayed neutrally as a map unit',
			color: '#f87171'
		},
		{
			value: 'no_data',
			label: 'No data',
			description: 'No current model output',
			color: '#64748b'
		}
	],
	conflict: [
		{
			value: 'active_war_on_territory',
			label: 'Active war on territory',
			description: 'Mock unit flagged with active war on its territory',
			color: '#7f1d1d'
		},
		{
			value: 'involved_in_war',
			label: 'Involved in war',
			description: 'Mock unit involved in conflict without war on its territory',
			color: '#ea580c'
		},
		{
			value: 'no_active_war',
			label: 'No active war',
			description: 'Mock unit has both conflict flags set to false',
			color: '#94a3b8'
		},
		{
			value: 'no_data',
			label: 'No data',
			description: 'Conflict flags are missing',
			color: '#64748b'
		}
	],
	press_freedom: [
		{ value: 'good', label: 'Good', description: 'Score 85 or higher', color: '#2dd4bf' },
		{
			value: 'satisfactory',
			label: 'Satisfactory',
			description: 'Score 70 to below 85',
			color: '#84cc16'
		},
		{
			value: 'problematic',
			label: 'Problematic',
			description: 'Score 55 to below 70',
			color: '#facc15'
		},
		{
			value: 'difficult',
			label: 'Difficult',
			description: 'Score 40 to below 55',
			color: '#f97316'
		},
		{
			value: 'very_serious',
			label: 'Very serious',
			description: 'Score below 40',
			color: '#be123c'
		},
		{ value: 'no_data', label: 'No data', description: 'No numeric score', color: '#64748b' }
	],
	political_freedom: [
		{ value: 'free', label: 'Free', description: 'Score 80 or higher', color: '#38bdf8' },
		{
			value: 'partly_free',
			label: 'Partly free',
			description: 'Score 40 to below 80',
			color: '#facc15'
		},
		{ value: 'not_free', label: 'Not free', description: 'Score below 40', color: '#c026d3' },
		{ value: 'no_data', label: 'No data', description: 'No numeric score', color: '#64748b' }
	],
	quality_of_life: [
		{ value: 'very_high', label: 'Very high', description: 'HDI 0.8 or higher', color: '#06b6d4' },
		{ value: 'high', label: 'High', description: 'HDI 0.7 to below 0.8', color: '#22c55e' },
		{ value: 'medium', label: 'Medium', description: 'HDI 0.55 to below 0.7', color: '#f59e0b' },
		{ value: 'low', label: 'Low', description: 'HDI below 0.55', color: '#dc2626' },
		{ value: 'no_data', label: 'No data', description: 'No HDI value', color: '#64748b' }
	],
	exploitation: [
		{
			value: 'high_extraction_risk',
			label: 'High extraction risk',
			description: 'Explicit mock risk is high',
			color: '#9a3412'
		},
		{
			value: 'medium_extraction_risk',
			label: 'Medium extraction risk',
			description: 'Explicit mock risk is medium',
			color: '#ca8a04'
		},
		{
			value: 'low_extraction_risk',
			label: 'Low extraction risk',
			description: 'Explicit mock risk is low',
			color: '#0f766e'
		},
		{
			value: 'no_data',
			label: 'No data',
			description: 'No explicit extraction-risk field',
			color: '#64748b'
		}
	],
	ecology: [
		{ value: 'strong', label: 'Strong', description: 'EPI score 70 or higher', color: '#14b8a6' },
		{ value: 'mixed', label: 'Mixed', description: 'EPI score 50 to below 70', color: '#a3e635' },
		{ value: 'weak', label: 'Weak', description: 'EPI score 30 to below 50', color: '#f97316' },
		{ value: 'severe', label: 'Severe', description: 'EPI score below 30', color: '#b91c1c' },
		{ value: 'no_data', label: 'No data', description: 'No EPI score', color: '#64748b' }
	]
};

function isNumeric(value: unknown): value is number {
	return typeof value === 'number' && Number.isFinite(value);
}

function normalizeRisk(value: string | number | null | undefined): MapLayerValue | null {
	if (typeof value === 'number') {
		if (value >= 0.67) return 'high_extraction_risk';
		if (value >= 0.34) return 'medium_extraction_risk';
		if (value >= 0) return 'low_extraction_risk';
		return null;
	}

	const normalized = value?.trim().toLowerCase().replaceAll('-', '_').replaceAll(' ', '_');

	if (!normalized) return null;
	if (['high', 'high_risk', 'high_extraction_risk'].includes(normalized)) {
		return 'high_extraction_risk';
	}
	if (['medium', 'moderate', 'medium_risk', 'medium_extraction_risk'].includes(normalized)) {
		return 'medium_extraction_risk';
	}
	if (['low', 'low_risk', 'low_extraction_risk'].includes(normalized)) {
		return 'low_extraction_risk';
	}

	return null;
}

function toFillClass(layerId: MapLayerId, value: MapLayerValue) {
	const layerClass = layerId.replaceAll('_', '-');
	const valueClass = value.replaceAll('_', '-');

	return `layer-${layerClass}-${valueClass}`;
}

export function getMapLayerDefinition(id: MapLayerId): MapLayerDefinition {
	return LAYER_DEFINITIONS.get(id) ?? LAYER_DEFINITIONS.get(DEFAULT_MAP_LAYER_ID)!;
}

export function getMapUnitLayerValue(mapUnit: MapUnit | null, layerId: MapLayerId): MapLayerValue {
	if (!mapUnit) {
		return 'no_data';
	}

	switch (layerId) {
		case 'world_system':
			return mapUnit.world_system?.class ?? 'no_data';
		case 'conflict': {
			const conflict = mapUnit.conflict;

			if (
				!conflict ||
				conflict.war_on_territory === null ||
				conflict.war_on_territory === undefined ||
				conflict.involved_in_conflict === null ||
				conflict.involved_in_conflict === undefined
			) {
				return 'no_data';
			}

			if (conflict.war_on_territory) return 'active_war_on_territory';
			if (conflict.involved_in_conflict) return 'involved_in_war';
			return 'no_active_war';
		}
		case 'press_freedom': {
			const score = mapUnit.press_freedom?.score;

			if (!isNumeric(score)) return 'no_data';
			if (score >= 85) return 'good';
			if (score >= 70) return 'satisfactory';
			if (score >= 55) return 'problematic';
			if (score >= 40) return 'difficult';
			return 'very_serious';
		}
		case 'political_freedom': {
			const score = mapUnit.political_freedom?.score;

			if (!isNumeric(score)) return 'no_data';
			if (score >= 80) return 'free';
			if (score >= 40) return 'partly_free';
			return 'not_free';
		}
		case 'quality_of_life': {
			const hdi = mapUnit.quality_of_life?.hdi;

			if (!isNumeric(hdi)) return 'no_data';
			if (hdi >= 0.8) return 'very_high';
			if (hdi >= 0.7) return 'high';
			if (hdi >= 0.55) return 'medium';
			return 'low';
		}
		case 'exploitation': {
			const risk =
				normalizeRisk(mapUnit.exploitation_position?.extraction_risk) ??
				normalizeRisk(mapUnit.exploitation_position?.ewaste_import_risk);

			return risk ?? 'no_data';
		}
		case 'ecology': {
			const score = mapUnit.ecology?.epi_score;

			if (!isNumeric(score)) return 'no_data';
			if (score >= 70) return 'strong';
			if (score >= 50) return 'mixed';
			if (score >= 30) return 'weak';
			return 'severe';
		}
	}
}

export function getMapUnitFillClass(mapUnit: MapUnit | null, layerId: MapLayerId): string {
	return toFillClass(layerId, getMapUnitLayerValue(mapUnit, layerId));
}

export function getMapLayerLegendItems(layerId: MapLayerId): MapLayerLegendItem[] {
	return LEGEND_ITEMS[layerId].map((item) => ({
		...item,
		fillClass: toFillClass(layerId, item.value)
	}));
}
