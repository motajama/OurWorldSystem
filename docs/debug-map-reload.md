# Map Reload / Zoom Reset Diagnostic

## Summary

The most likely reset mechanism is a `WorldMap` component recreation, not a layer-change reset inside the map. `WorldMap` keeps the D3 zoom transform in component-local state initialized to `zoomIdentity`; when the component instance is recreated, the transform returns to identity, D3 zoom is reattached, and geometry is fetched again.

The code does not show a selected-layer keyed block, a reactive geometry reload, or an implicit `resetZoom` / `fitToWorld` call tied to layer selection. If the symptom is intermittent in local development, the likely trigger is Vite dev/HMR or a full route/page reload caused by source/static file changes. In production, the same reset would be visible only if the browser page reloads, the Svelte route/page remounts, or future code toggles the parent loading/error branch so `WorldMap` is destroyed and recreated.

## Mechanism Checklist

1. Full browser page reload: possible in dev through Vite full reloads, but not shown as an application behavior in the inspected code.
2. Svelte component remount: this explains the observed zoom loss because `WorldMap` initializes `currentTransform` to `zoomIdentity`.
3. Re-fetching Natural Earth / data JSON: happens on `WorldMap` mount for geometry/registry and on page mount for data.
4. Recomputing SVG paths: happens only after geometry fetch in `WorldMap` mount.
5. D3 zoom transform reset: happens when a new `WorldMap` instance starts with `currentTransform = zoomIdentity`; explicit reset calls are only wired to controls/keyboard.
6. Vite dev/HMR behavior: likely dev-only trigger if files under `src/`, `static/data/`, or `static/geo/` change while `npm run dev` is running.
7. Parent component state reset: possible if `src/routes/+page.svelte` remounts; its `onMount` reloads data and resets selection to the first unit.
8. Keyed block recreating `WorldMap`: not present in the inspected code.

## Evidence

- [src/lib/components/WorldMap.svelte](/Users/janmotal/Documents/Code/HTML/OurWorldSystem/src/lib/components/WorldMap.svelte:135) receives `units`, `selectedId`, and `selectedLayer` as props. No reactive statement reloads geometry based on `selectedLayer`.
- [src/lib/components/WorldMap.svelte](/Users/janmotal/Documents/Code/HTML/OurWorldSystem/src/lib/components/WorldMap.svelte:144) initializes `currentTransform` to `zoomIdentity`. This is the zoom state that is lost on component recreation.
- [src/lib/components/WorldMap.svelte](/Users/janmotal/Documents/Code/HTML/OurWorldSystem/src/lib/components/WorldMap.svelte:672) attaches D3 zoom in `onMount`.
- [src/lib/components/WorldMap.svelte](/Users/janmotal/Documents/Code/HTML/OurWorldSystem/src/lib/components/WorldMap.svelte:710) loads the map-unit registry in `onMount`.
- [src/lib/components/WorldMap.svelte](/Users/janmotal/Documents/Code/HTML/OurWorldSystem/src/lib/components/WorldMap.svelte:725) fetches base geometry in `onMount`; [line 770](/Users/janmotal/Documents/Code/HTML/OurWorldSystem/src/lib/components/WorldMap.svelte:770) fetches the disputed overlay.
- [src/lib/components/WorldMap.svelte](/Users/janmotal/Documents/Code/HTML/OurWorldSystem/src/lib/components/WorldMap.svelte:559) and [line 564](/Users/janmotal/Documents/Code/HTML/OurWorldSystem/src/lib/components/WorldMap.svelte:564) show the only explicit `resetZoom` and `fitToWorld` functions. They are called from the map controls and keyboard handler, not from layer/data reactivity.
- [src/routes/+page.svelte](/Users/janmotal/Documents/Code/HTML/OurWorldSystem/src/routes/+page.svelte:187) loads page data in `onMount`; [line 207](/Users/janmotal/Documents/Code/HTML/OurWorldSystem/src/routes/+page.svelte:207) reassigns `units` and [line 212](/Users/janmotal/Documents/Code/HTML/OurWorldSystem/src/routes/+page.svelte:212) resets selected unit to the first merged unit.
- [src/routes/+page.svelte](/Users/janmotal/Documents/Code/HTML/OurWorldSystem/src/routes/+page.svelte:231) renders `WorldMap` only after the loading/error branch. No `{#key}` block is used around `WorldMap`.
- [src/lib/components/LayerSelector.svelte](/Users/janmotal/Documents/Code/HTML/OurWorldSystem/src/lib/components/LayerSelector.svelte:24) only calls `onLayerChange(layer.id)`.
- [src/routes/+page.svelte](/Users/janmotal/Documents/Code/HTML/OurWorldSystem/src/routes/+page.svelte:43) only assigns `selectedLayer`; it does not alter `loading`, `units`, or a key.
- [svelte.config.js](/Users/janmotal/Documents/Code/HTML/OurWorldSystem/svelte.config.js:19) only switches `paths.base` between dev and production.
- [vite.config.ts](/Users/janmotal/Documents/Code/HTML/OurWorldSystem/vite.config.ts:4) uses default Vite/SvelteKit behavior. There is no custom HMR or file-watch configuration.

