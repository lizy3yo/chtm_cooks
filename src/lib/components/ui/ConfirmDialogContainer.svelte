<script lang="ts">
	import { confirmStore } from '$lib/stores/confirm';
	import ConfirmDialog from './ConfirmDialog.svelte';
</script>

<!-- Confirmation Dialog Container - Fixed position, centered -->
{#each $confirmStore.dialogs as dialog (dialog.id)}
	<ConfirmDialog {dialog} />
{/each}
