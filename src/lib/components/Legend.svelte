<script lang="ts">
	import type { WorldSystemClass } from '$lib/types';

	type LegendItem = {
		key: WorldSystemClass;
		label: string;
		description: string;
		color: string;
	};

	const items: LegendItem[] = [
		{
			key: 'core',
			label: 'Core',
			description: 'High structural advantage in the mock model',
			color: '#5eead4'
		},
		{
			key: 'semi-periphery',
			label: 'Semi-periphery',
			description: 'Mixed structural position in the mock model',
			color: '#facc15'
		},
		{
			key: 'periphery',
			label: 'Periphery',
			description: 'Lower structural advantage in the mock model',
			color: '#fb923c'
		},
		{
			key: 'uncertain',
			label: 'Uncertain',
			description: 'Insufficient confidence for a settled class',
			color: '#a78bfa'
		},
		{
			key: 'no_data',
			label: 'No data',
			description: 'No current model output',
			color: '#64748b'
		},
		{
			key: 'disputed',
			label: 'Disputed',
			description: 'Displayed neutrally as a map unit',
			color: '#f87171'
		}
	];
</script>

<section class="legend" aria-labelledby="legend-title">
	<h2 id="legend-title">World-system class</h2>
	<ul>
		{#each items as item (item.key)}
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
		margin: 0 0 0.85rem;
		color: #f8fafc;
		font-size: 0.95rem;
		letter-spacing: 0;
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
