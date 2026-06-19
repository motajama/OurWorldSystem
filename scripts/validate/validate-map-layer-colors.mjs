import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { geoEqualEarth, geoPath } from 'd3';
import { feature } from 'topojson-client';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');

const paths = {
	worldTopology: path.join(repoRoot, 'static/geo/world.topojson'),
	registry: path.join(repoRoot, 'static/data/map-units.registry.json'),
	worldSystem: path.join(repoRoot, 'static/data/world-system.latest.json'),
	worldBankQuality: path.join(
		repoRoot,
		'static/data/indicators/quality-of-life.world-bank.latest.json'
	),
	worldMap: path.join(repoRoot, 'src/lib/components/WorldMap.svelte')
};

const invalidNaturalEarthCodes = new Set(['', '-99']);
const layerValues = {
	world_system: ['core', 'semi-periphery', 'periphery', 'uncertain', 'disputed', 'no_data'],
	conflict: ['active_war_on_territory', 'involved_in_war', 'no_active_war', 'no_data'],
	press_freedom: ['good', 'satisfactory', 'problematic', 'difficult', 'very_serious', 'no_data'],
	political_freedom: ['free', 'partly_free', 'not_free', 'no_data'],
	quality_of_life: ['very_high', 'high', 'medium', 'low', 'no_data'],
	exploitation: [
		'high_extraction_risk',
		'medium_extraction_risk',
		'low_extraction_risk',
		'no_data'
	],
	ecology: ['strong', 'mixed', 'weak', 'severe', 'no_data']
};

