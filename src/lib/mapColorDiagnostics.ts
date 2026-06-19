import { getMapUnitFillClass, getMapUnitLayerValue } from '$lib/mapLayers';
import type {
	GeoFeatureProperties,
	MapLayerId,
	MapUnit,
	MapUnitId,
	MapUnitRegistryRecord
} from '$lib/types';

type DrawablePath = {
	id: string;
	name: string;
	unit: MapUnit;
	hasIndicatorRecord: boolean;
	registryRecord: MapUnitRegistryRecord | null;
	properties?: GeoFeatureProperties;
};

export type MapColorDiagnosticExample = {
	id: string;
	name: string;
	reason?: string;
	value?: string;
	fillClass: string;
};

export type MapColorDiagnostics = {
	selectedLayer: MapLayerId;
	totalPaths: number;
	pathsWithRegistryMatch: number;
	pathsWithWorldSystemDemoData: number;
	pathsWithWorldBankQualityData: number;
	classDistribution: Record<string, number>;
	noDataExamples: MapColorDiagnosticExample[];
	coloredExamples: MapColorDiagnosticExample[];
};

function hasWorldSystemDemoData(path: DrawablePath) {
	return path.unit.world_system?.class !== 'no_data';
}

function hasWorldBankQualityData(path: DrawablePath) {
	const qualityOfLife = path.unit.quality_of_life;

	return Boolean(
		qualityOfLife?.source === 'World Bank WDI' ||
			typeof qualityOfLife?.quality_of_life_score === 'number' ||
			path.unit.sources.includes('world_bank_wdi')
	);
}

function getNoDataReason(path: DrawablePath, selectedLayer: MapLayerId) {
	if (!path.registryRecord) return 'no registry match';
	if (!path.hasIndicatorRecord) return 'registry matched but no merged map-unit record';

	switch (selectedLayer) {
		case 'world_system':
			return 'no world-system model output';
		case 'conflict':
			return 'missing conflict flags';
		case 'press_freedom':
			return 'missing press freedom score';
		case 'political_freedom':
			return 'missing political freedom score';
		case 'quality_of_life':
			return 'missing numeric HDI or World Bank quality-of-life score';
		case 'exploitation':
			return 'missing extraction risk';
		case 'ecology':
			return 'missing EPI score';
	}
}

export function getMapColorDiagnostics(
	drawablePaths: DrawablePath[],
	selectedLayer: MapLayerId
): MapColorDiagnostics {
	const classDistribution: Record<string, number> = {};
	const noDataExamples: MapColorDiagnosticExample[] = [];
	const coloredExamples: MapColorDiagnosticExample[] = [];
	const worldSystemDemoIds = new Set<MapUnitId>();
	const worldBankQualityIds = new Set<MapUnitId>();

	for (const path of drawablePaths) {
		const value = getMapUnitLayerValue(path.unit, selectedLayer);
		const fillClass = getMapUnitFillClass(path.unit, selectedLayer);

		classDistribution[fillClass] = (classDistribution[fillClass] ?? 0) + 1;

		if (hasWorldSystemDemoData(path)) {
			worldSystemDemoIds.add(path.unit.id);
		}

		if (hasWorldBankQualityData(path)) {
			worldBankQualityIds.add(path.unit.id);
		}

		if (value === 'no_data' && noDataExamples.length < 8) {
			noDataExamples.push({
				id: path.unit.id || path.id,
				name: path.unit.name || path.name,
				reason: getNoDataReason(path, selectedLayer),
				fillClass
			});
		} else if (value !== 'no_data' && coloredExamples.length < 8) {
			coloredExamples.push({
				id: path.unit.id || path.id,
				name: path.unit.name || path.name,
				value,
				fillClass
			});
		}
	}

	return {
		selectedLayer,
		totalPaths: drawablePaths.length,
		pathsWithRegistryMatch: drawablePaths.filter((path) => path.registryRecord).length,
		pathsWithWorldSystemDemoData: worldSystemDemoIds.size,
		pathsWithWorldBankQualityData: worldBankQualityIds.size,
		classDistribution,
		noDataExamples,
		coloredExamples
	};
}
