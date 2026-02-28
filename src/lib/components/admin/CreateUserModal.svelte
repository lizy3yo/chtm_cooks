<script lang="ts">
	import { onMount } from 'svelte';
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
		emailVerified: boolean;
		createdAt: string;
		lastLogin?: string;
	}
	
	interface Props {
		onClose: () => void;
		onSuccess: () => void;
	}
	
	let { onClose, onSuccess }: Props = $props();
	
	let formData = $state({
		email: '',
		password: '',
		confirmPassword: '',
		role: 'instructor' as 'instructor' | 'custodian' | 'superadmin',
		firstName: '',
		lastName: ''
	});
	
	let errors = $state<Record<string, string>>({});
	let isSubmitting = $state(false);
	let apiError = $state<string | null>(null);
	let showPassword = $state(false);
	
	function validate(): boolean {
		const newErrors: Record<string, string> = {};
		
		if (!formData.email) {
			newErrors.email = 'Email is required';
		} else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
			newErrors.email = 'Invalid email format';
		}
		
		if (!formData.password) {
			newErrors.password = 'Password is required';
		} else if (formData.password.length < 8) {
			newErrors.password = 'Password must be at least 8 characters';
		}
		
		if (formData.password !== formData.confirmPassword) {
			newErrors.confirmPassword = 'Passwords do not match';
		}
		
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
			const response = await fetch('/api/users', {
				method: 'POST',
				credentials: 'include',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					email: formData.email,
					password: formData.password,
					role: formData.role,
					firstName: formData.firstName,
					lastName: formData.lastName
				})
			});
			
			const data = await response.json();
			
			if (!response.ok) {
				throw new Error(data.error || 'Failed to create user');
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
			<h2 class="text-2xl font-bold text-gray-900">Create New User</h2>
			<p class="mt-1 text-sm text-gray-600">
				Add a new instructor, custodian, or superadmin to the system
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
			
			<!-- Email -->
			<Input
				id="email"
				type="email"
				label="Email Address"
				placeholder="user@example.com"
				bind:value={formData.email}
				error={errors.email}
				required
				autocomplete="off"
				disabled={isSubmitting}
			/>
			
			<!-- Password Fields -->
			<div class="grid gap-4 sm:grid-cols-2">
				<Input
					id="password"
					type={showPassword ? 'text' : 'password'}
					label="Password"
					placeholder="Min. 8 characters"
					bind:value={formData.password}
					error={errors.password}
					required
					autocomplete="new-password"
					disabled={isSubmitting}
				/>
				
				<Input
					id="confirmPassword"
					type={showPassword ? 'text' : 'password'}
					label="Confirm Password"
					placeholder="Re-enter password"
					bind:value={formData.confirmPassword}
					error={errors.confirmPassword}
					required
					autocomplete="new-password"
					disabled={isSubmitting}
				/>
			</div>
			
			<label class="flex items-center">
				<input
					type="checkbox"
					bind:checked={showPassword}
					class="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
				/>
				<span class="ml-2 text-sm text-gray-600">Show passwords</span>
			</label>
			
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
					Create User
				</Button>
			</div>
		</form>
	</div>
</div>
