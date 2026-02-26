<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { authApi, ApiErrorHandler } from '$lib/api/auth';
	import { validateRequired, getPasswordStrength } from '$lib/utils/validation';
	import AuthLayout from '$lib/components/auth/AuthLayout.svelte';
	import Input from '$lib/components/ui/Input.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import StatusMessage from '$lib/components/ui/StatusMessage.svelte';
	import PasswordStrength from '$lib/components/ui/PasswordStrength.svelte';
	
	// Get token from URL query parameter
	let token = $state('');
	let password = $state('');
	let confirmPassword = $state('');
	
	let errors = $state<Record<string, string>>({});
	let isSubmitting = $state(false);
	let apiError = $state<string | null>(null);
	let success = $state(false);
	let showPassword = $state(false);
	let showConfirmPassword = $state(false);
	
	// Password strength calculation (reactive)
	let passwordStrength = $derived(getPasswordStrength(password));
	let passwordScore = $derived(passwordStrength.score);
	
	// Token validation
	let tokenError = $state(false);
	
	onMount(() => {
		const urlParams = new URLSearchParams(window.location.search);
		const urlToken = urlParams.get('token');
		
		if (!urlToken) {
			tokenError = true;
		} else {
			token = urlToken;
		}
	});
	
	// Validation
	function validate(): boolean {
		const newErrors: Record<string, string> = {};
		
		// Validate password
		const passwordValidation = validateRequired(password, 'password');
		if (passwordValidation) {
			newErrors.password = passwordValidation.message;
		} else if (password.length < 8) {
			newErrors.password = 'Password must be at least 8 characters long';
		} else if (passwordScore < 2) {
			newErrors.password = 'Please choose a stronger password';
		}
		
		// Validate confirm password
		const confirmValidation = validateRequired(confirmPassword, 'confirm password');
		if (confirmValidation) {
			newErrors.confirmPassword = confirmValidation.message;
		} else if (password !== confirmPassword) {
			newErrors.confirmPassword = 'Passwords do not match';
		}
		
		errors = newErrors;
		return Object.keys(newErrors).length === 0;
	}
	
	// Handle form submission
	async function handleSubmit(event: Event) {
		event.preventDefault();
		apiError = null;
		
		if (!validate()) return;
		
		isSubmitting = true;
		
		try {
			const response = await authApi.resetPassword(token, password);
			success = true;
		} catch (err) {
			if (err instanceof ApiErrorHandler) {
				apiError = err.message;
				
				// If token is invalid or expired, show token error
				if (err.status === 400) {
					tokenError = true;
				}
			} else {
				apiError = 'An unexpected error occurred. Please try again.';
			}
		} finally {
			isSubmitting = false;
		}
	}
	
	// Clear field error on input
	function clearError(field: string) {
		if (errors[field]) {
			const newErrors = { ...errors };
			delete newErrors[field];
			errors = newErrors;
		}
	}
	
	// Navigate to login
	function handleGoToLogin() {
		goto('/auth/login');
	}
</script>

<svelte:head>
	<title>Reset Password - CHTM Cooks</title>
	<meta name="description" content="Create a new password for your CHTM Cooks account" />
</svelte:head>

<AuthLayout
	title="Reset Your Password"
	subtitle="Choose a strong new password for your account"
>
	{#snippet children()}
		{#if tokenError}
			<!-- Invalid Token -->
			<div class="space-y-6">
				<StatusMessage type="error" title="Invalid or Expired Link">
					{#snippet children()}
						<p class="mt-1">
							This password reset link is invalid or has expired. 
							Reset links are only valid for 1 hour.
						</p>
						<p class="mt-2">
							Please request a new password reset link to continue.
						</p>
					{/snippet}
				</StatusMessage>
				
				<div class="flex flex-col gap-3 sm:flex-row">
					<Button 
						variant="outline" 
						fullWidth 
						onclick={() => goto('/auth/login')}
					>
						Back to Login
					</Button>
					<Button 
						variant="primary" 
						fullWidth 
						onclick={() => goto('/auth/forgot-password')}
					>
						Request New Link
					</Button>
				</div>
			</div>
		{:else if success}
			<!-- Success State -->
			<div class="space-y-6">
				<StatusMessage type="success" title="Password Reset Successful">
					{#snippet children()}
						<p class="mt-1">
							Your password has been successfully reset. You can now log in 
							with your new password.
						</p>
					{/snippet}
				</StatusMessage>
				
				<Button 
					variant="primary" 
					size="lg" 
					fullWidth 
					onclick={handleGoToLogin}
				>
					Continue to Login
				</Button>
				
				<!-- Security Tip -->
				<div class="rounded-lg bg-blue-50 p-4">
					<div class="flex items-start">
						<svg class="mr-3 mt-0.5 h-5 w-5 flex-shrink-0 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/>
						</svg>
						<div class="text-left text-sm text-blue-800">
							<p class="font-medium">Security Tip</p>
							<p class="mt-1">
								Keep your password secure and don't share it with anyone. 
								Consider using a password manager to store it safely.
							</p>
						</div>
					</div>
				</div>
			</div>
		{:else}
			<!-- Form State -->
			<form onsubmit={handleSubmit} class="space-y-6" novalidate>
				<!-- API Error -->
				{#if apiError}
					<StatusMessage type="error" title="Error" message={apiError} />
				{/if}
				
				<!-- Info Message -->
				<StatusMessage type="info">
					{#snippet children()}
						<p>
							Create a strong password that you haven't used before. 
							We recommend using a mix of letters, numbers, and symbols.
						</p>
					{/snippet}
				</StatusMessage>

				<!-- Password Input -->
				<div>
					<Input
						id="password"
						type={showPassword ? 'text' : 'password'}
						label="New Password"
						placeholder="Enter your new password"
						bind:value={password}
						error={errors.password}
						required
						autocomplete="new-password"
						oninput={() => clearError('password')}
						disabled={isSubmitting}
					/>
					
					<div class="mt-2 flex items-center">
						<label class="flex items-center">
							<input
								type="checkbox"
								bind:checked={showPassword}
								class="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
							/>
							<span class="ml-2 text-sm text-gray-600">Show password</span>
						</label>
					</div>
					
					<!-- Password Strength Indicator -->
					{#if password}
						<div class="mt-3">
							<PasswordStrength 
								password={password}
							/>
						</div>
					{/if}
				</div>

				<!-- Confirm Password Input -->
				<div>
					<Input
						id="confirmPassword"
						type={showConfirmPassword ? 'text' : 'password'}
						label="Confirm New Password"
						placeholder="Re-enter your new password"
						bind:value={confirmPassword}
						error={errors.confirmPassword}
						required
						autocomplete="new-password"
						oninput={() => clearError('confirmPassword')}
						disabled={isSubmitting}
					/>
					
					<div class="mt-2 flex items-center">
						<label class="flex items-center">
							<input
								type="checkbox"
								bind:checked={showConfirmPassword}
								class="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
							/>
							<span class="ml-2 text-sm text-gray-600">Show password</span>
						</label>
					</div>
				</div>

				<!-- Submit Button -->
				<Button
					type="submit"
					variant="primary"
					size="lg"
					fullWidth
					loading={isSubmitting}
					disabled={passwordScore < 2}
				>
					Reset Password
				</Button>
			</form>
		{/if}
	{/snippet}

	{#snippet footer()}
		{#if !success && !tokenError}
			<p class="text-sm text-gray-600">
				Remember your password?
				<a href="/auth/login" class="font-medium text-blue-600 hover:text-blue-500">
					Back to Login
				</a>
			</p>
		{/if}
	{/snippet}
</AuthLayout>
