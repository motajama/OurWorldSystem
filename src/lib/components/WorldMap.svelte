<script lang="ts" module>
	const DEBUG_MAP_LIFECYCLE = false;
	const MAP_DEBUG_PREFIX = '[OurWorldSystem:map-debug]';
	let worldMapInstanceCounter = 0;

	function mapDebug(instanceId: number, message: string, details?: unknown) {
		if (!DEBUG_MAP_LIFECYCLE) return;

		console.debug(
			MAP_DEBUG_PREFIX,
			new Date().toISOString(),
			`WorldMap#${instanceId}`,
			message,
			details
		);
	}

	function mapTrace(instanceId: number, message: string, details?: unknown) {
		if (!DEBUG_MAP_LIFECYCLE) return;

		console.trace(
			MAP_DEBUG_PREFIX,
			new Date().toISOString(),
			`WorldMap#${instanceId}`,
			message,
			details
		);
	}
</script>

<script lang="ts">
	import { base } from '$app/paths';
	import { onDestroy, onMount } from 'svelte';
	import {
		geoNaturalEarth1,
		geoPath,
		select,
		zoom,
		zoomIdentity,
		type D3ZoomEvent,
		type ZoomBehavior,
		type ZoomTransform
	} from 'd3';
	import { feature } from 'topojson-client';
	import type { Feature, FeatureCollection, GeoJsonProperties, Geometry } from 'geojson';
	import MapControls from '$lib/components/MapControls.svelte';
	import {
		buildRegistryIndexes,
		findRegistryRecordForNaturalEarthFeature,
		loadMapUnitRegistry,
		type RegistryIndexes
	} from '$lib/mapUnitRegistry';
	import {
		DEFAULT_MAP_LAYER_ID,
		getMapLayerDefinition,
		getMapLayerLegendItems,
		getMapUnitFillClass,
		getMapUnitLayerValue
	} from '$lib/mapLayers';
	import type {
		GeoFeatureProperties,
		MapLayerId,
		MapUnit,
		MapUnitId,
		MapUnitRegistryRecord
	} from '$lib/types';

	type Props = {
		units: MapUnit[];
		selectedId: MapUnitId | null;
		selectedLayer?: MapLayerId;
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
	const worldMapInstanceId = ++worldMapInstanceCounter;
	const worldTopologyPath = 'geo/world.topojson';
	const disputedTopologyPath = 'geo/disputed.topojson';
	const worldTopologyUrl = `${base}/${worldTopologyPath}`;
	const disputedTopologyUrl = `${base}/${disputedTopologyPath}`;
	const minZoomScale = 1;
	const maxZoomScale = 8;
	const zoomStep = 1.5;
	const keyboardPanStep = 44;

	let { units, selectedId, selectedLayer = DEFAULT_MAP_LAYER_ID, onSelect }: Props = $props();
	let features = $state<RenderFeature[]>([]);
	let disputedFeatures = $state<RenderFeature[]>([]);
	let geometryStatus = $state('Loading Natural Earth geometry.');
	let geometryDiagnostic = $state<string | null>(null);
	let registryDiagnostic = $state<string | null>(null);
	let notice = $state<string | null>(null);
	let svgElement = $state<SVGSVGElement | null>(null);
	let zoomBehavior: ZoomBehavior<SVGSVGElement, unknown> | null = null;
	let currentTransform = $state<ZoomTransform>(zoomIdentity);
	let isDraggingMap = $state(false);
	let pointerStart: { x: number; y: number } | null = null;
	let suppressNextFeatureClick = false;

	const disputedNotice =
		'This is a disputed or special map unit in the Natural Earth source layer. OurWorldSystem does not adjudicate sovereignty.';

	const zoomPercent = $derived(Math.round(currentTransform.k * 100));
	const canZoomIn = $derived(currentTransform.k < maxZoomScale - 0.01);
	const canZoomOut = $derived(currentTransform.k > minZoomScale + 0.01);
	const canResetZoom = $derived(
		Math.abs(currentTransform.k - 1) > 0.01 ||
			Math.abs(currentTransform.x) > 0.5 ||
			Math.abs(currentTransform.y) > 0.5
	);
	const unitById = $derived(new Map(units.map((unit) => [unit.id, unit])));
	const selectedLayerDefinition = $derived(getMapLayerDefinition(selectedLayer));
	const selectedLayerLegendByValue = $derived(
		new Map(getMapLayerLegendItems(selectedLayer).map((item) => [item.value, item]))
	);

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
		const renderedFeatures = geoFeatures
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

		mapDebug(worldMapInstanceId, 'world paths recomputed', {
			layerName,
			inputFeatureCount: geoFeatures.length,
			renderedPathCount: renderedFeatures.length
		});

		return renderedFeatures;
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

	function handleFeatureClick(
		event: MouseEvent,
		renderFeature: RenderFeature,
		isDisputedOverlay = false
	) {
		if (event.defaultPrevented || suppressNextFeatureClick) {
			suppressNextFeatureClick = false;
			return;
		}

		selectFeature(renderFeature, isDisputedOverlay);
	}

	function getLayerValueLabel(unit: MapUnit | null) {
		const value = getMapUnitLayerValue(unit, selectedLayer);
		return selectedLayerLegendByValue.get(value)?.label ?? selectedLayerDefinition.noDataLabel;
	}

	function handleKeydown(
		event: KeyboardEvent,
		renderFeature: RenderFeature,
		isDisputedOverlay = false
	) {
		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			selectFeature(renderFeature, isDisputedOverlay);
		} else if (event.key === 'Escape') {
			event.preventDefault();
			if (document.activeElement instanceof HTMLElement) {
				document.activeElement.blur();
			}
		}
	}

	function zoomSelection() {
		if (!svgElement || !zoomBehavior) return null;

		return select<SVGSVGElement, unknown>(svgElement);
	}

	function applyZoomTransform(transform: ZoomTransform) {
		const selection = zoomSelection();

		if (!selection || !zoomBehavior) return;

		mapTrace(worldMapInstanceId, 'programmatic zoom transform applied', transform.toString());

		selection
			.transition()
			.duration(window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 180)
			.call(zoomBehavior.transform, transform);
	}

	function zoomBy(factor: number) {
		const selection = zoomSelection();

		if (!selection || !zoomBehavior) return;

		selection
			.transition()
			.duration(window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 160)
			.call(zoomBehavior.scaleBy, factor);
	}

	function zoomIn() {
		zoomBy(zoomStep);
	}

	function zoomOut() {
		zoomBy(1 / zoomStep);
	}

	function resetZoom() {
		mapTrace(worldMapInstanceId, 'resetZoom called');
		applyZoomTransform(zoomIdentity);
	}

	function fitToWorld() {
		mapTrace(worldMapInstanceId, 'fitToWorld called');
		// The Natural Earth projection is pre-fit to the SVG viewport, so identity
		// is the full-world fit transform for the generated paths.
		applyZoomTransform(zoomIdentity);
	}

	function panBy(dx: number, dy: number) {
		const selection = zoomSelection();

		if (!selection || !zoomBehavior) return;

		selection
			.transition()
			.duration(window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 120)
			.call(zoomBehavior.translateBy, dx / currentTransform.k, dy / currentTransform.k);
	}

	function handleMapKeydown(event: KeyboardEvent) {
		if (event.target !== svgElement) return;

		if (event.key === '+' || event.key === '=') {
			event.preventDefault();
			zoomIn();
		} else if (event.key === '-') {
			event.preventDefault();
			zoomOut();
		} else if (event.key === '0') {
			event.preventDefault();
			resetZoom();
		} else if (event.key === 'ArrowLeft') {
			event.preventDefault();
			panBy(keyboardPanStep, 0);
		} else if (event.key === 'ArrowRight') {
			event.preventDefault();
			panBy(-keyboardPanStep, 0);
		} else if (event.key === 'ArrowUp') {
			event.preventDefault();
			panBy(0, keyboardPanStep);
		} else if (event.key === 'ArrowDown') {
			event.preventDefault();
			panBy(0, -keyboardPanStep);
		} else if (event.key === 'Escape') {
			event.preventDefault();
			if (document.activeElement instanceof HTMLElement) {
				document.activeElement.blur();
			}
		}
	}

	function handleMapPointerDown(event: PointerEvent) {
		pointerStart = { x: event.clientX, y: event.clientY };
	}

	function handleMapPointerUp(event: PointerEvent) {
		if (!pointerStart) return;

		const distance = Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y);
		suppressNextFeatureClick = distance > 4;
		pointerStart = null;
	}

	async function fetchTopology(url: string): Promise<TopologyFetchResult> {
		mapDebug(worldMapInstanceId, 'geometry fetch start', { url });

		try {
			const response = await fetch(url);

			if (!response.ok) {
				mapDebug(worldMapInstanceId, 'geometry fetch end', {
					url,
					ok: false,
					status: response.status
				});
				return {
					ok: false,
					url,
					status: response.status,
					message: `HTTP ${response.status} while fetching ${url}`
				};
			}

			mapDebug(worldMapInstanceId, 'geometry fetch end', {
				url,
				ok: true,
				status: response.status
			});

			return {
				ok: true,
				url,
				topology: (await response.json()) as TopologyObject
			};
		} catch (error) {
			mapDebug(worldMapInstanceId, 'geometry fetch end', {
				url,
				ok: false,
				error: error instanceof Error ? error.message : 'unknown'
			});
			return {
				ok: false,
				url,
				status: null,
				message: error instanceof Error ? error.message : `Failed to fetch ${url}`
			};
		}
	}

	onMount(async () => {
		mapDebug(worldMapInstanceId, 'WorldMap mount', {
			selectedLayer,
			selectedId,
			unitCount: units.length
		});

		if (svgElement) {
			zoomBehavior = zoom<SVGSVGElement, unknown>()
				.scaleExtent([minZoomScale, maxZoomScale])
				.extent([
					[0, 0],
					[viewBox.width, viewBox.height]
				])
				.translateExtent([
					[0, 0],
					[viewBox.width, viewBox.height]
				])
				.on('start', () => {
					isDraggingMap = true;
				})
				.on('zoom', (event: D3ZoomEvent<SVGSVGElement, unknown>) => {
					currentTransform = event.transform;
					mapDebug(worldMapInstanceId, 'zoom event', event.transform.toString());
				})
				.on('end', () => {
					isDraggingMap = false;
				});

			select<SVGSVGElement, unknown>(svgElement)
				.call(zoomBehavior)
				.on('dblclick.zoom', null);

			mapDebug(worldMapInstanceId, 'zoom initialized', zoomIdentity.toString());
		}

		let registryIndexes: RegistryIndexes | null = null;

		try {
			mapDebug(worldMapInstanceId, 'registry fetch start');
			const registry = await loadMapUnitRegistry(base);
			registryIndexes = buildRegistryIndexes(registry);
			mapDebug(worldMapInstanceId, 'registry fetch end', { recordCount: registry.length });
		} catch (error) {
			mapDebug(worldMapInstanceId, 'registry fetch end', {
				error: error instanceof Error ? error.message : 'unknown'
			});
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

	onDestroy(() => {
		mapDebug(worldMapInstanceId, 'WorldMap destroy');

		if (svgElement) {
			select(svgElement).on('.zoom', null);
		}
	});

	$effect(() => {
		mapDebug(worldMapInstanceId, 'selectedLayer changed', selectedLayer);
	});

	$effect(() => {
		mapDebug(worldMapInstanceId, 'render path count changed', {
			base: features.length,
			disputed: disputedFeatures.length
		});
	});
</script>

<section class="map-shell" aria-labelledby="map-title">
	<div class="map-heading">
		<div>
			<p>Static Natural Earth layer</p>
			<h2 id="map-title">World-system map units</h2>
		</div>
		<span>{selectedLayerDefinition.shortLabel} · {units.length} mock units</span>
	</div>

	<div class="map-frame">
		<MapControls
			{zoomPercent}
			{canZoomIn}
			{canZoomOut}
			canReset={canResetZoom}
			canFit={canResetZoom}
			onZoomIn={zoomIn}
			onZoomOut={zoomOut}
			onReset={resetZoom}
			onFit={fitToWorld}
		/>
		<!-- svelte-ignore a11y_no_noninteractive_tabindex (the SVG is the keyboard-focusable map navigation surface) -->
		<!-- svelte-ignore a11y_no_noninteractive_element_interactions (the SVG handles map navigation keys and pointer panning) -->
		<svg
			bind:this={svgElement}
			class:dragging={isDraggingMap}
			viewBox={`0 0 ${viewBox.width} ${viewBox.height}`}
			role="img"
			aria-describedby="map-description"
			aria-label="Interactive world map. Use plus and minus to zoom, zero to reset, and arrow keys to pan."
			preserveAspectRatio="xMidYMid meet"
			tabindex="0"
			onkeydown={handleMapKeydown}
			onpointerdown={handleMapPointerDown}
			onpointerup={handleMapPointerUp}
			onpointercancel={() => {
				pointerStart = null;
			}}
		>
			<title>OurWorldSystem Natural Earth map layer</title>
			<desc id="map-description">
				An interactive Natural Earth world map. Matched map units are colored by the selected
				{selectedLayerDefinition.label} layer. Unmatched geometry is shown as no data. Disputed and
				breakaway areas are drawn as a subtle overlay when available.
			</desc>
			<rect width={viewBox.width} height={viewBox.height} fill="#07111f" />

			{#if features.length === 0}
				<text class="empty-label" x="500" y="250">{geometryStatus}</text>
			{:else}
				<g
					class="map-viewport"
					transform={`translate(${currentTransform.x} ${currentTransform.y}) scale(${currentTransform.k})`}
				>
					<g class="base-layer" aria-label="Natural Earth Admin 0 map units">
						{#each features as renderFeature (renderFeature.renderKey)}
							{@const unit = renderFeature.unit}
							{@const selected =
								unit?.id === selectedId || (!unit && renderFeature.id === selectedId)}
							{@const valueLabel = getLayerValueLabel(unit)}
							<path
								class={`map-unit ${getMapUnitFillClass(unit, selectedLayer)}`}
								class:selected
								class:matched={Boolean(unit)}
								d={renderFeature.path}
								role="button"
								tabindex="0"
								aria-label={`Select ${unit?.name ?? renderFeature.name}. ${selectedLayerDefinition.label}: ${valueLabel}`}
								onclick={(event) => handleFeatureClick(event, renderFeature)}
								onkeydown={(event) => handleKeydown(event, renderFeature)}
							>
								<title>{unit?.name ?? renderFeature.name}: {selectedLayerDefinition.label} - {valueLabel}</title>
							</path>
						{/each}
					</g>

					{#if disputedFeatures.length > 0}
						<g class="disputed-layer" aria-label="Natural Earth disputed and breakaway areas">
							{#each disputedFeatures as renderFeature (renderFeature.renderKey)}
								{@const unit = renderFeature.unit}
								{@const valueLabel = getLayerValueLabel(unit)}
								<path
									class:selected={unit?.id === selectedId}
									d={renderFeature.path}
									role="button"
									tabindex="0"
									aria-label={`Inspect disputed or special map unit: ${unit?.name ?? renderFeature.name}. ${selectedLayerDefinition.label}: ${valueLabel}`}
									onclick={(event) => handleFeatureClick(event, renderFeature, true)}
									onkeydown={(event) => handleKeydown(event, renderFeature, true)}
								>
									<title>{unit?.name ?? renderFeature.name}: {selectedLayerDefinition.label} - {valueLabel}</title>
								</path>
							{/each}
						</g>
					{/if}
				</g>
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
		position: relative;
		display: grid;
		min-height: min(58vh, 44rem);
		border: 1px solid rgba(148, 163, 184, 0.22);
		background: #020617;
		overflow: hidden;
	}

	svg {
		display: block;
		width: 100%;
		height: 100%;
		min-height: min(58vh, 44rem);
		cursor: grab;
		touch-action: none;
	}

	svg:focus-visible {
		outline: 2px solid #67e8f9;
		outline-offset: -3px;
	}

	svg.dragging {
		cursor: grabbing;
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

	.map-unit.layer-world-system-core {
		fill: #5eead4;
	}

	.map-unit.layer-world-system-semi-periphery {
		fill: #facc15;
	}

	.map-unit.layer-world-system-periphery {
		fill: #fb923c;
	}

	.map-unit.layer-world-system-uncertain {
		fill: #a78bfa;
	}

	.map-unit.layer-world-system-disputed {
		fill: #f87171;
	}

	.map-unit.layer-world-system-no-data,
	.map-unit.layer-conflict-no-data,
	.map-unit.layer-press-freedom-no-data,
	.map-unit.layer-political-freedom-no-data,
	.map-unit.layer-quality-of-life-no-data,
	.map-unit.layer-exploitation-no-data,
	.map-unit.layer-ecology-no-data {
		fill: #64748b;
	}

	.map-unit.layer-conflict-active-war-on-territory {
		fill: #7f1d1d;
	}

	.map-unit.layer-conflict-involved-in-war {
		fill: #ea580c;
	}

	.map-unit.layer-conflict-no-active-war {
		fill: #94a3b8;
	}

	.map-unit.layer-press-freedom-good {
		fill: #2dd4bf;
	}

	.map-unit.layer-press-freedom-satisfactory {
		fill: #84cc16;
	}

	.map-unit.layer-press-freedom-problematic {
		fill: #facc15;
	}

	.map-unit.layer-press-freedom-difficult {
		fill: #f97316;
	}

	.map-unit.layer-press-freedom-very-serious {
		fill: #be123c;
	}

	.map-unit.layer-political-freedom-free {
		fill: #38bdf8;
	}

	.map-unit.layer-political-freedom-partly-free {
		fill: #facc15;
	}

	.map-unit.layer-political-freedom-not-free {
		fill: #c026d3;
	}

	.map-unit.layer-quality-of-life-very-high {
		fill: #06b6d4;
	}

	.map-unit.layer-quality-of-life-high {
		fill: #22c55e;
	}

	.map-unit.layer-quality-of-life-medium {
		fill: #f59e0b;
	}

	.map-unit.layer-quality-of-life-low {
		fill: #dc2626;
	}

	.map-unit.layer-exploitation-high-extraction-risk {
		fill: #9a3412;
	}

	.map-unit.layer-exploitation-medium-extraction-risk {
		fill: #ca8a04;
	}

	.map-unit.layer-exploitation-low-extraction-risk {
		fill: #0f766e;
	}

	.map-unit.layer-ecology-strong {
		fill: #14b8a6;
	}

	.map-unit.layer-ecology-mixed {
		fill: #a3e635;
	}

	.map-unit.layer-ecology-weak {
		fill: #f97316;
	}

	.map-unit.layer-ecology-severe {
		fill: #b91c1c;
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
