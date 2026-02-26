<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { authStore } from '$lib/stores/auth';
	import { authApi, ApiErrorHandler } from '$lib/api/auth';
	import Button from '$lib/components/ui/Button.svelte';
	import Alert from '$lib/components/ui/Alert.svelte';
	import Input from '$lib/components/ui/Input.svelte';
	
	interface Props {
		isOpen: boolean;
		shortcutType: 'STAFF' | 'SUPERADMIN';
		onClose: () => void;
	}
	
	let { isOpen = $bindable(), shortcutType, onClose }: Props = $props();
	
	let isAuthenticating = $state(false);
	let error = $state<string | null>(null);
	let username = $state('');
	let password = $state('');
	
	const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.userAgent);
	
	const shortcutInfo = $derived({
		STAFF: {
			title: 'Staff Access',
			description: 'Instructor & Custodian Login',
			keys: isMac ? '⌘ + Shift + K' : 'Ctrl + Shift + K',
			color: 'blue'
		},
		SUPERADMIN: {
			title: 'Super Administrator',
			description: 'Superadmin Access',
			keys: isMac ? '⌘ + Shift + Alt + K' : 'Ctrl + Shift + Alt + K',
			color: 'purple'
		}
	}[shortcutType]);
	
	async function handleLogin(event: Event) {
		event.preventDefault();
		if (isAuthenticating) return;
		
		isAuthenticating = true;
		error = null;
		
		try {
			const response = await authApi.login({ username, password });
			
			// Verify user has appropriate role for the shortcut used
			const allowedRoles = shortcutType === 'SUPERADMIN' 
				? ['superadmin']
				: ['instructor', 'custodian', 'superadmin'];
			
			if (!allowedRoles.includes(response.user.role)) {
				throw new Error(`This access method is for ${shortcutType === 'SUPERADMIN' ? 'superadmin' : 'staff'} only`);
			}
			
			authStore.login(response);
			onClose();
			
			// Redirect based on role
			if (response.user.role === 'instructor') {
				goto('/instructor/dashboard');
			} else if (response.user.role === 'custodian') {
				goto('/custodian/dashboard');
			} else {
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
		}
	}
	
	// Handle ESC key to close modal
	function handleKeyDown(event: KeyboardEvent) {
		if (event.key === 'Escape' && !isAuthenticating) {
			onClose();
		}
	}
	
	onMount(() => {
		window.addEventListener('keydown', handleKeyDown);
		return () => window.removeEventListener('keydown', handleKeyDown);
	});
</script>

{#if isOpen}
	<!-- Backdrop -->
	<div
		class="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm transition-opacity"
		onclick={!isAuthenticating ? onClose : undefined}
		role="presentation"
	></div>
	
	<!-- Modal -->
	<div class="fixed inset-0 z-50 flex items-center justify-center p-4">
		<div
			class="relative w-full max-w-md transform rounded-2xl bg-white p-8 shadow-2xl transition-all"
			role="dialog"
			aria-modal="true"
			aria-labelledby="modal-title"
		>
			<!-- Close Button -->
			{#if !isAuthenticating}
				<button
					onclick={onClose}
					class="absolute right-4 top-4 rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
					aria-label="Close"
				>
					<svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
					</svg>
				</button>
			{/if}
			
			<!-- Content -->
			<div class="text-center">
				<!-- Icon -->
				<div class="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-{shortcutInfo.color}-100">
					<svg class="h-8 w-8 text-{shortcutInfo.color}-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"/>
					</svg>
				</div>
				
				<h2 id="modal-title" class="mb-2 text-2xl font-bold text-gray-900">
					{shortcutInfo.title}
				</h2>
				<p class="mb-4 text-sm text-gray-600">
					{shortcutInfo.description}
				</p>
				
				<!-- Shortcut Badge -->
				<div class="mb-6 inline-flex items-center rounded-full bg-gray-100 px-4 py-2">
					<svg class="mr-2 h-4 w-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/>
					</svg>
					<span class="font-mono text-sm font-medium text-gray-700">
						{shortcutInfo.keys}
					</span>
				</div>
				
				<!-- Authentication State -->
				{#if isAuthenticating}
					<div class="space-y-4">
						<svg 
							class="mx-auto h-12 w-12 animate-spin text-{shortcutInfo.color}-600" 
							xmlns="http://www.w3.org/2000/svg" 
							fill="none" 
							viewBox="0 0 24 24"
						>
							<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
							<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
						</svg>
						<p class="text-sm font-medium text-gray-900">Authenticating...</p>
						<p class="text-xs text-gray-500">Verifying your credentials</p>
					</div>
				{:else}
					<!-- Login Form -->
					<div class="space-y-4">
						{#if error}
							<Alert type="error">
								<p class="font-medium">Login Failed</p>
								<p class="mt-1 text-sm">{error}</p>
							</Alert>
						{/if}

						<form onsubmit={handleLogin} class="space-y-4 text-left">
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
								<Button variant="outline" fullWidth onclick={onClose} disabled={isAuthenticating}>
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
				
				<!-- Security Notice -->
				<div class="mt-6 rounded-lg bg-yellow-50 p-3">
					<div class="flex items-start text-left">
						<svg class="mr-2 mt-0.5 h-4 w-4 flex-shrink-0 text-yellow-600" fill="currentColor" viewBox="0 0 20 20">
							<path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/>
						</svg>
						<p class="text-xs text-yellow-800">
							This shortcut is for authorized staff only. Use your staff credentials to log in.
						</p>
					</div>
				</div>
			</div>
		</div>
	</div>
{/if}

<style>
	/* Prevent body scroll when modal is open */
	:global(body:has(dialog[open])) {
		overflow: hidden;
	}
</style>
