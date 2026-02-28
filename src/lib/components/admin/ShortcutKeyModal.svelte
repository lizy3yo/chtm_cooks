<script lang="ts">
	import Button from '$lib/components/ui/Button.svelte';
	import StatusMessage from '$lib/components/ui/StatusMessage.svelte';

	interface Props {
		userId: string;
		userName: string;
		userRole: string;
		onClose: () => void;
		onSuccess: () => void;
	}

	let { userId, userName, userRole, onClose, onSuccess }: Props = $props();

	let loading = $state(false);
	let error = $state<string | null>(null);
	let success = $state<string | null>(null);
	let shortcutType = $state<'STAFF' | 'SUPERADMIN'>('STAFF');
	
	// Initialize shortcutType based on userRole
	$effect(() => {
		shortcutType = userRole === 'superadmin' ? 'SUPERADMIN' : 'STAFF';
	});
	let expiresInDays = $state<number | undefined>(undefined);
	let generatedKey = $state<string | null>(null);

	function getKeyboardShortcut() {
		const isMac = /Mac|iPhone|iPad|iPod/.test(navigator.userAgent);
		if (shortcutType === 'STAFF') {
			return isMac ? '⌘ + Shift + K' : 'Ctrl + Shift + K';
		} else {
			return isMac ? '⌘ + Shift + Alt + K' : 'Ctrl + Shift + Alt + K';
		}
	}

	async function createShortcutKey() {
		if (loading) return;

		loading = true;
		error = null;
		success = null;
		generatedKey = null;

		try {
			const response = await fetch('/api/shortcut-keys', {
				method: 'POST',
				credentials: 'include',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					userId,
					shortcutType,
					expiresInDays: expiresInDays || undefined
				})
			});

			const data = await response.json();

			if (!response.ok) {
				throw new Error(data.error || 'Failed to create shortcut key');
			}

			generatedKey = data.rawKey;
			success = 'Shortcut key created successfully! User can now use the keyboard shortcut to access the login form.';
			
			// Call success callback after a delay
			setTimeout(() => {
				onSuccess();
			}, 2000);
		} catch (err: any) {
			error = err.message || 'An error occurred while creating the shortcut key';
		} finally {
			loading = false;
		}
	}
</script>

<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
	<div class="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
		<!-- Header -->
		<div class="flex items-center justify-between">
			<h3 class="text-2xl font-bold text-gray-900">Create Shortcut Key</h3>
			<button
				onclick={onClose}
				class="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
			>
				<svg class="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
				</svg>
			</button>
		</div>

		<p class="mt-2 text-sm text-gray-600">
			Create a shortcut key for <strong>{userName}</strong> to enable quick keyboard-based authentication.
		</p>

		<!-- Messages -->
		{#if error}
			<div class="mt-4">
				<StatusMessage type="error" title="Error" message={error} />
			</div>
		{/if}

		{#if success}
			<div class="mt-4">
				<StatusMessage type="success" title="Success" message={success} />
			</div>
		{/if}

		{#if generatedKey}
			<div class="mt-4 rounded-lg bg-blue-50 p-4">
				<p class="text-sm font-medium text-blue-900">Generated Key (For Reference)</p>
				<code class="mt-2 block break-all rounded bg-blue-100 p-2 text-xs text-blue-800">
					{generatedKey}
				</code>
				<p class="mt-2 text-xs text-blue-700">
					<strong>Note:</strong> This key is stored securely. The user can now press the keyboard shortcut to access the login form.
				</p>
			</div>
		{/if}

		{#if !generatedKey}
			<div class="mt-6 space-y-4">
				<!-- Shortcut Type -->
				<div>
					<label class="block text-sm font-medium text-gray-700">Shortcut Type</label>
					<select
						bind:value={shortcutType}
						disabled={userRole === 'superadmin' || ['instructor', 'custodian'].includes(userRole)}
						class="mt-1 w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-200 disabled:bg-gray-100 disabled:cursor-not-allowed"
					>
						<option value="STAFF">Staff Access (Instructor/Custodian)</option>
						<option value="SUPERADMIN">Super Administrator</option>
					</select>
					<p class="mt-1 text-xs text-gray-500">
						Keyboard shortcut: {getKeyboardShortcut()}
					</p>
				</div>

				<!-- Expiration -->
				<div>
					<label class="block text-sm font-medium text-gray-700">Expires In (Optional)</label>
					<select
						bind:value={expiresInDays}
						class="mt-1 w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-200"
					>
						<option value={undefined}>Never</option>
						<option value={30}>30 days</option>
						<option value={90}>90 days</option>
						<option value={180}>180 days</option>
						<option value={365}>1 year</option>
					</select>
					<p class="mt-1 text-xs text-gray-500">
						Leave as "Never" for permanent access
					</p>
				</div>

				<!-- Info Notice -->
				<div class="rounded-lg bg-blue-50 p-4">
					<div class="flex">
						<svg class="h-5 w-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
						</svg>
						<div class="ml-3">
							<p class="text-sm font-medium text-blue-800">Quick Access Shortcut</p>
							<p class="mt-1 text-xs text-blue-700">
								The user will press the keyboard shortcut to quickly access the login form. They will still need to enter their username and password.
							</p>
						</div>
					</div>
				</div>

				<!-- Role Verification -->
				<div class="rounded-lg bg-gray-50 p-4">
					<p class="text-sm text-gray-700">
						<strong>User Role:</strong> <span class="capitalize">{userRole}</span>
					</p>
					{#if userRole === 'superadmin' && shortcutType !== 'SUPERADMIN'}
						<p class="mt-1 text-xs text-red-600">
							⚠️ Superadmin users require SUPERADMIN shortcut type
						</p>
					{/if}
					{#if (userRole === 'instructor' || userRole === 'custodian') && shortcutType !== 'STAFF'}
						<p class="mt-1 text-xs text-red-600">
							⚠️ Instructor/Custodian users require STAFF shortcut type
						</p>
					{/if}
				</div>
			</div>

			<!-- Actions -->
			<div class="mt-6 flex gap-3">
				<Button
					variant="outline"
					fullWidth
					onclick={onClose}
					disabled={loading}
				>
					Cancel
				</Button>
				<Button
					fullWidth
					onclick={createShortcutKey}
					disabled={loading}
				>
					{loading ? 'Creating...' : 'Create Shortcut Key'}
				</Button>
			</div>
		{:else}
			<div class="mt-6">
				<Button
					fullWidth
					onclick={onClose}
				>
					Close
				</Button>
			</div>
		{/if}
	</div>
</div>
