<script lang="ts">
	import { onMount } from 'svelte';
	import { authStore, isAuthenticated } from '$lib/stores/auth';
	import ShortcutKeyModal from '$lib/components/auth/ShortcutKeyModal.svelte';
	import './layout.css';
	import favicon from '$lib/assets/CHTM_LOGO.png';

	let { children } = $props();
	
	// Modal state
	let showStaffModal = $state(false);
	let showSuperadminModal = $state(false);
	let pressedKeys = $state<Set<string>>(new Set());
	
	const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.userAgent);
	
	// Keyboard shortcut definitions
	const SHORTCUTS = {
		STAFF: isMac ? ['Meta', 'Shift', 'K'] : ['Control', 'Shift', 'K'],
		SUPERADMIN: isMac ? ['Meta', 'Shift', 'Alt', 'K'] : ['Control', 'Shift', 'Alt', 'K']
	};
	
	// Check if shortcut matches
	function checkShortcut(keys: Set<string>): 'STAFF' | 'SUPERADMIN' | null {
		const keysArray = Array.from(keys);
		
		// Check superadmin (4 keys)
		if (keysArray.length === SHORTCUTS.SUPERADMIN.length &&
			SHORTCUTS.SUPERADMIN.every(key => keysArray.includes(key))) {
			return 'SUPERADMIN';
		}
		
		// Check staff (3 keys)
		if (keysArray.length === SHORTCUTS.STAFF.length &&
			SHORTCUTS.STAFF.every(key => keysArray.includes(key))) {
			return 'STAFF';
		}
		
		return null;
	}
	
	// Keyboard event handlers
	function handleKeyDown(event: KeyboardEvent) {
		// Don't trigger if user is already authenticated
		if ($isAuthenticated) return;
		
		// Don't trigger if user is typing in an input
		if (event.target instanceof HTMLInputElement || 
		    event.target instanceof HTMLTextAreaElement) {
			return;
		}
		
		// Add key to pressed set
		pressedKeys.add(event.key);
		
		// Check for shortcut match
		const matchedShortcut = checkShortcut(pressedKeys);
		if (matchedShortcut) {
			event.preventDefault();
			
			if (matchedShortcut === 'STAFF') {
				showStaffModal = true;
			} else if (matchedShortcut === 'SUPERADMIN') {
				showSuperadminModal = true;
			}
			
			pressedKeys.clear();
		}
		
		// Clear if too many keys pressed
		if (pressedKeys.size > 4) {
			pressedKeys.clear();
		}
	}
	
	function handleKeyUp(event: KeyboardEvent) {
		pressedKeys.delete(event.key);
	}
	
	// Initialize on mount
	onMount(() => {
		authStore.init();
		
		// Add keyboard listeners
		window.addEventListener('keydown', handleKeyDown);
		window.addEventListener('keyup', handleKeyUp);
		
		return () => {
			window.removeEventListener('keydown', handleKeyDown);
			window.removeEventListener('keyup', handleKeyUp);
		};
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<meta name="viewport" content="width=device-width, initial-scale=1.0" />
	<meta name="description" content="CHTM Cooks - Student and Staff Portal" />
</svelte:head>

{@render children()}

<!-- Shortcut Key Modals -->
<ShortcutKeyModal 
	bind:isOpen={showStaffModal} 
	shortcutType="STAFF"
	onClose={() => showStaffModal = false}
/>

<ShortcutKeyModal 
	bind:isOpen={showSuperadminModal} 
	shortcutType="SUPERADMIN"
	onClose={() => showSuperadminModal = false}
/>
