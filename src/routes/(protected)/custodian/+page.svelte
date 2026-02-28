<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';

	onMount(() => {
		goto('/custodian/dashboard', { replaceState: true });
	});
</script>
