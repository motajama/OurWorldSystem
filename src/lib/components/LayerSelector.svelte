<script lang="ts">
	import { MAP_LAYERS, getMapLayerDefinition } from '$lib/mapLayers';
	import type { MapLayerId } from '$lib/types';

	type Props = {
		selectedLayer: MapLayerId;
		onLayerChange: (layerId: MapLayerId) => void;
	};

	let { selectedLayer, onLayerChange }: Props = $props();
	const selectedDefinition = $derived(getMapLayerDefinition(selectedLayer));
</script>

<fieldset class="layer-selector" aria-describedby="map-layer-description">
	<legend>Map layer</legend>
	<div class="options">
		{#each MAP_LAYERS as layer (layer.id)}
			<label class:active={selectedLayer === layer.id}>
				<input
					type="radio"
					name="map-layer"
					value={layer.id}
					checked={selectedLayer === layer.id}
					onchange={() => onLayerChange(layer.id)}
				/>
				<span>{layer.label}</span>
			</label>
		{/each}
	</div>
	<p id="map-layer-description">{selectedDefinition.description}</p>
</fieldset>

<style>
	.layer-selector {
		display: grid;
		gap: 0.65rem;
		margin: 0;
		border: 0;
		border-bottom: 1px solid rgba(148, 163, 184, 0.18);
		padding: 0.85rem clamp(1rem, 2vw, 1.6rem);
		background: rgba(8, 13, 24, 0.78);
	}

	legend {
		float: left;
		width: 100%;
		margin: 0 0 0.55rem;
		padding: 0;
		color: #f8fafc;
		font-size: 0.86rem;
		font-weight: 800;
		letter-spacing: 0;
	}

	.options {
		display: flex;
		flex-wrap: wrap;
		gap: 0.45rem;
	}

	label {
		display: inline-flex;
		min-height: 2rem;
		align-items: center;
		gap: 0.45rem;
		border: 1px solid rgba(148, 163, 184, 0.32);
		padding: 0.35rem 0.55rem;
		color: #cbd5e1;
		font-size: 0.82rem;
		line-height: 1.2;
		cursor: pointer;
	}

	label:hover,
	label:focus-within {
		border-color: rgba(226, 232, 240, 0.82);
		color: #f8fafc;
	}

	label.active {
		border-color: #67e8f9;
		background: rgba(14, 116, 144, 0.28);
		color: #f8fafc;
	}

	input {
		accent-color: #67e8f9;
	}

	p {
		margin: 0;
		max-width: 62rem;
		color: #94a3b8;
		font-size: 0.82rem;
		line-height: 1.45;
	}

	@media (max-width: 560px) {
		.options {
			display: grid;
			grid-template-columns: 1fr;
		}

		label {
			justify-content: flex-start;
		}
	}
</style>
