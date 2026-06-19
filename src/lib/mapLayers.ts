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
		description:
			'Provisional conservative proxy; structural model in progress.',
		kind: 'categorical',
		noDataLabel: 'No model output'
	},
	{
		id: 'conflict',
		label: 'War and conflict',
		shortLabel: 'Conflict',
		description:
			'UCDP-backed conflict layer separating organized violence on territory from state involvement in state-based armed conflict.',
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
		description:
			'Demo score bins for political freedom. Current values are mock placeholders only.',
		kind: 'sequential',
		noDataLabel: 'No political freedom data'
	},
	{
		id: 'quality_of_life',
		label: 'Quality of life',
		shortLabel: 'Life',
		description:
			'Quality-of-life bins using HDI when present, otherwise a temporary project score from World Bank WDI indicators.',
		kind: 'sequential',
		noDataLabel: 'No quality-of-life data'
	},
	{
		id: 'exploitation',
		label: 'Extraction dependency',
		shortLabel: 'Extraction',
		description:
			'Extraction dependency bins from World Bank WDI resource-rent and export-structure indicators when present, falling back to explicit demo risk fields.',
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
			description: 'Conservative provisional class with structural supports; needs review',
			color: '#5eead4'
		},
		{
			value: 'semi-periphery',
			label: 'Semi-periphery',
			description: 'Mixed or core-like but structurally unconfirmed position',
			color: '#facc15'
		},
		{
			value: 'periphery',
			label: 'Periphery',
			description: 'Lower welfare or extraction-dependency signal; needs review',
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
			label: 'Organized violence on territory',
			description: 'UCDP country-year record has organized violence within the map unit borders',
			color: '#7f1d1d'
		},
		{
			value: 'involved_in_war',
			label: 'State involved in conflict',
			description: 'UCDP/PRIO maps the state actor to an active state-based conflict',
			color: '#ea580c'
		},
		{
			value: 'no_active_war',
			label: 'No active UCDP flag',
			description: 'UCDP flags are explicitly false in the latest processed year',
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
		{
			value: 'very_high',
			label: 'Very high',
			description: 'HDI or project quality-of-life score 0.8 or higher',
			color: '#06b6d4'
		},
		{
			value: 'high',
			label: 'High',
			description: 'HDI or project quality-of-life score 0.7 to below 0.8',
			color: '#22c55e'
		},
		{
			value: 'medium',
			label: 'Medium',
			description: 'HDI or project quality-of-life score 0.55 to below 0.7',
			color: '#f59e0b'
		},
		{
			value: 'low',
			label: 'Low',
			description: 'HDI or project quality-of-life score below 0.55',
			color: '#dc2626'
		},
		{
			value: 'no_data',
			label: 'No data',
			description: 'No HDI or project quality-of-life score',
			color: '#64748b'
		}
	],
	exploitation: [
		{
			value: 'high_extraction_risk',
			label: 'High extraction risk',
			description: 'Extraction dependency score 65 or higher',
			color: '#9a3412'
		},
		{
			value: 'medium_extraction_risk',
			label: 'Medium extraction risk',
			description: 'Extraction dependency score 35 to below 65',
			color: '#ca8a04'
		},
		{
			value: 'low_extraction_risk',
			label: 'Low extraction risk',
			description: 'Extraction dependency score below 35',
			color: '#0f766e'
		},
		{
			value: 'no_data',
			label: 'No data',
			description: 'No extraction dependency score',
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

function getQualityOfLifeMapScore(mapUnit: MapUnit): number | null {
	const hdi = mapUnit.quality_of_life?.hdi;

	if (isNumeric(hdi)) return hdi;

	const score =
		mapUnit.quality_of_life?.quality_of_life_score ??
		(mapUnit as MapUnit & { quality_of_life_score?: number | null }).quality_of_life_score;

	return isNumeric(score) ? score : null;
}

function normalizeRisk(value: string | number | null | undefined): MapLayerValue | null {
	if (typeof value === 'number') {
		if (value > 1) {
			if (value >= 65) return 'high_extraction_risk';
			if (value >= 35) return 'medium_extraction_risk';
			if (value >= 0) return 'low_extraction_risk';
			return null;
		}
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

			if (!conflict) {
				return 'no_data';
			}

			if (conflict.war_on_territory) return 'active_war_on_territory';
			if (conflict.involved_in_conflict) return 'involved_in_war';
			if (conflict.war_on_territory === false && conflict.involved_in_conflict === false) {
				return 'no_active_war';
			}
			return 'no_data';
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
			const score = getQualityOfLifeMapScore(mapUnit);

			if (!isNumeric(score)) return 'no_data';
			if (score >= 0.8) return 'very_high';
			if (score >= 0.7) return 'high';
			if (score >= 0.55) return 'medium';
			return 'low';
		}
		case 'exploitation': {
			const risk =
				normalizeRisk(mapUnit.exploitation_position?.extraction_dependency_score) ??
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
