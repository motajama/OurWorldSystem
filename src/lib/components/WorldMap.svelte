<script lang="ts">
	import { base } from '$app/paths';
	import { onMount } from 'svelte';
	import { geoNaturalEarth1, geoPath } from 'd3';
	import { feature } from 'topojson-client';
	import type { Feature, FeatureCollection, GeoJsonProperties, Geometry } from 'geojson';
	import {
		buildRegistryIndexes,
		findRegistryRecordForNaturalEarthFeature,
		loadMapUnitRegistry,
		type RegistryIndexes
	} from '$lib/mapUnitRegistry';
	import type {
		GeoFeatureProperties,
		MapUnit,
		MapUnitId,
		MapUnitRegistryRecord,
		WorldSystemClass
	} from '$lib/types';

	type Props = {
		units: MapUnit[];
		selectedId: MapUnitId | null;
		onSelect: (unit: MapUnit) => void;
	};

	type TopologyObject = {
		type: string;
		objects?: Record<string, unknown>;
	};

	type TopologyGeometryObject = {
		type?: string;
		geometries?: unknown[];
	};

	type TopologyFetchResult =
		| {
				ok: true;
				url: string;
				topology: TopologyObject;
		  }
		| {
				ok: false;
				url: string;
				status: number | null;
				message: string;
		  };

	type ExtractionResult =
		| {
				ok: true;
				features: Feature<Geometry, GeoFeatureProperties>[];
				objectKey: string;
				availableObjectKeys: string[];
		  }
		| {
				ok: false;
				message: string;
				availableObjectKeys: string[];
		  };

	type RenderFeature = {
		id: string;
		renderKey: string;
		name: string;
		path: string;
		unit: MapUnit | null;
		registryRecord: MapUnitRegistryRecord | null;
		properties: GeoFeatureProperties;
	};

	const viewBox = {
		width: 1000,
		height: 520
	};
	const worldTopologyPath = 'geo/world.topojson';
	const disputedTopologyPath = 'geo/disputed.topojson';
	const worldTopologyUrl = `${base}/${worldTopologyPath}`;
	const disputedTopologyUrl = `${base}/${disputedTopologyPath}`;

	let { units, selectedId, onSelect }: Props = $props();
	let features = $state<RenderFeature[]>([]);
	let disputedFeatures = $state<RenderFeature[]>([]);
	let geometryStatus = $state('Loading Natural Earth geometry.');
	let geometryDiagnostic = $state<string | null>(null);
	let registryDiagnostic = $state<string | null>(null);
	let notice = $state<string | null>(null);

	const classColors: Record<WorldSystemClass, string> = {
		core: '#5eead4',
		'semi-periphery': '#facc15',
		periphery: '#fb923c',
		uncertain: '#a78bfa',
		no_data: '#64748b',
		disputed: '#f87171'
	};

	const disputedNotice =
		'This is a disputed or special map unit in the Natural Earth source layer. OurWorldSystem does not adjudicate sovereignty.';

	const unitById = $derived(new Map(units.map((unit) => [unit.id, unit])));

	function isValidTopologyObject(value: unknown): value is TopologyGeometryObject {
		if (!value || typeof value !== 'object') {
			return false;
		}

		const object = value as TopologyGeometryObject;

		return (
			object.type === 'GeometryCollection' ||
			object.type === 'Point' ||
			object.type === 'MultiPoint' ||
			object.type === 'LineString' ||
			object.type === 'MultiLineString' ||
			object.type === 'Polygon' ||
			object.type === 'MultiPolygon'
		);
	}

	function getTopologyObject(topology: TopologyObject, preferredKeys: string[] = []) {
		const objects = topology.objects ?? {};
		const keys = Object.keys(objects);
		const orderedKeys = [...preferredKeys, ...keys.filter((key) => !preferredKeys.includes(key))];

		for (const key of orderedKeys) {
			const object = objects[key];

			if (isValidTopologyObject(object)) {
				return { key, object };
			}
		}

		return null;
	}

	function normalizeProperties(properties: GeoJsonProperties): GeoFeatureProperties {
		return (properties ?? {}) as GeoFeatureProperties;
	}

	function normalizeFeatureResult(
		result:
			| Feature<Geometry, GeoFeatureProperties>
			| FeatureCollection<Geometry, GeoFeatureProperties>
	): Feature<Geometry, GeoFeatureProperties>[] {
		if (result.type === 'FeatureCollection') {
			return result.features;
		}

		if (result.type === 'Feature') {
			return [result];
		}

		return [];
	}

	function extractFeatures(
		topology: TopologyObject,
		url: string,
		preferredKeys: string[] = []
	): ExtractionResult {
		const topologyObject = getTopologyObject(topology, preferredKeys);
		const availableObjectKeys = Object.keys(topology.objects ?? {});

		if (!topologyObject) {
			return {
				ok: false,
				availableObjectKeys,
				message:
					availableObjectKeys.length > 0
						? `Attempted ${url}. No valid TopoJSON object found. Available object keys: ${availableObjectKeys.join(', ')}.`
						: `Attempted ${url}. No TopoJSON object keys were found in the file.`
			};
		}

		try {
			const result = feature(
				topology as Parameters<typeof feature>[0],
				topologyObject.object as Parameters<typeof feature>[1]
			) as
				| Feature<Geometry, GeoFeatureProperties>
				| FeatureCollection<Geometry, GeoFeatureProperties>;
			const extractedFeatures = normalizeFeatureResult(result).map((geoFeature) => ({
				...geoFeature,
				properties: normalizeProperties(geoFeature.properties)
			}));

			if (extractedFeatures.length === 0) {
				return {
					ok: false,
					availableObjectKeys,
					message: `TopoJSON object "${topologyObject.key}" loaded, but it produced no GeoJSON features.`
				};
			}

			return {
				ok: true,
				features: extractedFeatures,
				objectKey: topologyObject.key,
				availableObjectKeys
			};
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown TopoJSON conversion error.';
			return {
				ok: false,
				availableObjectKeys,
				message: `Could not extract features from TopoJSON object "${topologyObject.key}": ${message}`
			};
		}
	}

	function getFallbackJoinCandidates(properties: GeoFeatureProperties): MapUnitId[] {
		const candidates = [
			properties.ISO_A3,
			properties.ADM0_A3,
			properties.SOV_A3,
			properties.FCLASS_ISO,
			properties.FCLASS_US,
			properties.FCLASS_FR,
			properties.FCLASS_RU,
			properties.FCLASS_CN,
			properties.id
		].filter((value): value is string => Boolean(value && value !== '-99'));

		return candidates;
	}

	function findFallbackIndicatorUnit(properties: GeoFeatureProperties): MapUnit | null {
		for (const candidate of getFallbackJoinCandidates(properties)) {
			const unit = unitById.get(candidate);

			if (unit) {
				return unit;
			}
		}

		return null;
	}

	function applyRegistryMetadata(unit: MapUnit, registryRecord: MapUnitRegistryRecord): MapUnit {
		return {
			...unit,
			name: registryRecord.display_name,
			map_unit_type: registryRecord.map_unit_type,
			sovereignty_note: registryRecord.sovereignty_note
		};
	}

	function findUnit(
		properties: GeoFeatureProperties,
		registryRecord: MapUnitRegistryRecord | null
	): MapUnit | null {
		if (registryRecord) {
			const registryUnit = unitById.get(registryRecord.id);

			if (registryUnit) {
				return applyRegistryMetadata(registryUnit, registryRecord);
			}
		}

		return findFallbackIndicatorUnit(properties);
	}

	function getFeatureName(properties: GeoFeatureProperties) {
		return (
			properties.NAME_LONG ??
			properties.NAME ??
			properties.ADMIN ??
			properties.ISO_A3 ??
			properties.ADM0_A3 ??
			'Unnamed map unit'
		);
	}

	function getFeatureId(properties: GeoFeatureProperties, fallback: string) {
		for (const value of [properties.ISO_A3, properties.ADM0_A3, properties.SOV_A3, properties.id]) {
			if (value && value !== '-99') {
				return value;
			}
		}

		return fallback;
	}

	function getRenderKey(layerName: string, index: number, properties: GeoFeatureProperties) {
		// Natural Earth may use "-99" as a non-unique placeholder code, so render keys
		// must not rely only on ISO/ADM codes.
		return [
			layerName,
			index,
			properties.ADM0_A3,
			properties.ISO_A3,
			properties.SOV_A3,
			properties.NAME_LONG,
			properties.NAME,
			properties.ADMIN
		]
			.filter(Boolean)
			.join('::');
	}

	function createNoDataUnit(renderFeature: RenderFeature): MapUnit {
		const id = renderFeature.registryRecord?.id ?? renderFeature.id;
		const name = renderFeature.registryRecord?.display_name ?? renderFeature.name;
		const mapUnitType = renderFeature.registryRecord?.map_unit_type ?? 'no_data';
		const sovereigntyNote = renderFeature.registryRecord?.sovereignty_note ?? null;

		return {
			id,
			name,
			map_unit_type: mapUnitType,
			sovereignty_note: sovereigntyNote,
			world_system: {
				class: 'no_data',
				score: null,
				confidence: 'low',
				explanation: 'Geometry exists but no indicator record is available yet.'
			},
			conflict: {
				war_on_territory: false,
				involved_in_conflict: false,
				active_conflicts: [],
				fatalities_best_estimate: null,
				child_casualties_verified: null,
				notes: 'No indicator record is available yet.'
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
				education_index: null
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
			sources: ['natural_earth'],
			last_updated: '2026-06-18'
		};
	}

	function renderFeatures(
		geoFeatures: Feature<Geometry, GeoFeatureProperties>[],
		path: ReturnType<typeof geoPath>,
		layerName: string,
		indexes: RegistryIndexes | null
	): RenderFeature[] {
		return geoFeatures
			.map((geoFeature: Feature<Geometry, GeoFeatureProperties>, index) => {
				const properties = geoFeature.properties ?? {};
				const featurePath = path(geoFeature);

				if (!featurePath) {
					return null;
				}

				const registryRecord = indexes
					? findRegistryRecordForNaturalEarthFeature(properties, indexes)
					: null;
				const id = getFeatureId(
					properties,
					`natural-earth:${layerName}:${index}:${properties.NAME_LONG ?? properties.NAME ?? 'feature'}`
				);
				const name = registryRecord?.display_name ?? getFeatureName(properties);

				return {
					id: registryRecord?.id ?? String(id),
					renderKey: getRenderKey(layerName, index, properties),
					name,
					path: featurePath,
					unit: findUnit(properties, registryRecord),
					registryRecord,
					properties
				};
			})
			.filter((renderFeature): renderFeature is RenderFeature => Boolean(renderFeature));
	}

	function selectFeature(renderFeature: RenderFeature, isDisputedOverlay = false) {
		if (renderFeature.unit) {
			notice = null;
			onSelect(renderFeature.unit);
			return;
		}

		if (isDisputedOverlay) {
			notice = disputedNotice;
		} else {
			notice = null;
		}

		onSelect(createNoDataUnit(renderFeature));
	}

	function handleKeydown(
		event: KeyboardEvent,
		renderFeature: RenderFeature,
		isDisputedOverlay = false
	) {
		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			selectFeature(renderFeature, isDisputedOverlay);
		}
	}

	async function fetchTopology(url: string): Promise<TopologyFetchResult> {
		try {
			const response = await fetch(url);

			if (!response.ok) {
				return {
					ok: false,
					url,
					status: response.status,
					message: `HTTP ${response.status} while fetching ${url}`
				};
			}

			return {
				ok: true,
				url,
				topology: (await response.json()) as TopologyObject
			};
		} catch (error) {
			return {
				ok: false,
				url,
				status: null,
				message: error instanceof Error ? error.message : `Failed to fetch ${url}`
			};
		}
	}

	onMount(async () => {
		let registryIndexes: RegistryIndexes | null = null;

		try {
			const registry = await loadMapUnitRegistry(base);
			registryIndexes = buildRegistryIndexes(registry);
		} catch (error) {
			registryDiagnostic =
				error instanceof Error
					? `${error.message}. Rendering will continue with Natural Earth geometry and mock indicators only.`
					: 'Map-unit registry could not be loaded. Rendering will continue with Natural Earth geometry and mock indicators only.';
		}

		const worldTopology = await fetchTopology(worldTopologyUrl);

		if (!worldTopology.ok) {
			geometryDiagnostic =
				worldTopology.status === 404
					? `Attempted ${worldTopology.url}. File was not found; run npm run geo:build and rebuild the static site.`
					: `Attempted ${worldTopology.url}. ${worldTopology.message}.`;
			geometryStatus = 'Natural Earth base geometry could not be loaded.';
			return;
		}

		const extractedWorld = extractFeatures(worldTopology.topology, worldTopology.url, [
			'ne_110m_admin_0_countries'
		]);

		if (!extractedWorld.ok) {
			geometryDiagnostic = extractedWorld.message;
			geometryStatus = 'Natural Earth base geometry loaded, but no features could be extracted.';
			return;
		}

		try {
			const worldCollection: FeatureCollection<Geometry, GeoFeatureProperties> = {
				type: 'FeatureCollection',
				features: extractedWorld.features
			};
			const projection = geoNaturalEarth1().fitSize(
				[viewBox.width, viewBox.height],
				worldCollection
			);
			const path = geoPath(projection);
			const renderedWorldFeatures = renderFeatures(
				extractedWorld.features,
				path,
				'base',
				registryIndexes
			);

			if (renderedWorldFeatures.length === 0) {
				geometryDiagnostic = `TopoJSON object "${extractedWorld.objectKey}" produced ${extractedWorld.features.length} features, but none generated drawable SVG paths.`;
				geometryStatus =
					'Natural Earth base geometry loaded, but no drawable paths could be rendered.';
				return;
			}

			const disputedTopology = await fetchTopology(disputedTopologyUrl);

			features = renderedWorldFeatures;

			if (disputedTopology.ok) {
				const extractedDisputed = extractFeatures(disputedTopology.topology, disputedTopology.url, [
					'ne_50m_admin_0_breakaway_disputed_areas'
				]);

				if (extractedDisputed.ok) {
					disputedFeatures = renderFeatures(
						extractedDisputed.features,
						path,
						'disputed',
						registryIndexes
					);
					geometryDiagnostic = `Attempted ${worldTopology.url}. Available object keys: ${extractedWorld.availableObjectKeys.join(', ')}. Extracted ${extractedWorld.features.length} base features from "${extractedWorld.objectKey}". Attempted ${disputedTopology.url}. Available object keys: ${extractedDisputed.availableObjectKeys.join(', ')}. Extracted ${extractedDisputed.features.length} disputed overlay features from "${extractedDisputed.objectKey}".`;
				} else {
					geometryDiagnostic = extractedDisputed.message;
				}
			} else if (disputedTopology.status !== 404) {
				geometryDiagnostic = `Attempted optional overlay ${disputedTopology.url}. ${disputedTopology.message}.`;
			} else {
				geometryDiagnostic = `Attempted ${worldTopology.url}. Available object keys: ${extractedWorld.availableObjectKeys.join(', ')}. Extracted ${extractedWorld.features.length} base features from "${extractedWorld.objectKey}". Optional overlay ${disputedTopology.url} returned HTTP 404.`;
			}

			geometryStatus = disputedTopology.ok
				? `Natural Earth base geometry loaded from object "${extractedWorld.objectKey}" with disputed overlay.`
				: `Natural Earth base geometry loaded from object "${extractedWorld.objectKey}". Optional disputed overlay not found.`;
		} catch {
			geometryStatus = 'Natural Earth geometry loaded, but projection or rendering failed.';
			geometryDiagnostic =
				'The TopoJSON file was fetched successfully, but D3 could not render it.';
		}
	});
