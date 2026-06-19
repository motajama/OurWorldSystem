<script lang="ts">
	import SourceBadge from '$lib/components/SourceBadge.svelte';
	import type { MapUnit, SourcedIndicatorValue } from '$lib/types';

	type Props = {
		unit: MapUnit | null;
	};

	let { unit }: Props = $props();

	const formatBoolean = (value: boolean | null) => {
		if (value === null || value === undefined) return 'No data';

		return value ? 'Yes' : 'No';
	};
	const formatValue = (value: number | string | null | undefined) =>
		value === null || value === undefined ? 'No data' : value;

	const isSourcedValue = (value: unknown): value is SourcedIndicatorValue =>
		Boolean(value && typeof value === 'object' && 'value' in value);

	const numericValue = (value: number | SourcedIndicatorValue | null | undefined) => {
		if (typeof value === 'number') return value;
		if (isSourcedValue(value)) return value.value;
		return null;
	};

	const formatNumber = (
		value: number | SourcedIndicatorValue | null | undefined,
		options?: Intl.NumberFormatOptions
	) => {
		const number = numericValue(value);

		if (number === null) return 'No data';

		return new Intl.NumberFormat('en', options).format(number);
	};

	const formatSourcedValue = (
		value: number | SourcedIndicatorValue | null | undefined,
		options?: Intl.NumberFormatOptions
	) => {
		if (!isSourcedValue(value)) return formatNumber(value, options);

		return `${formatNumber(value, options)} (${value.source ?? 'World Bank WDI'}, ${value.year})`;
	};

	const isProvisionalWorldSystem = (modelStatus: string | undefined) =>
		typeof modelStatus === 'string' && modelStatus.includes('provisional');

	const hasHighWelfareSemiPeriphery = (unit: MapUnit) =>
		unit.world_system.class === 'semi-periphery' &&
		typeof unit.quality_of_life.quality_of_life_score === 'number' &&
		unit.quality_of_life.quality_of_life_score >= 0.88;
</script>

