<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { authStore } from '$lib/stores/auth';
	import { authApi, ApiErrorHandler } from '$lib/api/auth';
	import AuthLayout from '$lib/components/auth/AuthLayout.svelte';
	import Alert from '$lib/components/ui/Alert.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Input from '$lib/components/ui/Input.svelte';
	
	// State
	let isListening = $state(true);
	let pressedKeys = $state<Set<string>>(new Set());
	let error = $state<string | null>(null);
	let isAuthenticating = $state(false);
	let showHints = $state(false);
	let showLoginForm = $state(false);
	let activeShortcutType = $state<'STAFF' | 'SUPERADMIN' | null>(null);
	
	// Form fields
	let username = $state('');
	let password = $state('');
	
	// Shortcut definitions
	const SHORTCUTS = {
		STAFF: {
			keys: ['Control', 'Shift', 'K'],
			macKeys: ['Meta', 'Shift', 'K'],
			display: 'Ctrl + Shift + K',
			macDisplay: '⌘ + Shift + K',
			roles: ['instructor', 'custodian'],
			description: 'Instructor & Custodian Access'
		},
		SUPERADMIN: {
			keys: ['Control', 'Shift', 'Alt', 'K'],
			macKeys: ['Meta', 'Shift', 'Alt', 'K'],
			display: 'Ctrl + Shift + Alt + K',
			macDisplay: '⌘ + Shift + Alt + K',
			roles: ['superadmin'],
			description: 'Super Administrator Access'
		}
	};
	
	const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.userAgent);
	
	// Check if shortcut matches
	function checkShortcut(keys: Set<string>): 'STAFF' | 'SUPERADMIN' | null {
		const keysArray = Array.from(keys);
		
		// Check super admin (4 keys)
		const superadminKeys = isMac ? SHORTCUTS.SUPERADMIN.macKeys : SHORTCUTS.SUPERADMIN.keys;
		if (keysArray.length === superadminKeys.length &&
			superadminKeys.every(key => keysArray.includes(key))) {
			return 'SUPERADMIN';
		}
		
		// Check staff (3 keys)
		const staffKeys = isMac ? SHORTCUTS.STAFF.macKeys : SHORTCUTS.STAFF.keys;
		if (keysArray.length === staffKeys.length &&
			staffKeys.every(key => keysArray.includes(key))) {
			return 'STAFF';
		}
		
		return null;
	}
	
	// Handle authentication
	function showLoginFormForShortcut(shortcutType: 'STAFF' | 'SUPERADMIN') {
		activeShortcutType = shortcutType;
		showLoginForm = true;
		error = null;
		username = '';
		password = '';
	}
	
	async function handleLogin(event: Event) {
		event.preventDefault();
		if (isAuthenticating) return;
		
		isAuthenticating = true;
		error = null;
		
		try {
			const response = await authApi.login({ username, password });
			
			// Verify user has appropriate role for the shortcut used
			const allowedRoles = activeShortcutType === 'SUPERADMIN' 
				? ['superadmin']
				: ['instructor', 'custodian', 'superadmin'];
			
			if (!allowedRoles.includes(response.user.role)) {
				throw new Error(`This access method is for ${activeShortcutType === 'SUPERADMIN' ? 'superadmin' : 'staff'} only`);
			}
			
			authStore.login(response.user);
			
			// Redirect based on role
			if (response.user.role === 'instructor') {
				goto('/instructor/dashboard');
			} else if (response.user.role === 'custodian') {
				goto('/custodian/dashboard');
			} else if (response.user.role === 'superadmin') {
				goto('/admin/dashboard');
			}
		} catch (err) {
			if (err instanceof ApiErrorHandler) {
				error = err.message;
			} else if (err instanceof Error) {
				error = err.message;
			} else {
				error = 'Authentication failed. Please check your credentials.';
			}
		} finally {
			isAuthenticating = false;
			pressedKeys.clear();
		}
	}
	
	// Keyboard event handlers
	function handleKeyDown(event: KeyboardEvent) {
		if (!isListening || isAuthenticating || showLoginForm) return;
		
		// Add key to pressed set
		pressedKeys.add(event.key);
		
		// Check for shortcut match
		const matchedShortcut = checkShortcut(pressedKeys);
		if (matchedShortcut) {
			event.preventDefault();
			showLoginFormForShortcut(matchedShortcut);
		}
		
		// Clear if too many keys pressed
		if (pressedKeys.size > 4) {
			pressedKeys.clear();
		}
	}
	
	function handleKeyUp(event: KeyboardEvent) {
		// Remove key from pressed set
		pressedKeys.delete(event.key);
	}
	
	// Setup and cleanup
	onMount(() => {
		window.addEventListener('keydown', handleKeyDown);
		window.addEventListener('keyup', handleKeyUp);
		
		return () => {
			window.removeEventListener('keydown', handleKeyDown);
			window.removeEventListener('keyup', handleKeyUp);
		};
	});
</script>

<svelte:head>
	<title>Staff & Admin Access - CHTM Cooks</title>
</svelte:head>

<AuthLayout
	title="Staff & Admin Access"
	subtitle="Use your assigned keyboard shortcut to access the system"
