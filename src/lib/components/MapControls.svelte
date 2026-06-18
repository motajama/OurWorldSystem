<script lang="ts">
	type Props = {
		zoomPercent: number;
		canZoomIn: boolean;
		canZoomOut: boolean;
		canReset: boolean;
		canFit: boolean;
		onZoomIn: () => void;
		onZoomOut: () => void;
		onReset: () => void;
		onFit: () => void;
	};

	let {
		zoomPercent,
		canZoomIn,
		canZoomOut,
		canReset,
		canFit,
		onZoomIn,
		onZoomOut,
		onReset,
		onFit
	}: Props = $props();
</script>

<div class="map-controls" aria-label="Map navigation controls">
	<div class="button-group">
		<button type="button" aria-label="Zoom in" disabled={!canZoomIn} onclick={onZoomIn}>+</button>
		<button type="button" aria-label="Zoom out" disabled={!canZoomOut} onclick={onZoomOut}>−</button>
		<button type="button" aria-label="Reset view" disabled={!canReset} onclick={onReset}>⟲</button>
		<button type="button" aria-label="Fit to world" disabled={!canFit} onclick={onFit}>⛶</button>
	</div>
	<p class="zoom-status" aria-live="polite">Zoom {zoomPercent}%</p>
</div>

<style>
	.map-controls {
		position: absolute;
		z-index: 2;
		top: 0.75rem;
		left: 0.75rem;
		display: grid;
		gap: 0.45rem;
		color: #e2e8f0;
		pointer-events: auto;
	}

	.button-group {
		display: inline-flex;
		width: max-content;
		overflow: hidden;
		border: 1px solid rgba(148, 163, 184, 0.42);
		background: rgba(2, 6, 23, 0.88);
		box-shadow: 0 14px 28px rgba(2, 6, 23, 0.32);
	}

	button {
		display: grid;
		width: 2.25rem;
		height: 2.25rem;
		place-items: center;
		border: 0;
		border-right: 1px solid rgba(148, 163, 184, 0.26);
		background: transparent;
		color: #f8fafc;
		font: inherit;
		font-size: 1.05rem;
		line-height: 1;
		cursor: pointer;
	}

	button:last-child {
		border-right: 0;
	}

	button:hover:not(:disabled),
	button:focus-visible {
		background: rgba(14, 116, 144, 0.36);
		color: #ffffff;
	}

	button:focus-visible {
		outline: 2px solid #67e8f9;
		outline-offset: -2px;
	}

	button:disabled {
		color: #64748b;
		cursor: not-allowed;
	}

	.zoom-status {
		width: max-content;
		margin: 0;
		border: 1px solid rgba(148, 163, 184, 0.28);
		background: rgba(2, 6, 23, 0.78);
		padding: 0.24rem 0.45rem;
		color: #cbd5e1;
		font-size: 0.75rem;
		line-height: 1.2;
	}

	@media (max-width: 560px) {
		.map-controls {
			top: 0.55rem;
			left: 0.55rem;
		}

		button {
			width: 2.05rem;
			height: 2.05rem;
		}
	}
</style>