<aside class="panel" aria-labelledby="panel-title">
	{#if unit}
		<p class="eyebrow">
			{unit.id} · {unit.map_unit_type}{unit.recognition_status
				? ` · ${unit.recognition_status}`
				: ''}
		</p>
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
				<div>
					<dt>Model status</dt>
					<dd>{unit.world_system.model_status ?? 'No data'}</dd>
				</div>
				<div>
					<dt>Source</dt>
					<dd>{unit.world_system.source ?? 'No data'}</dd>
				</div>
			</dl>
			{#if isProvisionalWorldSystem(unit.world_system.model_status)}
				<p class="warning">
					Provisional classification. Core status requires structural value-chain evidence; high
					quality of life alone is not enough.
				</p>
			{/if}
			{#if hasHighWelfareSemiPeriphery(unit)}
				<p class="muted">High welfare/core-like profile, but structural evidence is incomplete.</p>
			{/if}
			<p>{unit.world_system.explanation}</p>
		</section>

		<section>
			<h3>Conflict</h3>
			<dl>
				<div>
					<dt>War/organized violence on territory</dt>
					<dd>{formatBoolean(unit.conflict.war_on_territory)}</dd>
				</div>
				<div>
					<dt>State involvement</dt>
					<dd>{formatBoolean(unit.conflict.involved_in_conflict)}</dd>
				</div>
				<div>
					<dt>Latest year</dt>
					<dd>{formatValue(unit.conflict.latest_year)}</dd>
				</div>
				<div>
					<dt>Fatalities estimate</dt>
					<dd>
						{formatNumber(unit.conflict.fatalities_best_estimate, { maximumFractionDigits: 0 })}
					</dd>
				</div>
				<div>
					<dt>Child casualties</dt>
					<dd>
						{unit.conflict.child_casualties_verified === null
							? 'Not available in this layer'
							: formatValue(unit.conflict.child_casualties_verified)}
					</dd>
				</div>
				<div>
					<dt>Source</dt>
					<dd>{unit.conflict.source ?? 'No data'}</dd>
				</div>
			</dl>
			{#if unit.conflict.active_conflicts.length > 0}
				<ul class="compact-list">
					{#each unit.conflict.active_conflicts as conflict (conflict)}
						<li>{conflict}</li>
					{/each}
				</ul>
			{/if}
			<p class="muted">{unit.conflict.notes}</p>
			<p class="muted">
				UCDP fatality estimates are not an adult/child breakdown and should not be read as complete
				civilian death counts.
			</p>
		</section>

		<section>
			<h3>Quality of life</h3>
			<dl>
				<div>
					<dt>HDI</dt>
					<dd>{formatNumber(unit.quality_of_life.hdi, { maximumFractionDigits: 3 })}</dd>
				</div>
				<div>
					<dt>Project score</dt>
					<dd>
						{formatNumber(unit.quality_of_life.quality_of_life_score, {
							maximumFractionDigits: 3
						})}
					</dd>
				</div>
				<div>
					<dt>Life expectancy</dt>
					<dd>
						{formatSourcedValue(unit.quality_of_life.life_expectancy, {
							maximumFractionDigits: 1
						})}
					</dd>
				</div>
				<div>
					<dt>GNI per capita PPP</dt>
					<dd>
						{formatSourcedValue(unit.quality_of_life.gni_per_capita_ppp, {
							maximumFractionDigits: 0
						})}
					</dd>
				</div>
				<div>
					<dt>Secondary enrollment</dt>
					<dd>
						{formatSourcedValue(unit.quality_of_life.secondary_enrollment_gross, {
							maximumFractionDigits: 1
						})}
					</dd>
				</div>
				<div>
					<dt>Population</dt>
					<dd>
						{formatSourcedValue(unit.quality_of_life.population, {
							maximumFractionDigits: 0
						})}
					</dd>
				</div>
			</dl>
			{#if unit.quality_of_life.quality_of_life_score !== undefined && unit.quality_of_life.quality_of_life_score !== null}
				<p class="muted">
					The project score is a temporary OurWorldSystem composite from World Bank WDI life,
					income, and available education indicators. It is not HDI.
				</p>
			{/if}
		</section>

		<section>
			<h3>Extraction dependency</h3>
			<dl>
				<div>
					<dt>Dependency score</dt>
					<dd>
						{formatNumber(unit.exploitation_position.extraction_dependency_score, {
							maximumFractionDigits: 1
						})}
					</dd>
				</div>
				<div>
					<dt>Autonomy score</dt>
					<dd>
						{formatNumber(unit.exploitation_position.extraction_autonomy_score, {
							maximumFractionDigits: 1
						})}
					</dd>
				</div>
				<div>
					<dt>Resource rents</dt>
					<dd>
						{formatSourcedValue(
							unit.exploitation_position.extraction_values?.natural_resource_rents_gdp_pct,
							{ maximumFractionDigits: 1 }
						)}
					</dd>
				</div>
				<div>
					<dt>Fuel exports</dt>
					<dd>
						{formatSourcedValue(
							unit.exploitation_position.extraction_values?.fuel_exports_merchandise_pct,
							{ maximumFractionDigits: 1 }
						)}
					</dd>
				</div>
				<div>
					<dt>Ores/metals exports</dt>
					<dd>
						{formatSourcedValue(
							unit.exploitation_position.extraction_values?.ores_metals_exports_merchandise_pct,
							{ maximumFractionDigits: 1 }
						)}
					</dd>
				</div>
				<div>
					<dt>Agricultural raw exports</dt>
					<dd>
						{formatSourcedValue(
							unit.exploitation_position.extraction_values
								?.agricultural_raw_exports_merchandise_pct,
							{ maximumFractionDigits: 1 }
						)}
					</dd>
				</div>
				<div>
					<dt>Food exports</dt>
					<dd>
						{formatSourcedValue(
							unit.exploitation_position.extraction_values?.food_exports_merchandise_pct,
							{ maximumFractionDigits: 1 }
						)}
					</dd>
				</div>
				<div>
					<dt>Manufactures exports</dt>
					<dd>
						{formatSourcedValue(
							unit.exploitation_position.extraction_values?.manufactures_exports_merchandise_pct,
							{ maximumFractionDigits: 1 }
						)}
					</dd>
				</div>
				<div>
					<dt>High-tech exports</dt>
					<dd>
						{formatSourcedValue(
							unit.exploitation_position.extraction_values
								?.high_tech_exports_manufactured_pct,
							{ maximumFractionDigits: 1 }
						)}
					</dd>
				</div>
				<div>
					<dt>Medium/high-tech exports</dt>
					<dd>
						{formatSourcedValue(
							unit.exploitation_position.extraction_values
								?.medium_high_tech_exports_manufactured_pct,
							{ maximumFractionDigits: 1 }
						)}
					</dd>
				</div>
				<div>
					<dt>Source</dt>
					<dd>
						{unit.exploitation_position.extraction_source_country_code
							? `World Bank WDI (${unit.exploitation_position.extraction_source_country_code})`
							: 'No data'}
					</dd>
				</div>
			</dl>
			<p class="muted">This is a component score, not final world-system class.</p>
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

	.warning {
		border-left: 3px solid #facc15;
		padding-left: 0.8rem;
		color: #fef3c7;
		font-size: 0.9rem;
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

	.compact-list {
		margin: 0.8rem 0 0;
		padding-left: 1rem;
		color: #cbd5e1;
		font-size: 0.88rem;
		line-height: 1.45;
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
