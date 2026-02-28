<script lang="ts">
	import { goto } from '$app/navigation';
	import { tick } from 'svelte';
	import { authStore } from '$lib/stores/auth';
	import { toastStore } from '$lib/stores/toast';
	import { authApi, ApiErrorHandler } from '$lib/api/auth';
	import AuthLayout from '$lib/components/auth/AuthLayout.svelte';
	import Input from '$lib/components/ui/Input.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import type { LoginRequest } from '$lib/types/auth';
	
	// Form state - use separate $state variables for proper binding
	let email = $state('');
	let password = $state('');
	let rememberMe = $state(false);
	
	let errors = $state<Record<string, string>>({});
	let isSubmitting = $state(false);
	let showPassword = $state(false);
	
	// Handle form submission
	async function handleSubmit(event: Event) {
		event.preventDefault();
		
		isSubmitting = true;
		
		try {
			const formData: LoginRequest = {
				email,
				password,
				rememberMe
			};
			
			// Login - tokens automatically set in httpOnly cookies
			const response = await authApi.login(formData);
			
			console.log('[Login] Full response:', response);
			console.log('[Login] response.user:', response.user);
			console.log('[Login] Calling authStore.login with:', response.user);
			
			// Update auth store with ONLY the user object
			authStore.login(response.user);
			
			// Wait for Svelte to process the store update
			await tick();
			
			// Redirect based on role
			if (response.user.role === 'student') {
				goto('/student/dashboard');
			} else if (response.user.role === 'instructor') {
				goto('/instructor/dashboard');
			} else if (response.user.role === 'custodian') {
				goto('/custodian/dashboard');
			} else {
				goto('/admin/dashboard');
			}
		} catch (error) {
			if (error instanceof ApiErrorHandler) {
				toastStore.error(error.message, 'Login Failed');
			} else {
				toastStore.error('An unexpected error occurred. Please try again.', 'Login Failed');
			}
		} finally {
			isSubmitting = false;
		}
	}
</script>

<svelte:head>
	<title>Sign In - CHTM Cooks</title>
</svelte:head>

<AuthLayout
	title="Welcome Back"
	subtitle="Sign in to your account"
>
	{#snippet children()}
		<form onsubmit={handleSubmit} class="space-y-6" novalidate>
			<!-- Email Input -->
			<Input
				id="email"
				type="email"
				label="Email Address"
				placeholder="your.email@gordoncollege.edu.ph"
				bind:value={email}
				required
				autocomplete="email"
				disabled={isSubmitting}
			/>

			<!-- Password Input -->
			<div>
				<Input
					id="password"
					type={showPassword ? 'text' : 'password'}
					label="Password"
					placeholder="Enter your password"
					bind:value={password}
					required
					autocomplete="current-password"
					disabled={isSubmitting}
				/>
				
				<div class="mt-4 flex items-center justify-between gap-4 flex-wrap">
					<!-- Remember Me Checkbox -->
					<label class="flex items-center cursor-pointer group">
						<input
							type="checkbox"
							bind:checked={rememberMe}
							class="h-4 w-4 rounded border-gray-300 text-pink-600 focus:ring-pink-500 focus:ring-offset-0 transition-colors duration-200"
							disabled={isSubmitting}
						/>
						<span class="ml-2 text-sm text-gray-700 select-none group-hover:text-gray-900 transition-colors duration-200">
							Remember me
						</span>
					</label>
					
					<!-- Show Password Checkbox -->
					<label class="flex items-center cursor-pointer group">
						<input
							type="checkbox"
							bind:checked={showPassword}
							class="h-4 w-4 rounded border-gray-300 text-pink-600 focus:ring-pink-500 focus:ring-offset-0 transition-colors duration-200"
							disabled={isSubmitting}
						/>
						<span class="ml-2 text-sm text-gray-600 select-none group-hover:text-gray-900 transition-colors duration-200">Show password</span>
					</label>
				</div>
				
				<div class="mt-4 text-right">
					<a 
						href="/auth/forgot-password" 
						class="inline-flex items-center gap-1 text-sm font-medium text-pink-600 hover:text-pink-700 transition-colors duration-200 group"
					>
						<span>Forgot password?</span>
						<svg class="w-4 h-4 group-hover:translate-x-0.5 transition-transform duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
						</svg>
					</a>
				</div>
			</div>

			<!-- Submit Button -->
			<Button
				type="submit"
				variant="primary"
				size="lg"
				fullWidth
				loading={isSubmitting}
			>
				{#if !isSubmitting}
					<svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
					</svg>
				{/if}
				Sign In
			</Button>
		</form>
	{/snippet}

	{#snippet footer()}
		<p class="text-sm text-gray-600">
			Don't have an account?
			<a href="/auth/register" class="font-semibold text-pink-600 hover:text-pink-700 transition-colors duration-200">
				Create one now
			</a>
		</p>
	{/snippet}
</AuthLayout>