function readJson(filePath) {
	return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function readJsonIfPresent(filePath) {
	if (!fs.existsSync(filePath)) return null;
	return readJson(filePath);
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

function isNumeric(value) {
	return typeof value === 'number' && Number.isFinite(value);
}

function toFillClass(layerId, value) {
	return `layer-${layerId.replaceAll('_', '-')}-${value.replaceAll('_', '-')}`;
}

function buildRegistryIndexes(registry) {
	const byNaturalEarthCode = new Map();
	const byNameAlias = new Map();

	for (const record of registry) {
		for (const code of [
			...(record.natural_earth?.iso_a3 ?? []),
			...(record.natural_earth?.adm0_a3 ?? []),
			...(record.natural_earth?.sov_a3 ?? [])
		]) {
			const normalizedCode = normalizeCode(code);
			if (normalizedCode) byNaturalEarthCode.set(normalizedCode, record);
		}

		for (const alias of [
			record.display_name,
			record.short_name,
			...(record.natural_earth?.name_aliases ?? [])
		]) {
			const normalizedAlias = normalizeName(alias);
			if (normalizedAlias) byNameAlias.set(normalizedAlias, record);
		}
	}

	return { byNaturalEarthCode, byNameAlias };
}

function findRegistryRecordForNaturalEarthFeature(properties, indexes) {
	for (const key of ['ISO_A3', 'ADM0_A3', 'SOV_A3']) {
		const record = indexes.byNaturalEarthCode.get(normalizeCode(properties?.[key]));
		if (record) return record;
	}

	for (const key of ['ADMIN', 'NAME_LONG', 'NAME']) {
		const record = indexes.byNameAlias.get(normalizeName(properties?.[key]));
		if (record) return record;
	}

	return null;
}

function getTopologyObject(topology) {
	const object = topology.objects?.ne_110m_admin_0_countries;
	if (object?.type) return object;
	throw new Error('No ne_110m_admin_0_countries object found in static/geo/world.topojson.');
}

function normalizeWorldSystemDemoData(input) {
	const records = Array.isArray(input?.map_units) ? input.map_units : [];
	return new Map(
		records
			.filter((record) => record && typeof record === 'object' && typeof record.id === 'string')
			.map((record) => [record.id, record])
	);
}

function createRegistryNoDataUnit(record) {
	return {
		id: record.id,
		name: record.display_name,
		map_unit_type: record.map_unit_type,
		recognition_status: record.recognition_status,
		sovereignty_note: record.sovereignty_note,
		world_system: { class: 'no_data', score: null, confidence: 'low', explanation: '' },
		conflict: { war_on_territory: null, involved_in_conflict: null, active_conflicts: [], notes: '' },
		press_freedom: { source: 'No data', score: null, category: null, year: 2026 },
		political_freedom: { source: 'No data', score: null, category: null, year: 2026 },
		quality_of_life: {
			hdi: null,
			ihdi: null,
			life_expectancy: null,
			education_index: null,
			quality_of_life_score: null,
			source: null
		},
		ecology: {
			epi_score: null,
			material_footprint_per_capita: null,
			co2_per_capita: null,
			ewaste_generated_kg_per_capita: null
		},
		exploitation_position: {
			resource_export_dependency: null,
			foreign_value_added_share: null,
			domestic_value_capture: null,
			ewaste_import_risk: null,
			notes: null
		},
		sources: ['map_unit_registry', 'natural_earth'],
		last_updated: record.last_reviewed
	};
}

function mergeUnits(registry, worldSystemDemoById, worldBankQualityData) {
	const worldBankQualityById = new Map(
		(worldBankQualityData?.records ?? []).map((record) => [record.id, record])
	);

	return new Map(
		registry.map((record) => {
			const demoUnit = worldSystemDemoById.get(record.id);
			const unit = demoUnit
				? {
						...demoUnit,
						name: record.display_name,
						map_unit_type: record.map_unit_type,
						recognition_status: record.recognition_status,
						sovereignty_note: record.sovereignty_note,
						sources: [...new Set(['map_unit_registry', ...(demoUnit.sources ?? [])])]
					}
				: createRegistryNoDataUnit(record);
			const worldBankRecord = worldBankQualityById.get(record.id);

			if (!worldBankRecord) return [record.id, unit];

			return [
				record.id,
				{
					...unit,
					quality_of_life: {
						...unit.quality_of_life,
						life_expectancy: worldBankRecord.values.life_expectancy
							? { ...worldBankRecord.values.life_expectancy, source: 'World Bank WDI' }
							: unit.quality_of_life.life_expectancy,
						gni_per_capita_ppp: worldBankRecord.values.gni_per_capita_ppp
							? { ...worldBankRecord.values.gni_per_capita_ppp, source: 'World Bank WDI' }
							: null,
						secondary_enrollment_gross: worldBankRecord.values.secondary_enrollment_gross
							? {
									...worldBankRecord.values.secondary_enrollment_gross,
									source: 'World Bank WDI'
								}
							: null,
						population: worldBankRecord.values.population
							? { ...worldBankRecord.values.population, source: 'World Bank WDI' }
							: null,
						quality_of_life_score: worldBankRecord.quality_of_life_score,
						source: 'World Bank WDI'
					},
					sources: [...new Set([...(unit.sources ?? []), ...worldBankRecord.sources])]
				}
			];
		})
	);
}

function getQualityOfLifeMapScore(mapUnit) {
	const hdi = mapUnit.quality_of_life?.hdi;
	if (isNumeric(hdi)) return hdi;

	const score =
		mapUnit.quality_of_life?.quality_of_life_score ?? mapUnit.quality_of_life_score ?? null;
	return isNumeric(score) ? score : null;
}

function normalizeRisk(value) {
	if (typeof value === 'number') {
		if (value >= 0.67) return 'high_extraction_risk';
		if (value >= 0.34) return 'medium_extraction_risk';
		if (value >= 0) return 'low_extraction_risk';
		return null;
	}

	const normalized = value?.trim?.().toLowerCase().replaceAll('-', '_').replaceAll(' ', '_');
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

function getMapUnitLayerValue(mapUnit, layerId) {
	if (!mapUnit) return 'no_data';

	switch (layerId) {
		case 'world_system':
			return mapUnit.world_system?.class ?? 'no_data';
		case 'conflict':
			if (mapUnit.conflict?.war_on_territory) return 'active_war_on_territory';
			if (mapUnit.conflict?.involved_in_conflict) return 'involved_in_war';
			if (
				mapUnit.conflict?.war_on_territory === false &&
				mapUnit.conflict?.involved_in_conflict === false
			) {
				return 'no_active_war';
			}
			return 'no_data';
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
		case 'exploitation':
			return (
				normalizeRisk(mapUnit.exploitation_position?.extraction_risk) ??
				normalizeRisk(mapUnit.exploitation_position?.ewaste_import_risk) ??
				'no_data'
			);
		case 'ecology': {
			const score = mapUnit.ecology?.epi_score;
			if (!isNumeric(score)) return 'no_data';
			if (score >= 70) return 'strong';
			if (score >= 50) return 'mixed';
			if (score >= 30) return 'weak';
			return 'severe';
		}
		default:
			return 'no_data';
	}
}

function cssDefinedClasses() {
	const css = fs.readFileSync(paths.worldMap, 'utf8');
	return new Set([...css.matchAll(/\.map-unit\.([a-z0-9-]+)/g)].map((match) => match[1]));
}

function recordName(featureProperties, registryRecord) {
	return (
		registryRecord?.display_name ??
		featureProperties.NAME_LONG ??
		featureProperties.NAME ??
		featureProperties.ADMIN ??
		'Unnamed map unit'
	);
}

const topology = readJson(paths.worldTopology);
const registry = readJson(paths.registry);
const worldSystem = readJson(paths.worldSystem);
const worldBankQuality = readJsonIfPresent(paths.worldBankQuality);
const worldSystemDemoById = normalizeWorldSystemDemoData(worldSystem);
const unitsById = mergeUnits(registry, worldSystemDemoById, worldBankQuality);
const registryIndexes = buildRegistryIndexes(registry);
const geoFeatures = feature(topology, getTopologyObject(topology)).features;
const projection = geoEqualEarth().fitExtent(
	[
		[12, 12],
		[1000 - 12, 520 - 12]
	],
	{ type: 'FeatureCollection', features: geoFeatures }
);
const pathGenerator = geoPath(projection);
const cssClasses = cssDefinedClasses();
const drawable = geoFeatures
	.map((geoFeature) => {
		const drawablePath = pathGenerator(geoFeature);
		if (!drawablePath) return null;

		const registryRecord = findRegistryRecordForNaturalEarthFeature(
			geoFeature.properties ?? {},
			registryIndexes
		);

		return {
			properties: geoFeature.properties ?? {},
			registryRecord,
			unit: registryRecord ? unitsById.get(registryRecord.id) : null
		};
	})
	.filter(Boolean);

let failed = false;
const expectedDrawableCount = Math.ceil(geoFeatures.length * 0.95);

if (drawable.length < expectedDrawableCount) {
	console.error(
		`Map color validation failed: ${drawable.length} drawable paths is below 95% of ${geoFeatures.length} Natural Earth features.`
	);
	failed = true;
}

for (const [layerId, values] of Object.entries(layerValues)) {
	const expectedClasses = values.map((value) => toFillClass(layerId, value));
	const distribution = Object.fromEntries(expectedClasses.map((className) => [className, 0]));
	const noDataExamples = [];
	let registryMatches = 0;

	for (const pathRecord of drawable) {
		if (pathRecord.registryRecord) registryMatches += 1;

		const value = getMapUnitLayerValue(pathRecord.unit, layerId);
		const className = toFillClass(layerId, value);
		distribution[className] = (distribution[className] ?? 0) + 1;

		if (value === 'no_data' && noDataExamples.length < 6) {
			noDataExamples.push({
				id: pathRecord.registryRecord?.id ?? pathRecord.properties.ADM0_A3 ?? 'unmatched',
				name: recordName(pathRecord.properties, pathRecord.registryRecord)
			});
		}
	}

	const noDataCount = distribution[toFillClass(layerId, 'no_data')] ?? 0;
	const missingCssClasses = Object.keys(distribution).filter((className) => !cssClasses.has(className));

	console.log(`\nLayer: ${layerId}`);
	console.log(`Natural Earth features: ${geoFeatures.length}`);
	console.log(`drawable paths: ${drawable.length}`);
	console.log(`matched registry count: ${registryMatches}`);
	console.log(`colored count by class: ${JSON.stringify(distribution, null, 2)}`);
	console.log(`no_data count: ${noDataCount}`);
	console.log(`no_data examples: ${JSON.stringify(noDataExamples)}`);

	if (missingCssClasses.length > 0) {
		console.error(`Missing CSS definitions: ${missingCssClasses.join(', ')}`);
		failed = true;
	}

	if (
		layerId === 'quality_of_life' &&
		(worldBankQuality?.records?.length ?? 0) > 0 &&
		noDataCount / drawable.length > 0.4
	) {
		console.error(
			`Quality-of-life no_data ratio ${(noDataCount / drawable.length).toFixed(3)} exceeds 40% despite World Bank data.`
		);
		failed = true;
	}
}

const expectedLegendClasses = Object.entries(layerValues).flatMap(([layerId, values]) =>
	values.map((value) => toFillClass(layerId, value))
);
const unproducibleCssClasses = [...cssClasses].filter((className) =>
	expectedLegendClasses.includes(className)
		? false
		: className.startsWith('layer-') && !expectedLegendClasses.includes(className)
);

if (unproducibleCssClasses.length > 0) {
	console.error(`CSS layer classes that cannot be produced: ${unproducibleCssClasses.join(', ')}`);
	failed = true;
}

if (failed) {
	process.exit(1);
}
