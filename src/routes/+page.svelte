<script lang="ts">
	import { base, resolve } from '$app/paths';
	import { onMount } from 'svelte';
	import CountryPanel from '$lib/components/CountryPanel.svelte';
	import LayerSelector from '$lib/components/LayerSelector.svelte';
	import Legend from '$lib/components/Legend.svelte';
	import WorldMap from '$lib/components/WorldMap.svelte';
	import { DEFAULT_MAP_LAYER_ID } from '$lib/mapLayers';
	import type {
		DataEnvelope,
		MapLayerId,
		MapUnit,
		WorldBankQualityOfLifeDataset
	} from '$lib/types';

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
		selectedLayer = layerId;
	}

	async function loadOptionalWorldBankQualityOfLife() {
		const response = await fetch(`${base}/data/indicators/quality-of-life.world-bank.latest.json`);

		if (!response.ok) {
			if (response.status === 404) return null;
			throw new Error(`Failed to load World Bank quality-of-life data: ${response.status}`);
		}

		return (await response.json()) as WorldBankQualityOfLifeDataset;
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

	onMount(async () => {
		try {
			const [response, worldBankData] = await Promise.all([
				fetch(`${base}/data/world-system.latest.json`),
				loadOptionalWorldBankQualityOfLife()
			]);

			if (!response.ok) {
				throw new Error(`Failed to load mock data: ${response.status}`);
			}

			const data = (await response.json()) as DataEnvelope;
			const mergedUnits = mergeWorldBankQualityOfLife(data.map_units, worldBankData);
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
