<script lang="ts">
	import { base, resolve } from '$app/paths';
	import { onMount } from 'svelte';
	import CountryPanel from '$lib/components/CountryPanel.svelte';
	import LayerSelector from '$lib/components/LayerSelector.svelte';
	import Legend from '$lib/components/Legend.svelte';
	import WorldMap from '$lib/components/WorldMap.svelte';
	import { normalizeWorldSystemDemoData } from '$lib/dataNormalization';
	import { DEFAULT_MAP_LAYER_ID } from '$lib/mapLayers';
	import { loadMapUnitRegistry } from '$lib/mapUnitRegistry';
	import type {
		DataEnvelope,
		MapLayerId,
		MapUnit,
		MapUnitRegistryRecord,
		ProvisionalWorldSystemDataset,
		UcdpConflictDataset,
		WorldBankExtractionDataset,
		WorldBankQualityOfLifeDataset
	} from '$lib/types';

	type OptionalIndicatorIndexEntry = {
		id: string;
		path: string;
		required: boolean;
		available?: boolean;
		source_ids: string[];
		description: string;
	};

	const fallbackOptionalIndicators: OptionalIndicatorIndexEntry[] = [
		{
			id: 'quality_of_life_world_bank_latest',
			path: '/data/indicators/quality-of-life.world-bank.latest.json',
			required: false,
			available: true,
			source_ids: ['world_bank_wdi'],
			description: 'Optional World Bank WDI quality-of-life indicators.'
		},
		{
			id: 'world_system_provisional_latest',
			path: '/data/indicators/world-system.provisional.latest.json',
			required: false,
			available: true,
			source_ids: ['world_bank_wdi', 'mock_demo_data'],
			description:
				'Optional provisional world-system proxy derived from World Bank quality-of-life indicators while preserving demo world-system classes.'
		},
		{
			id: 'conflict_ucdp_latest',
			path: '/data/indicators/conflict.ucdp.latest.json',
			required: false,
			available: false,
			source_ids: ['ucdp_country_year', 'ucdp_prio_armed_conflict'],
			description: 'Optional UCDP conflict indicators.'
		},
		{
			id: 'extraction_dependency_world_bank_latest',
			path: '/data/indicators/extraction-dependency.world-bank.latest.json',
			required: false,
			available: true,
			source_ids: ['world_bank_wdi_extraction'],
			description: 'Optional World Bank WDI extraction dependency and autonomy component.'
		}
	];

	let units = $state<MapUnit[]>([]);
	let registry = $state<MapUnitRegistryRecord[]>([]);
	let worldSystemDemoById = $state<Map<string, MapUnit>>(new Map());
	let worldBankQualityById = $state<Map<string, WorldBankQualityOfLifeDataset['records'][number]>>(
		new Map()
	);
	let selectedId = $state<string | null>(null);
	let selectedUnit = $state<MapUnit | null>(null);
	let selectedLayer = $state<MapLayerId>(DEFAULT_MAP_LAYER_ID);
	let loading = $state(true);
	let error = $state<string | null>(null);

	function selectUnit(unit: MapUnit) {
		selectedId = unit.id;
		selectedUnit = unit;
	}

	function selectLayer(layerId: MapLayerId) {
		selectedLayer = layerId;
	}

	function staticUrl(path: string) {
		return `${base}${path.startsWith('/') ? path : `/${path}`}`;
	}

	function createRegistryNoDataUnit(record: MapUnitRegistryRecord): MapUnit {
		return {
			id: record.id,
			name: record.display_name,
			map_unit_type: record.map_unit_type,
			recognition_status: record.recognition_status,
			sovereignty_note: record.sovereignty_note,
			world_system: {
				class: 'no_data',
				score: null,
				confidence: 'low',
				explanation: 'Registry map unit exists, but no world-system model output is available yet.'
			},
			conflict: {
				war_on_territory: null,
				involved_in_conflict: null,
				active_conflicts: [],
				fatalities_best_estimate: null,
				child_casualties_verified: null,
				latest_year: null,
				source: null,
				notes: 'No conflict indicator record is available yet.'
			},
			press_freedom: {
				source: 'No data',
				score: null,
				category: null,
				year: 2026
			},
			political_freedom: {
				source: 'No data',
				score: null,
				category: null,
				year: 2026
			},
			quality_of_life: {
				hdi: null,
				ihdi: null,
				life_expectancy: null,
				education_index: null,
				gni_per_capita_ppp: null,
				secondary_enrollment_gross: null,
				population: null,
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

	function applyRegistryMetadata(unit: MapUnit, record: MapUnitRegistryRecord): MapUnit {
		return {
			...unit,
			name: record.display_name,
			map_unit_type: record.map_unit_type,
			recognition_status: record.recognition_status,
			sovereignty_note: record.sovereignty_note,
			sources: [...new Set(['map_unit_registry', ...unit.sources])]
		};
	}

	function mergeRegistryAndWorldSystemDemo(
		registry: MapUnitRegistryRecord[],
		worldSystemDemoData: Map<string, MapUnit>
	) {
		const registryById = new Map(registry.map((record) => [record.id, record]));
		const registryUnits = registry.map((record) => {
			const demoUnit = worldSystemDemoData.get(record.id);

			return demoUnit ? applyRegistryMetadata(demoUnit, record) : createRegistryNoDataUnit(record);
		});
		const demoUnitsWithoutRegistryRecord = [...worldSystemDemoData.values()].filter(
			(unit) => !registryById.has(unit.id)
		);

		return [...registryUnits, ...demoUnitsWithoutRegistryRecord];
	}

	async function loadOptionalIndicatorIndex() {
		try {
			const response = await fetch(`${base}/data/indicators/index.json`);

			if (!response.ok) return fallbackOptionalIndicators;

			const index = (await response.json()) as OptionalIndicatorIndexEntry[];
			if (!Array.isArray(index)) return fallbackOptionalIndicators;

			return index;
		} catch {
			return fallbackOptionalIndicators;
		}
	}

	function optionalIndicatorPath(index: OptionalIndicatorIndexEntry[], id: string) {
		const fallback = fallbackOptionalIndicators.find((indicator) => indicator.id === id);
		const indexed = index.find((indicator) => indicator.id === id);

		if (indexed?.available === false) return null;
		if (!indexed && fallback?.available === false) return null;

		return indexed?.path ?? fallback?.path ?? null;
	}

	async function loadOptionalWorldBankQualityOfLife(index: OptionalIndicatorIndexEntry[]) {
		const path = optionalIndicatorPath(index, 'quality_of_life_world_bank_latest');
		if (!path) return null;

		const response = await fetch(staticUrl(path));

		if (!response.ok) {
			if (response.status === 404) return null;
			throw new Error(`Failed to load World Bank quality-of-life data: ${response.status}`);
		}

		return (await response.json()) as WorldBankQualityOfLifeDataset;
	}

	async function loadOptionalProvisionalWorldSystem(index: OptionalIndicatorIndexEntry[]) {
		const path = optionalIndicatorPath(index, 'world_system_provisional_latest');
		if (!path) return null;

		const response = await fetch(staticUrl(path));

		if (!response.ok) {
			if (response.status === 404) return null;
			throw new Error(`Failed to load provisional world-system data: ${response.status}`);
		}

		return (await response.json()) as ProvisionalWorldSystemDataset;
	}

	async function loadOptionalUcdpConflicts(index: OptionalIndicatorIndexEntry[]) {
		const path = optionalIndicatorPath(index, 'conflict_ucdp_latest');
		if (!path) return null;

		const response = await fetch(staticUrl(path));

		if (!response.ok) {
			if (response.status === 404) return null;
			throw new Error(`Failed to load UCDP conflict data: ${response.status}`);
		}

		return (await response.json()) as UcdpConflictDataset;
	}

	async function loadOptionalWorldBankExtraction(index: OptionalIndicatorIndexEntry[]) {
		const path = optionalIndicatorPath(index, 'extraction_dependency_world_bank_latest');
		if (!path) return null;

		const response = await fetch(staticUrl(path));

		if (!response.ok) {
			if (response.status === 404) return null;
			throw new Error(`Failed to load World Bank extraction data: ${response.status}`);
		}

		return (await response.json()) as WorldBankExtractionDataset;
	}

	function mergeProvisionalWorldSystem(
		mapUnits: MapUnit[],
		provisionalData: ProvisionalWorldSystemDataset | null
	) {
		if (!provisionalData) return mapUnits;

		const recordsById = new Map(provisionalData.records.map((record) => [record.id, record]));

		return mapUnits.map((unit) => {
			const record = recordsById.get(unit.id);

			if (!record) return unit;

			return {
				...unit,
				world_system: {
					class: record.world_system.class,
					score: record.world_system.score,
					confidence: record.world_system.confidence,
					source: record.world_system.source,
					model_status: provisionalData.model_status,
					explanation: record.world_system.explanation
				},
				sources: [...new Set([...unit.sources, ...provisionalData.source_ids])]
			};
		});
	}

	function mergeWorldBankQualityOfLife(
		mapUnits: MapUnit[],
		worldBankData: WorldBankQualityOfLifeDataset | null
	) {
		if (!worldBankData) return mapUnits;

		const recordsById = new Map(worldBankData.records.map((record) => [record.id, record]));

		return mapUnits.map((unit) => {
			const record = recordsById.get(unit.id);

			if (!record) return unit;

			return {
				...unit,
				quality_of_life: {
					...unit.quality_of_life,
					life_expectancy: record.values.life_expectancy
						? { ...record.values.life_expectancy, source: 'World Bank WDI' }
						: unit.quality_of_life.life_expectancy,
					gni_per_capita_ppp: record.values.gni_per_capita_ppp
						? { ...record.values.gni_per_capita_ppp, source: 'World Bank WDI' }
						: null,
					secondary_enrollment_gross: record.values.secondary_enrollment_gross
						? { ...record.values.secondary_enrollment_gross, source: 'World Bank WDI' }
						: null,
					population: record.values.population
						? { ...record.values.population, source: 'World Bank WDI' }
						: null,
					quality_of_life_score: record.quality_of_life_score,
					source: 'World Bank WDI'
				},
				sources: [...new Set([...unit.sources, ...record.sources])]
			};
		});
	}

	function mergeUcdpConflicts(mapUnits: MapUnit[], ucdpData: UcdpConflictDataset | null) {
		if (!ucdpData) return mapUnits;

		const recordsById = new Map(ucdpData.records.map((record) => [record.id, record]));

		return mapUnits.map((unit) => {
			const record = recordsById.get(unit.id);

			if (!record) {
				const mockOnly = unit.sources.includes('mock') || unit.sources.includes('mock_demo_data');

				return {
					...unit,
					conflict: mockOnly
						? {
								...unit.conflict,
								notes: `${unit.conflict.notes} Demo conflict values only; no UCDP record matched this map unit.`
							}
						: {
								war_on_territory: null,
								involved_in_conflict: null,
								active_conflicts: [],
								fatalities_best_estimate: null,
								child_casualties_verified: null,
								latest_year: null,
								source: null,
								notes: 'No UCDP conflict record matched this map unit.'
							}
				};
			}

			return {
				...unit,
				conflict: {
					war_on_territory: record.conflict_summary.war_on_territory,
					involved_in_conflict: record.conflict_summary.involved_in_conflict,
					active_conflicts: record.conflict_summary.active_conflicts,
					fatalities_best_estimate: record.conflict_summary.fatalities_best_estimate,
					child_casualties_verified: null,
					latest_year: Math.max(
						record.territory?.latest_year ?? 0,
						record.state_involvement.latest_year ?? 0
					),
					source: 'UCDP',
					notes: record.conflict_summary.notes
				},
				sources: [
					...new Set([...unit.sources.filter((source) => source !== 'mock'), ...record.sources])
				]
			};
		});
	}

	function mergeWorldBankExtraction(
		mapUnits: MapUnit[],
		extractionData: WorldBankExtractionDataset | null
	) {
		if (!extractionData) return mapUnits;

		const recordsById = new Map(extractionData.records.map((record) => [record.id, record]));

		return mapUnits.map((unit) => {
			const record = recordsById.get(unit.id);
			if (!record) return unit;

			return {
				...unit,
				exploitation_position: {
					...unit.exploitation_position,
					extraction_risk: record.extraction_dependency_score,
					extraction_dependency_score: record.extraction_dependency_score,
					extraction_autonomy_score: record.extraction_autonomy_score,
					extraction_values: record.values,
					extraction_latest_year: record.latest_year,
					extraction_data_quality: record.data_quality,
					extraction_source_country_code: record.source_country_code,
					notes: 'World Bank WDI extraction dependency/autonomy component. This is not a final world-system class.'
				},
				sources: [...new Set([...unit.sources, ...record.sources])]
			};
		});
	}

	onMount(async () => {
		try {
			const [response, loadedRegistry, indicatorIndex] = await Promise.all([
				fetch(`${base}/data/world-system.latest.json`),
				loadMapUnitRegistry(base),
				loadOptionalIndicatorIndex()
			]);
			const [worldBankData, provisionalWorldSystemData, ucdpData, extractionData] =
				await Promise.all([
				loadOptionalWorldBankQualityOfLife(indicatorIndex),
				loadOptionalProvisionalWorldSystem(indicatorIndex),
				loadOptionalUcdpConflicts(indicatorIndex),
				loadOptionalWorldBankExtraction(indicatorIndex)
			]);

			if (!response.ok) {
				throw new Error(`Failed to load mock data: ${response.status}`);
			}

			const data = (await response.json()) as DataEnvelope;
			const normalizedWorldSystemDemoData = normalizeWorldSystemDemoData(data);
			const normalizedWorldBankQualityData = new Map(
				(worldBankData?.records ?? []).map((record) => [record.id, record])
			);
			const registryBackedUnits = mergeRegistryAndWorldSystemDemo(
				loadedRegistry,
				normalizedWorldSystemDemoData
			);
			const mergedUnits = mergeUcdpConflicts(
				mergeWorldBankExtraction(
					mergeWorldBankQualityOfLife(
						mergeProvisionalWorldSystem(registryBackedUnits, provisionalWorldSystemData),
						worldBankData
					),
					extractionData
				),
				ucdpData
			);
			registry = loadedRegistry;
			worldSystemDemoById = normalizedWorldSystemDemoData;
			worldBankQualityById = normalizedWorldBankQualityData;
			units = mergedUnits;
			selectedId = mergedUnits[0]?.id ?? null;
			selectedUnit = mergedUnits[0] ?? null;
		} catch (loadError) {
			error = loadError instanceof Error ? loadError.message : 'Failed to load mock data.';
		} finally {
			loading = false;
		}
	});
</script>

<svelte:head>
	<title>OurWorldSystem</title>
</svelte:head>

<main class="app-shell">
	<section class="atlas">
		<div class="map-column">
			<header>
				<a href={resolve('/methodology/')}>Methodology</a>
				<a href="https://github.com/" rel="noreferrer">Open-source project</a>
			</header>
			<LayerSelector {selectedLayer} onLayerChange={selectLayer} />

			{#if loading}
				<div class="state-message">Loading static map-unit data...</div>
			{:else if error}
				<div class="state-message error">{error}</div>
			{:else}
				<WorldMap
					{units}
					{registry}
					{worldSystemDemoById}
					{worldBankQualityById}
					{selectedId}
					{selectedLayer}
					onSelect={selectUnit}
				/>
			{/if}
		</div>

		<div class="side-column">
			<CountryPanel unit={selectedUnit} />
			<Legend {selectedLayer} />
		</div>
	</section>
</main>

<style>
	.app-shell {
		min-height: 100vh;
		padding: clamp(0.7rem, 1.4vw, 1.15rem);
	}

	.atlas {
		display: grid;
		min-height: calc(100vh - clamp(1.4rem, 2.8vw, 2.3rem));
		grid-template-columns: minmax(0, 1fr) minmax(21rem, 28rem);
		border: 1px solid rgba(148, 163, 184, 0.24);
		background: rgba(2, 6, 23, 0.82);
	}

	.map-column {
		display: grid;
		min-width: 0;
		grid-template-rows: auto auto 1fr;
	}

	header {
		display: flex;
		justify-content: flex-end;
		gap: 1rem;
		border-bottom: 1px solid rgba(148, 163, 184, 0.18);
		padding: 0.75rem clamp(1rem, 2vw, 1.6rem);
	}

	header a {
		color: #cbd5e1;
		font-size: 0.84rem;
		text-decoration: none;
	}

	header a:hover,
	header a:focus-visible {
		color: #f8fafc;
		text-decoration: underline;
	}

	.side-column {
		display: grid;
		grid-template-rows: minmax(0, 1fr) auto;
		background: rgba(8, 13, 24, 0.96);
	}

	.side-column :global(.legend) {
		padding: 1.1rem clamp(1.1rem, 2vw, 1.6rem) 1.25rem;
	}

	.state-message {
		display: grid;
		min-height: 50vh;
		place-items: center;
		color: #cbd5e1;
	}

	.error {
		color: #fecaca;
	}

	@media (max-width: 920px) {
		.app-shell {
			padding: 0;
		}

		.atlas {
			min-height: 100vh;
			grid-template-columns: 1fr;
			border: 0;
		}

		header {
			justify-content: flex-start;
			flex-wrap: wrap;
		}
	}
</style>
