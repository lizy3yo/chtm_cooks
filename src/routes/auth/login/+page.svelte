<script lang="ts">
	import { goto } from '$app/navigation';
	import { authStore } from '$lib/stores/auth';
	import { authApi, ApiErrorHandler } from '$lib/api/auth';
	import AuthLayout from '$lib/components/auth/AuthLayout.svelte';
	import Input from '$lib/components/ui/Input.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Alert from '$lib/components/ui/Alert.svelte';
	import type { LoginRequest } from '$lib/types/auth';
	
	// Form state - use separate $state variables for proper binding
	let email = $state('');
	let password = $state('');
	let rememberMe = $state(false);
	
	let errors = $state<Record<string, string>>({});
	let isSubmitting = $state(false);
	let apiError = $state<string | null>(null);
	let showPassword = $state(false);
	
	// Handle form submission
	async function handleSubmit(event: Event) {
		event.preventDefault();
		apiError = null;
		
		isSubmitting = true;
		
		try {
			const formData: LoginRequest = {
				email,
				password,
				rememberMe
			};
			
			// Login - tokens automatically set in httpOnly cookies
			const response = await authApi.login(formData);
			
			// Update auth store with user data
			authStore.login(response.user);
			
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
				apiError = error.message;
			} else {
				apiError = 'An unexpected error occurred. Please try again.';
			}
		} finally {
			isSubmitting = false;
		}
	}
</script>

<svelte:head>
	<title>Student Login - CHTM Cooks</title>
</svelte:head>

<AuthLayout
	title="Welcome Back"
	subtitle="Sign in to your student account"
>
	{#snippet children()}
		<form onsubmit={handleSubmit} class="space-y-6" novalidate>
			<!-- API Error Alert -->
			{#if apiError}
				<Alert type="error" dismissible onDismiss={() => apiError = null}>
					<p>{apiError}</p>
				</Alert>
			{/if}

			<!-- Email Input -->
			<Input
				id="email"
				type="email"
				label="Email Address"
				placeholder="your.email@gordoncollege.edu.ph"
				bind:value={email}
				required
				autocomplete="email"
				oninput={() => apiError = null}
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
					oninput={() => apiError = null}
					disabled={isSubmitting}
				/>
				
				<div class="mt-3 flex items-center justify-between gap-4">
					<!-- Remember Me Checkbox -->
					<label class="flex items-center cursor-pointer">
						<input
							type="checkbox"
							bind:checked={rememberMe}
							class="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 focus:ring-offset-0"
							disabled={isSubmitting}
						/>
						<span class="ml-2 text-sm text-gray-700 select-none">
							Remember me 
						</span>
					</label>
					
					<!-- Show Password Checkbox -->
					<label class="flex items-center cursor-pointer">
						<input
							type="checkbox"
							bind:checked={showPassword}
							class="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 focus:ring-offset-0"
							disabled={isSubmitting}
						/>
						<span class="ml-2 text-sm text-gray-600 select-none">Show password</span>
					</label>
				</div>
				
				<div class="mt-2 text-right">
					<a 
						href="/auth/forgot-password" 
						class="text-sm font-medium text-blue-600 hover:text-blue-500"
					>
						Forgot password?
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
				Sign In
			</Button>
		</form>
	{/snippet}

	{#snippet footer()}
		<p class="text-sm text-gray-600">
			Don't have an account?
			<a href="/auth/register" class="font-medium text-blue-600 hover:text-blue-500">
				Sign up
			</a>
		</p>
	{/snippet}
</AuthLayout>
