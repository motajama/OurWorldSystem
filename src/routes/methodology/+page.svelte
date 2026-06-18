<script lang="ts">
	import { resolve } from '$app/paths';
</script>

<svelte:head>
	<title>Methodology · OurWorldSystem</title>
</svelte:head>

<main class="methodology">
	<a href={resolve('/')}>Back to atlas</a>
	<h1>Methodology</h1>
	<p>
		OurWorldSystem treats world-system classes as transparent model outputs, not moral judgments or
		permanent labels. The scaffold currently uses mock data only.
	</p>
	<p>
		Future versions should combine open public indicators, source years, reproducible scripts, and
		explicit uncertainty. Disputed or ambiguous sovereignty cases are represented neutrally as map
		units with notes and source attribution.
	</p>
</main>

<style>
	.methodology {
		max-width: 56rem;
		margin: 0 auto;
		padding: clamp(1.5rem, 5vw, 4rem);
	}

	a {
		color: #93c5fd;
	}

	h1 {
		margin: 2rem 0 1rem;
		color: #f8fafc;
		font-size: clamp(2.2rem, 7vw, 4.5rem);
		line-height: 1;
		letter-spacing: 0;
	}

	p {
		color: #cbd5e1;
		font-size: 1.05rem;
		line-height: 1.7;
	}
</style>
