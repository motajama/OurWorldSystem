<script lang="ts">
	import { base, resolve } from '$app/paths';
	import { onMount } from 'svelte';
	import CountryPanel from '$lib/components/CountryPanel.svelte';
	import Legend from '$lib/components/Legend.svelte';
	import WorldMap from '$lib/components/WorldMap.svelte';
	import type { DataEnvelope, MapUnit } from '$lib/types';

	let units = $state<MapUnit[]>([]);
	let selectedId = $state<string | null>(null);
	let loading = $state(true);
	let error = $state<string | null>(null);

	const selectedUnit = $derived(units.find((unit) => unit.id === selectedId) ?? units[0] ?? null);

	function selectUnit(unit: MapUnit) {
		selectedId = unit.id;
	}

	onMount(async () => {
		try {
			const response = await fetch(`${base}/data/world-system.latest.json`);

			if (!response.ok) {
				throw new Error(`Failed to load mock data: ${response.status}`);
			}

			const data = (await response.json()) as DataEnvelope;
			units = data.map_units;
			selectedId = data.map_units[0]?.id ?? null;
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

			{#if loading}
				<div class="state-message">Loading static mock data...</div>
			{:else if error}
				<div class="state-message error">{error}</div>
			{:else}
				<WorldMap {units} selectedId={selectedUnit?.id ?? null} onSelect={selectUnit} />
			{/if}
		</div>

		<div class="side-column">
			<CountryPanel unit={selectedUnit} />
			<Legend />
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
		grid-template-rows: auto 1fr;
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
