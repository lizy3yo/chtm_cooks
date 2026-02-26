<script lang="ts">
	import { onMount } from 'svelte';
	import { accessToken } from '$lib/stores/auth';
	import Button from '$lib/components/ui/Button.svelte';
	import Input from '$lib/components/ui/Input.svelte';
	import StatusMessage from '$lib/components/ui/StatusMessage.svelte';
	
	interface User {
		id: string;
		email: string;
		role: string;
		firstName: string;
		lastName: string;
		isActive: boolean;
	}
	
	interface Props {
		user: User;
		onClose: () => void;
		onSuccess: () => void;
	}
	
	let { user, onClose, onSuccess }: Props = $props();
	
	let formData = $state({
		firstName: user.firstName,
		lastName: user.lastName,
		role: user.role as 'instructor' | 'custodian' | 'superadmin',
		isActive: user.isActive
	});
	
	let errors = $state<Record<string, string>>({});
	let isSubmitting = $state(false);
	let apiError = $state<string | null>(null);
	
	function validate(): boolean {
		const newErrors: Record<string, string> = {};
		
		if (!formData.firstName) {
			newErrors.firstName = 'First name is required';
		}
		
		if (!formData.lastName) {
			newErrors.lastName = 'Last name is required';
		}
		
		errors = newErrors;
		return Object.keys(newErrors).length === 0;
	}
	
	async function handleSubmit(event: Event) {
		event.preventDefault();
		apiError = null;
		
		if (!validate()) return;
		
		isSubmitting = true;
		
		try {
			const response = await fetch(`/api/users?userId=${user.id}`, {
				method: 'PATCH',
				headers: {
					'Content-Type': 'application/json',
					'Authorization': `Bearer ${$accessToken}`
				},
				body: JSON.stringify(formData)
			});
			
			const data = await response.json();
			
			if (!response.ok) {
				throw new Error(data.error || 'Failed to update user');
			}
			
			onSuccess();
			onClose();
		} catch (err: any) {
			apiError = err.message;
		} finally {
			isSubmitting = false;
		}
	}
	
	function handleKeyDown(event: KeyboardEvent) {
		if (event.key === 'Escape' && !isSubmitting) {
			onClose();
		}
	}
	
	onMount(() => {
		window.addEventListener('keydown', handleKeyDown);
		return () => window.removeEventListener('keydown', handleKeyDown);
	});
</script>

<!-- Backdrop -->
<div
	class="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
	onclick={!isSubmitting ? onClose : undefined}
	role="presentation"
></div>

<!-- Modal -->
<div class="fixed inset-0 z-50 flex items-center justify-center p-4">
	<div
		class="relative w-full max-w-2xl transform rounded-2xl bg-white p-8 shadow-2xl"
		role="dialog"
		aria-modal="true"
	>
		<!-- Close Button -->
		{#if !isSubmitting}
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
		
		<!-- Header -->
		<div class="mb-6">
			<h2 class="text-2xl font-bold text-gray-900">Edit User</h2>
			<p class="mt-1 text-sm text-gray-600">
				Update user information for {user.email}
			</p>
		</div>
		
		<!-- Form -->
		<form onsubmit={handleSubmit} class="space-y-6">
			{#if apiError}
				<StatusMessage type="error" title="Error" message={apiError} />
			{/if}
			
			<!-- Role Selection -->
			<div>
				<label class="mb-2 block text-sm font-medium text-gray-700">
					Role <span class="text-red-500">*</span>
				</label>
				<div class="grid grid-cols-3 gap-3">
					<label class="relative flex cursor-pointer items-center justify-center rounded-lg border-2 p-4 transition-all {formData.role === 'instructor' ? 'border-blue-600 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}">
						<input
							type="radio"
							bind:group={formData.role}
							value="instructor"
							class="sr-only"
						/>
						<div class="text-center">
							<svg class="mx-auto h-8 w-8 {formData.role === 'instructor' ? 'text-blue-600' : 'text-gray-400'}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/>
							</svg>
							<p class="mt-2 text-sm font-medium {formData.role === 'instructor' ? 'text-blue-900' : 'text-gray-700'}">
								Instructor
							</p>
						</div>
					</label>
					
					<label class="relative flex cursor-pointer items-center justify-center rounded-lg border-2 p-4 transition-all {formData.role === 'custodian' ? 'border-green-600 bg-green-50' : 'border-gray-200 hover:border-gray-300'}">
						<input
							type="radio"
							bind:group={formData.role}
							value="custodian"
							class="sr-only"
						/>
						<div class="text-center">
							<svg class="mx-auto h-8 w-8 {formData.role === 'custodian' ? 'text-green-600' : 'text-gray-400'}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/>
							</svg>
							<p class="mt-2 text-sm font-medium {formData.role === 'custodian' ? 'text-green-900' : 'text-gray-700'}">
								Custodian
							</p>
						</div>
					</label>
					
					<label class="relative flex cursor-pointer items-center justify-center rounded-lg border-2 p-4 transition-all {formData.role === 'superadmin' ? 'border-purple-600 bg-purple-50' : 'border-gray-200 hover:border-gray-300'}">
						<input
							type="radio"
							bind:group={formData.role}
							value="superadmin"
							class="sr-only"
						/>
						<div class="text-center">
							<svg class="mx-auto h-8 w-8 {formData.role === 'superadmin' ? 'text-purple-600' : 'text-gray-400'}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/>
							</svg>
							<p class="mt-2 text-sm font-medium {formData.role === 'superadmin' ? 'text-purple-900' : 'text-gray-700'}">
								Superadmin
							</p>
						</div>
					</label>
				</div>
			</div>
			
			<!-- Name Fields -->
			<div class="grid gap-4 sm:grid-cols-2">
				<Input
					id="firstName"
					label="First Name"
					placeholder="John"
					bind:value={formData.firstName}
					error={errors.firstName}
					required
					disabled={isSubmitting}
				/>
				
				<Input
					id="lastName"
					label="Last Name"
					placeholder="Doe"
					bind:value={formData.lastName}
					error={errors.lastName}
					required
					disabled={isSubmitting}
				/>
			</div>
			
			<!-- Status Toggle -->
			<div class="flex items-center justify-between rounded-lg border border-gray-200 p-4">
				<div>
					<p class="font-medium text-gray-900">Account Status</p>
					<p class="text-sm text-gray-600">
						{formData.isActive ? 'Account is active' : 'Account is deactivated'}
					</p>
				</div>
				<label class="relative inline-flex cursor-pointer items-center">
					<input
						type="checkbox"
						bind:checked={formData.isActive}
						class="peer sr-only"
						disabled={isSubmitting}
					/>
					<div class="peer h-6 w-11 rounded-full bg-gray-200 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-blue-600 peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300"></div>
				</label>
			</div>
			
			<!-- Actions -->
			<div class="flex gap-3 border-t pt-6">
				<Button
					type="button"
					variant="outline"
					fullWidth
					onclick={onClose}
					disabled={isSubmitting}
				>
					Cancel
				</Button>
				<Button
					type="submit"
					variant="primary"
					fullWidth
					loading={isSubmitting}
				>
					Save Changes
				</Button>
			</div>
		</form>
	</div>
</div>
