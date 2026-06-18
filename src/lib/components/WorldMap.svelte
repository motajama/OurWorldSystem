<script lang="ts">
	import { base } from '$app/paths';
	import { onMount } from 'svelte';
	import { geoNaturalEarth1, geoPath } from 'd3';
	import { feature } from 'topojson-client';
	import type { MapUnit, WorldSystemClass } from '$lib/types';

	type Props = {
		units: MapUnit[];
		selectedId: string | null;
		onSelect: (unit: MapUnit) => void;
	};

	type TopologyObject = {
		type: string;
		objects?: Record<string, unknown>;
	};

	let { units, selectedId, onSelect }: Props = $props();
	let topojsonAvailable = $state(false);
	let geometryStatus = $state('Checking for local TopoJSON geometry.');
	let outlinePath = $state<string | null>(null);

	const classColors: Record<WorldSystemClass, string> = {
		core: '#5eead4',
		'semi-periphery': '#facc15',
		periphery: '#fb923c',
		uncertain: '#a78bfa',
		no_data: '#64748b',
		disputed: '#f87171'
	};

	const fallbackPositions: Record<string, { x: number; y: number }> = {
		USA: { x: 17, y: 38 },
		BRA: { x: 32, y: 66 },
		DEU: { x: 51, y: 33 },
		CZE: { x: 53, y: 36 },
		UKR: { x: 58, y: 38 },
		ZAF: { x: 56, y: 77 },
		COD: { x: 55, y: 61 },
		PSE: { x: 60, y: 44 },
		IND: { x: 70, y: 51 },
		CHN: { x: 77, y: 41 },
		TWN: { x: 83, y: 48 },
		XKO: { x: 55, y: 40 }
	};

	const positionedUnits = $derived(
		units.map((unit) => {
			const fallback = fallbackPositions[unit.id] ?? { x: 50, y: 50 };

			return {
				...unit,
				x: fallback.x,
				y: fallback.y
			};
		})
	);

	onMount(async () => {
		try {
			const response = await fetch(`${base}/geo/world.topojson`);

			if (!response.ok) {
				geometryStatus = 'No local TopoJSON found. Showing the temporary clickable grid.';
				return;
			}

			const topology = (await response.json()) as TopologyObject;
			const objectName = Object.keys(topology.objects ?? {})[0];

			if (!objectName || !topology.objects) {
				geometryStatus = 'Local TopoJSON has no drawable object. Showing the temporary grid.';
				return;
			}

			const collection = feature(
				topology as Parameters<typeof feature>[0],
				topology.objects[objectName] as Parameters<typeof feature>[1]
			);
			const projection = geoNaturalEarth1().fitSize([1000, 520], collection);
			const path = geoPath(projection)(collection);

			outlinePath = path;
			topojsonAvailable = Boolean(path);
			geometryStatus = 'Local TopoJSON loaded. Mock map units remain clickable overlay points.';
		} catch {
			geometryStatus = 'No local TopoJSON found. Showing the temporary clickable grid.';
		}
	});
</script>

<section class="map-shell" aria-labelledby="map-title">
	<div class="map-heading">
		<div>
			<p>Static atlas preview</p>
			<h2 id="map-title">World-system map units</h2>
		</div>
		<span>{units.length} mock units</span>
	</div>

	<div class="map-frame">
		<svg viewBox="0 0 1000 520" role="img" aria-describedby="map-description">
			<title>Temporary OurWorldSystem world map scaffold</title>
			<desc id="map-description">
				A temporary map-like grid with clickable mock map units until local TopoJSON geometry is
				added.
			</desc>
			<defs>
				<pattern id="grid" width="80" height="80" patternUnits="userSpaceOnUse">
					<path d="M 80 0 L 0 0 0 80" fill="none" stroke="rgba(148, 163, 184, 0.16)" />
				</pattern>
			</defs>
			<rect width="1000" height="520" fill="#07111f" />
			<rect width="1000" height="520" fill="url(#grid)" />
			<ellipse cx="500" cy="265" rx="455" ry="205" fill="rgba(15, 23, 42, 0.9)" />
			<path
				d="M120 210 C190 150 280 150 340 205 C395 258 310 295 220 275 C160 262 85 254 120 210Z"
				fill="#122033"
				stroke="#334155"
			/>
			<path
				d="M420 170 C535 108 735 135 840 225 C910 285 830 375 690 350 C548 324 365 262 420 170Z"
				fill="#122033"
				stroke="#334155"
			/>
			<path
				d="M410 330 C480 290 605 318 640 392 C665 448 575 468 500 430 C432 396 355 365 410 330Z"
				fill="#122033"
				stroke="#334155"
			/>

			{#if topojsonAvailable && outlinePath}
				<path class="topo-outline" d={outlinePath} />
			{/if}

			{#each positionedUnits as unit (unit.id)}
				{@const selected = selectedId === unit.id}
				<g transform={`translate(${unit.x * 10} ${unit.y * 5.2})`}>
					<button
						class:selected
						aria-label={`Select ${unit.name}`}
						onclick={() => onSelect(unit)}
						style={`--unit-color: ${classColors[unit.world_system.class]}`}
					>
						<circle r={selected ? 18 : 14}></circle>
						<text y="4">{unit.id}</text>
					</button>
				</g>
			{/each}
		</svg>
	</div>

	<p class="status">{geometryStatus}</p>
</section>

<style>
	.map-shell {
		display: grid;
		min-height: 100%;
		grid-template-rows: auto 1fr auto;
		gap: 1rem;
		padding: clamp(1rem, 2vw, 1.6rem);
	}

	.map-heading {
		display: flex;
		justify-content: space-between;
		gap: 1rem;
		align-items: end;
	}

	.map-heading p {
		margin: 0 0 0.35rem;
		color: #93c5fd;
		font-size: 0.78rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	h2 {
		margin: 0;
		color: #f8fafc;
		font-size: clamp(1.8rem, 4vw, 3.4rem);
		line-height: 1;
		letter-spacing: 0;
	}

	.map-heading span {
		border: 1px solid rgba(148, 163, 184, 0.3);
		padding: 0.42rem 0.6rem;
		color: #cbd5e1;
		font-size: 0.82rem;
		white-space: nowrap;
	}

	.map-frame {
		min-height: min(58vh, 44rem);
		border: 1px solid rgba(148, 163, 184, 0.22);
		background: #020617;
	}

	svg {
		display: block;
		width: 100%;
		height: 100%;
		min-height: min(58vh, 44rem);
	}

	.topo-outline {
		fill: rgba(30, 41, 59, 0.9);
		stroke: rgba(203, 213, 225, 0.38);
		stroke-width: 0.8;
	}

	button {
		cursor: pointer;
	}

	circle {
		fill: var(--unit-color);
		stroke: rgba(255, 255, 255, 0.9);
		stroke-width: 2;
		transition:
			r 140ms ease,
			filter 140ms ease;
	}

	text {
		fill: #020617;
		font-size: 0.76rem;
		font-weight: 900;
		text-anchor: middle;
		pointer-events: none;
	}

	button:hover circle,
	button:focus-visible circle,
	button.selected circle {
		filter: drop-shadow(0 0 10px rgba(226, 232, 240, 0.75));
	}

	button:focus-visible {
		outline: 3px solid #bfdbfe;
		outline-offset: 4px;
	}

	.status {
		margin: 0;
		color: #94a3b8;
		font-size: 0.88rem;
		line-height: 1.45;
	}

	@media (max-width: 700px) {
		.map-heading {
			align-items: start;
			flex-direction: column;
		}
	}
</style>
