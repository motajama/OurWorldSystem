<script lang="ts">
	import favicon from '$lib/assets/favicon.svg';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<meta
		name="description"
		content="OurWorldSystem is a transparent static atlas of world-system map units, uncertainty, and data provenance."
	/>
</svelte:head>

{@render children()}

<style>
	:global(*) {
		box-sizing: border-box;
	}

	:global(html) {
		background: #020617;
		color: #e2e8f0;
		font-family:
			Inter,
			ui-sans-serif,
			system-ui,
			-apple-system,
			BlinkMacSystemFont,
			'Segoe UI',
			sans-serif;
	}

	:global(body) {
		margin: 0;
		min-width: 320px;
		background:
			linear-gradient(rgba(2, 6, 23, 0.92), rgba(2, 6, 23, 0.98)),
			radial-gradient(circle at 20% 0%, rgba(14, 116, 144, 0.22), transparent 36%), #020617;
	}

	:global(a) {
		color: #93c5fd;
	}

	:global(button),
	:global(input),
	:global(select),
	:global(textarea) {
		font: inherit;
	}
</style>
