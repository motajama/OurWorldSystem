<script lang="ts">
	import SourceBadge from '$lib/components/SourceBadge.svelte';
	import type { MapUnit } from '$lib/types';

	type Props = {
		unit: MapUnit | null;
	};

	let { unit }: Props = $props();

	const formatBoolean = (value: boolean) => (value ? 'Yes' : 'No');
	const formatValue = (value: number | string | null) => (value === null ? 'No data' : value);
</script>

<aside class="panel" aria-labelledby="panel-title">
	{#if unit}
		<p class="eyebrow">{unit.id} · {unit.map_unit_type}</p>
		<h2 id="panel-title">{unit.name}</h2>

		{#if unit.sovereignty_note}
			<p class="note">{unit.sovereignty_note}</p>
		{/if}

		<section class="primary">
			<span class={`class-pill ${unit.world_system.class}`}>{unit.world_system.class}</span>
			<dl>
				<div>
					<dt>Score</dt>
					<dd>{formatValue(unit.world_system.score)}</dd>
				</div>
				<div>
					<dt>Confidence</dt>
					<dd>{unit.world_system.confidence}</dd>
				</div>
			</dl>
			<p>{unit.world_system.explanation}</p>
		</section>

		<section>
			<h3>Conflict</h3>
			<dl>
				<div>
					<dt>War on territory</dt>
					<dd>{formatBoolean(unit.conflict.war_on_territory)}</dd>
				</div>
				<div>
					<dt>Involved in conflict</dt>
					<dd>{formatBoolean(unit.conflict.involved_in_conflict)}</dd>
				</div>
				<div>
					<dt>Fatalities estimate</dt>
					<dd>{formatValue(unit.conflict.fatalities_best_estimate)}</dd>
				</div>
			</dl>
			<p class="muted">{unit.conflict.notes}</p>
		</section>

		<section>
			<h3>Indicators</h3>
			<dl>
				<div>
					<dt>Press freedom</dt>
					<dd>{unit.press_freedom.source}, {unit.press_freedom.year}</dd>
				</div>
				<div>
					<dt>Political freedom</dt>
					<dd>{unit.political_freedom.source}, {unit.political_freedom.year}</dd>
				</div>
				<div>
					<dt>HDI</dt>
					<dd>{formatValue(unit.quality_of_life.hdi)}</dd>
				</div>
				<div>
					<dt>CO2 per capita</dt>
					<dd>{formatValue(unit.ecology.co2_per_capita)}</dd>
				</div>
			</dl>
		</section>

		<section>
			<h3>Sources</h3>
			<div class="sources">
				{#each unit.sources as source (source)}
					<SourceBadge label={source} title={`Source reference: ${source}`} />
				{/each}
			</div>
			<p class="muted">Last updated {unit.last_updated}</p>
		</section>
	{:else}
		<p class="eyebrow">No selection</p>
		<h2 id="panel-title">Select a map unit</h2>
		<p class="empty">
			Choose a unit on the map to inspect model output, uncertainty, notes, and source references.
		</p>
	{/if}
</aside>

<style>
	.panel {
		min-height: 100%;
		border-left: 1px solid rgba(148, 163, 184, 0.22);
		padding: clamp(1.1rem, 2vw, 1.6rem);
		background: rgba(8, 13, 24, 0.96);
		color: #dbeafe;
		overflow: auto;
	}

	.eyebrow {
		margin: 0 0 0.45rem;
		color: #93c5fd;
		font-size: 0.76rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	h2 {
		margin: 0;
		color: #f8fafc;
		font-size: clamp(1.65rem, 4vw, 2.35rem);
		line-height: 1.05;
		letter-spacing: 0;
	}

	h3 {
		margin: 0 0 0.75rem;
		color: #f8fafc;
		font-size: 0.92rem;
		letter-spacing: 0;
	}

	section {
		margin-top: 1.3rem;
		border-top: 1px solid rgba(148, 163, 184, 0.18);
		padding-top: 1.1rem;
	}

	.primary {
		border-top: 0;
		padding-top: 0;
	}

	p {
		color: #cbd5e1;
		line-height: 1.55;
	}

	.note {
		border-left: 3px solid #f87171;
		padding-left: 0.8rem;
		color: #fecaca;
	}

	.empty {
		max-width: 32rem;
	}

	.muted {
		margin-bottom: 0;
		color: #94a3b8;
		font-size: 0.88rem;
	}

	.class-pill {
		display: inline-flex;
		margin-bottom: 1rem;
		border: 1px solid rgba(255, 255, 255, 0.35);
		padding: 0.42rem 0.65rem;
		color: #020617;
		font-size: 0.78rem;
		font-weight: 800;
		line-height: 1;
		text-transform: uppercase;
	}

	.core {
		background: #5eead4;
	}

	.semi-periphery {
		background: #facc15;
	}

	.periphery {
		background: #fb923c;
	}

	.uncertain {
		background: #a78bfa;
	}

	.no_data {
		background: #64748b;
		color: #f8fafc;
	}

	.disputed {
		background: #f87171;
	}

	dl {
		display: grid;
		gap: 0.6rem;
		margin: 0;
	}

	dl div {
		display: grid;
		grid-template-columns: minmax(7.5rem, 0.75fr) 1fr;
		gap: 0.85rem;
	}

	dt {
		color: #94a3b8;
		font-size: 0.82rem;
	}

	dd {
		margin: 0;
		color: #e2e8f0;
		font-size: 0.9rem;
		text-align: right;
	}

	.sources {
		display: flex;
		flex-wrap: wrap;
		gap: 0.45rem;
	}

	@media (max-width: 920px) {
		.panel {
			border-top: 1px solid rgba(148, 163, 184, 0.22);
			border-left: 0;
		}

		dd {
			text-align: left;
		}
	}
</style>