>
	{#snippet children()}
		<div class="space-y-6">
			<!-- Error Alert (outside form) -->
			{#if error && !showLoginForm}
				<Alert type="error" dismissible onDismiss={() => error = null}>
					<p class="font-medium">Access Denied</p>
					<p class="mt-1">{error}</p>
				</Alert>
			{/if}

			<!-- Instructions -->
			{#if !showLoginForm}
				<div class="rounded-lg bg-blue-50 p-6 text-center">
					<div class="flex flex-col items-center space-y-4">
						<svg class="h-12 w-12 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"/>
						</svg>
						<div>
							<p class="text-lg font-medium text-blue-900">Press Your Access Key</p>
							<p class="mt-1 text-sm text-blue-700">
								Use your assigned keyboard shortcut to show the login form
							</p>
						</div>
						
						<!-- Pressed Keys Indicator -->
						{#if pressedKeys.size > 0}
							<div class="mt-4 flex items-center space-x-2">
								<span class="text-xs font-medium text-blue-700">Pressed:</span>
								<div class="flex space-x-1">
									{#each Array.from(pressedKeys) as key}
										<span class="inline-flex items-center rounded bg-blue-200 px-2 py-1 text-xs font-medium text-blue-900">
											{key}
										</span>
									{/each}
								</div>
							</div>
						{/if}
					</div>
				</div>
			{/if}

			<!-- Login Form (shown when shortcut is pressed) -->
			{#if showLoginForm}
				<div class="rounded-lg border-2 border-blue-500 bg-white p-6 shadow-lg">
					<div class="mb-4 text-center">
						<div class="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-blue-100">
							<svg class="h-6 w-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"/>
							</svg>
						</div>
						<h2 class="text-xl font-bold text-gray-900">
							{activeShortcutType === 'SUPERADMIN' ? 'Super Administrator' : 'Staff'} Login
						</h2>
						<p class="mt-1 text-sm text-gray-600">
							Enter your credentials to continue
						</p>
					</div>

					<!-- Error Alert (inside form) -->
					{#if error}
						<Alert type="error" dismissible onDismiss={() => error = null}>
							<p class="font-medium">Login Failed</p>
							<p class="mt-1">{error}</p>
						</Alert>
					{/if}

					<form onsubmit={handleLogin} class="mt-6 space-y-4">
						<Input
							type="text"
							label="Username"
							bind:value={username}
							placeholder="Enter your username"
							disabled={isAuthenticating}
							required
							autocomplete="username"
						/>

						<Input
							type="password"
							label="Password"
							bind:value={password}
							placeholder="Enter your password"
							disabled={isAuthenticating}
							required
							autocomplete="current-password"
						/>

						<div class="flex gap-3 pt-2">
							<Button
								type="button"
								variant="outline"
								fullWidth
								onclick={() => {
									showLoginForm = false;
									activeShortcutType = null;
									username = '';
									password = '';
									error = null;
								}}
								disabled={isAuthenticating}
							>
								Cancel
							</Button>
							<Button
								type="submit"
								variant="primary"
								fullWidth
								disabled={isAuthenticating || !username || !password}
								loading={isAuthenticating}
							>
								{isAuthenticating ? 'Logging in...' : 'Login'}
							</Button>
						</div>
					</form>
				</div>
			{/if}

			<!-- Show Hints Button -->
			<div class="text-center">
				<button
					type="button"
					onclick={() => showHints = !showHints}
					class="text-sm font-medium text-blue-600 hover:text-blue-500"
				>
					{showHints ? 'Hide' : 'Show'} Keyboard Shortcuts
				</button>
			</div>

			<!-- Hints -->
			{#if showHints}
				<div class="space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-4">
					<p class="text-xs font-medium uppercase tracking-wide text-gray-500">
						Available Shortcuts
					</p>
					
					{#each Object.values(SHORTCUTS) as shortcut}
						<div class="flex items-center justify-between rounded-lg bg-white p-3 shadow-sm">
							<div>
								<p class="text-sm font-medium text-gray-900">{shortcut.description}</p>
								<p class="text-xs text-gray-500">Press to open login form</p>
							</div>
							<div class="rounded-md bg-gray-100 px-3 py-1.5 font-mono text-sm text-gray-700">
								{isMac ? shortcut.macDisplay : shortcut.display}
							</div>
						</div>
					{/each}
				</div>
			{/if}

			<!-- Security Notice -->
			<div class="rounded-lg border border-yellow-200 bg-yellow-50 p-4">
				<div class="flex">
					<svg class="h-5 w-5 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
						<path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/>
					</svg>
					<div class="ml-3">
						<p class="text-sm font-medium text-yellow-800">Security Notice</p>
						<p class="mt-1 text-xs text-yellow-700">
							This page is for authorized staff only. Use your staff credentials to log in.
						</p>
					</div>
				</div>
			</div>

			<!-- Back to Regular Login -->
			<div class="border-t border-gray-200 pt-4">
				<Button
					variant="outline"
					fullWidth
					onclick={() => goto('/auth/login')}
				>
					Back to Student Login
				</Button>
			</div>
		</div>
	{/snippet}

	{#snippet footer()}
		<p class="text-xs text-gray-500">
			For access issues, contact the system administrator
		</p>
	{/snippet}
</AuthLayout>