</script>

<section class="map-shell" aria-labelledby="map-title">
	<div class="map-heading">
		<div>
			<p>Static Natural Earth layer</p>
			<h2 id="map-title">World-system map units</h2>
		</div>
		<span>{units.length} mock units</span>
	</div>

	<div class="map-frame">
		<svg
			viewBox={`0 0 ${viewBox.width} ${viewBox.height}`}
			role="img"
			aria-describedby="map-description"
			preserveAspectRatio="xMidYMid meet"
		>
			<title>OurWorldSystem Natural Earth map layer</title>
			<desc id="map-description">
				A static Natural Earth world map. Matched map units are colored by mock world-system class.
				Unmatched geometry is neutral. Disputed and breakaway areas are drawn as a subtle overlay
				when available.
			</desc>
			<rect width={viewBox.width} height={viewBox.height} fill="#07111f" />

			{#if features.length === 0}
				<text class="empty-label" x="500" y="250">{geometryStatus}</text>
			{:else}
				<g class="base-layer" aria-label="Natural Earth Admin 0 map units">
					{#each features as renderFeature (renderFeature.renderKey)}
						{@const unit = renderFeature.unit}
						{@const selected =
							unit?.id === selectedId || (!unit && renderFeature.id === selectedId)}
						<path
							class:selected
							class:matched={Boolean(unit)}
							d={renderFeature.path}
							fill={unit ? classColors[unit.world_system.class] : classColors.no_data}
							role="button"
							tabindex="0"
							aria-label={`Select ${unit?.name ?? renderFeature.name}`}
							onclick={() => selectFeature(renderFeature)}
							onkeydown={(event) => handleKeydown(event, renderFeature)}
						>
							<title>{unit?.name ?? renderFeature.name}</title>
						</path>
					{/each}
				</g>

				{#if disputedFeatures.length > 0}
					<g class="disputed-layer" aria-label="Natural Earth disputed and breakaway areas">
						{#each disputedFeatures as renderFeature (renderFeature.renderKey)}
							{@const unit = renderFeature.unit}
							<path
								class:selected={unit?.id === selectedId}
								d={renderFeature.path}
								role="button"
								tabindex="0"
								aria-label={`Inspect disputed or special map unit: ${unit?.name ?? renderFeature.name}`}
								onclick={() => selectFeature(renderFeature, true)}
								onkeydown={(event) => handleKeydown(event, renderFeature, true)}
							>
								<title>{unit?.name ?? renderFeature.name}</title>
							</path>
						{/each}
					</g>
				{/if}
			{/if}
		</svg>
	</div>

	{#if notice}
		<p class="notice" role="status">{notice}</p>
	{/if}
	<p class="status">{geometryStatus}</p>
	{#if geometryDiagnostic}
		<p class="diagnostic" role="status">{geometryDiagnostic}</p>
	{/if}
	{#if registryDiagnostic}
		<p class="diagnostic" role="status">{registryDiagnostic}</p>
	{/if}
</section>

<style>
	.map-shell {
		display: grid;
		min-height: 100%;
		grid-template-rows: auto 1fr auto auto;
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
		display: grid;
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

	path {
		stroke: rgba(15, 23, 42, 0.96);
		stroke-width: 0.45;
		vector-effect: non-scaling-stroke;
		transition:
			fill 140ms ease,
			filter 140ms ease,
			stroke 140ms ease;
	}

	path {
		cursor: pointer;
	}

	path:hover,
	path:focus-visible {
		filter: brightness(1.2);
		stroke: #f8fafc;
		stroke-width: 1.1;
		outline: none;
	}

	path.selected {
		filter: drop-shadow(0 0 8px rgba(226, 232, 240, 0.76));
		stroke: #f8fafc;
		stroke-width: 1.4;
	}

	.disputed-layer path {
		cursor: pointer;
		fill: rgba(248, 113, 113, 0.05);
		stroke: rgba(248, 113, 113, 0.78);
		stroke-dasharray: 3 3;
		stroke-width: 1.15;
		pointer-events: auto;
	}

	.disputed-layer path:hover,
	.disputed-layer path:focus-visible {
		fill: rgba(248, 113, 113, 0.12);
		stroke: #fecaca;
	}

	.empty-label {
		fill: #94a3b8;
		font-size: 1rem;
		text-anchor: middle;
	}

	.status,
	.notice,
	.diagnostic {
		margin: 0;
		font-size: 0.88rem;
		line-height: 1.45;
	}

	.status {
		color: #94a3b8;
	}

	.notice {
		border-left: 3px solid #f87171;
		padding-left: 0.75rem;
		color: #fecaca;
	}

	.diagnostic {
		color: #fcd34d;
	}

	@media (max-width: 700px) {
		.map-heading {
			align-items: start;
			flex-direction: column;
		}
	}
</style>
