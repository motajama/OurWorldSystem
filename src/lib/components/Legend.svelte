<script lang="ts">
	import { getMapLayerDefinition, getMapLayerLegendItems } from '$lib/mapLayers';
	import type { MapLayerId } from '$lib/types';

	type Props = {
		selectedLayer: MapLayerId;
	};

	let { selectedLayer }: Props = $props();
	const layer = $derived(getMapLayerDefinition(selectedLayer));
	const items = $derived(getMapLayerLegendItems(selectedLayer));
</script>

<section class="legend" aria-labelledby="legend-title">
	<h2 id="legend-title">{layer.label}</h2>
	<p class="subtitle">{layer.description}</p>
	<ul>
		{#each items as item (item.value)}
			<li>
				<span class="swatch" style={`--swatch-color: ${item.color}`}></span>
				<span>
					<strong>{item.label}</strong>
					<small>{item.description}</small>
				</span>
			</li>
		{/each}
	</ul>
</section>

<style>
	.legend {
		border-top: 1px solid rgba(148, 163, 184, 0.22);
		padding-top: 1rem;
	}

	h2 {
		margin: 0 0 0.35rem;
		color: #f8fafc;
		font-size: 0.95rem;
		letter-spacing: 0;
	}

	.subtitle {
		margin: 0 0 0.85rem;
		color: #94a3b8;
		font-size: 0.76rem;
		line-height: 1.35;
	}

	ul {
		display: grid;
		gap: 0.7rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	li {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 0.65rem;
		align-items: start;
		color: #cbd5e1;
	}

	.swatch {
		width: 0.9rem;
		height: 0.9rem;
		margin-top: 0.18rem;
		border: 1px solid rgba(255, 255, 255, 0.45);
		background: var(--swatch-color);
	}

	strong {
		display: block;
		color: #e2e8f0;
		font-size: 0.86rem;
		line-height: 1.2;
	}

	small {
		display: block;
		margin-top: 0.15rem;
		color: #94a3b8;
		font-size: 0.76rem;
		line-height: 1.35;
	}
</style>
