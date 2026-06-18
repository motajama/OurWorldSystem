<script lang="ts">
	type Props = {
		label: string;
		title?: string;
	};

	let { label, title = label }: Props = $props();
</script>

<span class="source-badge" {title}>{label}</span>

<style>
	.source-badge {
		display: inline-flex;
		align-items: center;
		min-height: 1.45rem;
		border: 1px solid rgba(148, 163, 184, 0.34);
		padding: 0.18rem 0.48rem;
		background: rgba(15, 23, 42, 0.78);
		color: #cbd5e1;
		font-size: 0.75rem;
		line-height: 1;
		white-space: nowrap;
	}
</style>
