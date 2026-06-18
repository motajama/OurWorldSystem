<script lang="ts" module>
	const DEBUG_MAP_LIFECYCLE = false;
	const MAP_DEBUG_PREFIX = '[OurWorldSystem:map-debug]';
	let pageInstanceCounter = 0;

	function mapDebug(instanceId: number, message: string, details?: unknown) {
		if (!DEBUG_MAP_LIFECYCLE) return;

		console.debug(MAP_DEBUG_PREFIX, new Date().toISOString(), `page#${instanceId}`, message, details);
	}
</script>

<script lang="ts">
	import { base, resolve } from '$app/paths';
	import { onMount } from 'svelte';
	import CountryPanel from '$lib/components/CountryPanel.svelte';
	import { fetchJson, fetchOptionalJson } from '$lib/dataLoading';
	import LayerSelector from '$lib/components/LayerSelector.svelte';
	import Legend from '$lib/components/Legend.svelte';
	import WorldMap from '$lib/components/WorldMap.svelte';
	import { DEFAULT_MAP_LAYER_ID } from '$lib/mapLayers';
	import type {
		DataEnvelope,
		MapLayerId,
		MapUnit,
		OptionalIndicatorIndex,
		UcdpConflictDataset,
		WorldBankQualityOfLifeDataset
	} from '$lib/types';

	const pageInstanceId = ++pageInstanceCounter;
	const optionalIndicatorFiles = {
		worldBankQualityOfLife: 'quality-of-life.world-bank.latest.json',
		ucdpConflicts: 'conflict.ucdp.latest.json'
	} as const;

	let units = $state<MapUnit[]>([]);
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
		mapDebug(pageInstanceId, 'selectedLayer changed', {
			from: selectedLayer,
			to: layerId
		});
		selectedLayer = layerId;
	}

	async function loadOptionalIndicatorIndex() {
		return fetchJson<OptionalIndicatorIndex>(`${base}/data/indicators/index.json`);
	}

	function isOptionalIndicatorAvailable(
		optionalIndicatorIndex: OptionalIndicatorIndex,
		fileName: string
	) {
		return optionalIndicatorIndex.optional_datasets.includes(fileName);
	}

	async function loadOptionalWorldBankQualityOfLife(optionalIndicatorIndex: OptionalIndicatorIndex) {
		const fileName = optionalIndicatorFiles.worldBankQualityOfLife;

		return fetchOptionalJson<WorldBankQualityOfLifeDataset>(
			`${base}/data/indicators/${fileName}`,
			{ available: isOptionalIndicatorAvailable(optionalIndicatorIndex, fileName) }
		);
	}

	async function loadOptionalUcdpConflicts(optionalIndicatorIndex: OptionalIndicatorIndex) {
		const fileName = optionalIndicatorFiles.ucdpConflicts;

		return fetchOptionalJson<UcdpConflictDataset>(`${base}/data/indicators/${fileName}`, {
			available: isOptionalIndicatorAvailable(optionalIndicatorIndex, fileName)
		});
	}

	function mergeWorldBankQualityOfLife(
		mapUnits: MapUnit[],
		worldBankData: WorldBankQualityOfLifeDataset | null
	) {
		if (!worldBankData) return mapUnits;

		mapDebug(pageInstanceId, 'indicator merge start', {
			indicator: 'world-bank-quality-of-life',
			unitCount: mapUnits.length,
			recordCount: worldBankData.records.length
		});

		const recordsById = new Map(worldBankData.records.map((record) => [record.id, record]));

		const mergedUnits = mapUnits.map((unit) => {
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

		mapDebug(pageInstanceId, 'indicator merge end', {
			indicator: 'world-bank-quality-of-life',
			unitCount: mergedUnits.length
		});

		return mergedUnits;
	}

	function mergeUcdpConflicts(mapUnits: MapUnit[], ucdpData: UcdpConflictDataset | null) {
		if (!ucdpData) return mapUnits;

		mapDebug(pageInstanceId, 'indicator merge start', {
			indicator: 'ucdp-conflicts',
			unitCount: mapUnits.length,
			recordCount: ucdpData.records.length
		});

		const recordsById = new Map(ucdpData.records.map((record) => [record.id, record]));

		const mergedUnits = mapUnits.map((unit) => {
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
				sources: [...new Set([...unit.sources.filter((source) => source !== 'mock'), ...record.sources])]
			};
		});

		mapDebug(pageInstanceId, 'indicator merge end', {
			indicator: 'ucdp-conflicts',
			unitCount: mergedUnits.length
		});

		return mergedUnits;
	}

	onMount(async () => {
		mapDebug(pageInstanceId, 'page mount');
		mapDebug(pageInstanceId, 'page data load start');

		try {
			const [data, optionalIndicatorIndex] = await Promise.all([
				fetchJson<DataEnvelope>(`${base}/data/world-system.latest.json`),
				loadOptionalIndicatorIndex()
			]);

			const [worldBankData, ucdpData] = await Promise.all([
				loadOptionalWorldBankQualityOfLife(optionalIndicatorIndex),
				loadOptionalUcdpConflicts(optionalIndicatorIndex)
			]);

			const mergedUnits = mergeUcdpConflicts(
				mergeWorldBankQualityOfLife(data.map_units, worldBankData),
				ucdpData
			);
			units = mergedUnits;
			mapDebug(pageInstanceId, 'map unit data assigned in parent', {
				unitCount: mergedUnits.length,
				firstId: mergedUnits[0]?.id ?? null
			});
			selectedId = mergedUnits[0]?.id ?? null;
			selectedUnit = mergedUnits[0] ?? null;
		} catch (loadError) {
			error = loadError instanceof Error ? loadError.message : 'Failed to load mock data.';
		} finally {
			loading = false;
			mapDebug(pageInstanceId, 'page data load end', {
				unitCount: units.length,
				error
			});
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
				<div class="state-message">Loading static mock data...</div>
			{:else if error}
				<div class="state-message error">{error}</div>
			{:else}
				<WorldMap {units} {selectedId} {selectedLayer} onSelect={selectUnit} />
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