## Dev-Only Versus Production

`npm run validate:data`, `npm run check`, and `npm run build` all pass. The production build does not reveal a production-only remount/reset path.

The likely dev-only path is Vite HMR/full reload. The app has scripts that write watched static files:

- `npm run data:fetch:worldbank` writes `static/data/indicators/quality-of-life.world-bank.latest.json`.
- `npm run data:fetch:ucdp` writes `static/data/indicators/conflict.ucdp.latest.json`.
- `npm run geo:build` writes `static/geo/world.topojson` and `static/geo/disputed.topojson`.

If any of those scripts run while the dev server is open, Vite may reload the page. Source edits under `src/` can also recreate the component through HMR. A full browser reload or route remount will reload page data and recreate `WorldMap`, losing local zoom state.

In production, static files are not being regenerated by the browser app. The reset is therefore unlikely to happen spontaneously unless the page is reloaded, navigation remounts the route, or future application code explicitly recreates the map.

## Temporary Instrumentation Added

Diagnostics are added behind `DEBUG_MAP_LIFECYCLE = false` in:

- [src/routes/+page.svelte](/Users/janmotal/Documents/Code/HTML/OurWorldSystem/src/routes/+page.svelte:1)
- [src/lib/components/WorldMap.svelte](/Users/janmotal/Documents/Code/HTML/OurWorldSystem/src/lib/components/WorldMap.svelte:1)

Flip the flag to `true` in both files to inspect a reproduction. Logs use the searchable prefix:

```text
[OurWorldSystem:map-debug]
```

The instrumentation records page mount, page data load start/end, parent data assignment, indicator merge start/end, selected-layer changes, `WorldMap` mount/destroy, registry fetch start/end, geometry fetch start/end, path recomputation, render path-count changes, zoom initialization, zoom events, and programmatic reset/fit/transform traces.

Expected interpretation:

- `WorldMap destroy` followed by `WorldMap mount` with a new instance id means component recreation caused the zoom loss.
- `page mount` with a new page instance id means the route/page remounted, so parent state also reset.
- `geometry fetch start` without a preceding `WorldMap mount` would indicate an internal reload path; the current code should not produce that.
- `programmatic zoom transform applied` with a trace identifies an explicit reset/fit path.

## Suspected Root Cause

The exact reset mechanism is local D3 zoom state living inside `WorldMap`. The exact intermittent trigger is not proven without a captured log, but code inspection points away from selected-layer changes and toward dev/HMR or full route/page reloads.

In practical terms: `selectedLayer` changes should recolor existing paths, not remount or refetch. If the map visibly reloads and loses zoom, look for a simultaneous `WorldMap destroy`/`mount` pair or a browser reload. If that pair appears, the loss is expected from `currentTransform` being initialized inside the recreated component.

## Recommended Fix Strategy

Do not tie geometry loading or zoom reset to `selectedLayer`. Instead:

1. Preserve zoom transform outside `WorldMap`, either in the parent page or a small Svelte module/store, and pass it into `WorldMap`.
2. Update that persisted transform from D3 `zoom` events.
3. On `WorldMap` mount, reapply the persisted transform after attaching `zoomBehavior`, instead of always starting from identity.
4. Consider caching loaded TopoJSON/registry data at module level or moving static data loading into a SvelteKit load path if repeated fetches become visible during remounts.
5. Keep `resetZoom` and `fitToWorld` explicit user actions only.

## What Not To Do

- Do not add a `{#key selectedLayer}` block around `WorldMap`.
- Do not call `resetZoom` or `fitToWorld` from a selected-layer reactive statement.
- Do not refetch geometry when only map coloring changes.
- Do not hide the symptom by disabling controls or suppressing D3 zoom events.
- Do not treat world-system layer changes as a reason to recreate map geometry.
