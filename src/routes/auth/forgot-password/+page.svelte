<script lang="ts">
	import { goto } from '$app/navigation';
	import { authApi, ApiErrorHandler } from '$lib/api/auth';
	import { validateEmail } from '$lib/utils/validation';
	import AuthLayout from '$lib/components/auth/AuthLayout.svelte';
	import Input from '$lib/components/ui/Input.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import StatusMessage from '$lib/components/ui/StatusMessage.svelte';
	
	// Form state
	let email = $state('');
	let error = $state<string | null>(null);
	let isSubmitting = $state(false);
	let success = $state(false);
	let successMessage = $state('');
	
	// Validation
	function validate(): boolean {
		error = null;
		
		const validation = validateEmail(email);
		if (validation) {
			error = validation.message;
			return false;
		}
		
		return true;
	}
	
	// Handle form submission
	async function handleSubmit(event: Event) {
		event.preventDefault();
		
		if (!validate()) return;
		
		isSubmitting = true;
		error = null;
		
		try {
			const response = await authApi.forgotPassword(email);
			success = true;
			successMessage = 'If an account exists with this email, a password reset link has been sent.';
		} catch (err) {
			// Always show success message for security (prevent email enumeration)
			success = true;
			successMessage = 'If an account exists with this email, a password reset link has been sent.';
		} finally {
			isSubmitting = false;
		}
	}
	
	// Reset form to try again
	function handleTryAgain() {
		success = false;
		email = '';
		error = null;
	}
</script>

<svelte:head>
	<title>Forgot Password - CHTM Cooks</title>
	<meta name="description" content="Reset your password to regain access to your CHTM Cooks account" />
</svelte:head>

<AuthLayout
	title="Forgot Password?"
	subtitle="No worries! Enter your email and we'll send you a reset link"
>
	{#snippet children()}
		{#if success}
			<!-- Success State -->
			<div class="space-y-6">
				<StatusMessage type="success" title="Check Your Email">
					{#snippet children()}
						<p class="mt-1">{successMessage}</p>
						<p class="mt-2">
							Please check your inbox and follow the instructions to reset your password.
						</p>
						<div class="mt-4 space-y-2 text-sm">
							<p class="font-medium">Didn't receive the email?</p>
							<ul class="ml-4 list-disc space-y-1">
								<li>Check your spam or junk folder</li>
								<li>Make sure you entered the correct email</li>
								<li>Wait a few minutes - it may take time to arrive</li>
							</ul>
						</div>
					{/snippet}
				</StatusMessage>
				
				<!-- Actions -->
				<div class="flex flex-col gap-3 sm:flex-row">
					<Button 
						variant="outline" 
						fullWidth 
						onclick={handleTryAgain}
					>
						Try Different Email
					</Button>
					<Button 
						variant="primary" 
						fullWidth 
						onclick={() => goto('/auth/login')}
					>
						Back to Login
					</Button>
				</div>
			</div>
		{:else}
			<!-- Form State -->
			<form onsubmit={handleSubmit} class="space-y-6" novalidate>
				<!-- Error Alert -->
				{#if error}
					<StatusMessage type="error" title="Error" message={error} />
				{/if}
				
				<!-- Info Message -->
				<StatusMessage type="info">
					{#snippet children()}
						<p>
							Enter the email address associated with your account, and we'll send you 
							a link to reset your password.
						</p>
					{/snippet}
				</StatusMessage>

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
					oninput={() => error = null}
				/>

				<!-- Submit Button -->
				<Button
					type="submit"
					variant="primary"
					size="lg"
					fullWidth
					loading={isSubmitting}
				>
					Send Reset Link
				</Button>
				
				<!-- Security Notice -->
				<div class="rounded-lg bg-gray-50 p-4">
					<div class="flex items-start">
						<svg class="mr-3 mt-0.5 h-5 w-5 flex-shrink-0 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
						</svg>
						<div class="text-left text-sm text-gray-600">
							<p class="font-medium text-gray-700">Security Notice</p>
							<p class="mt-1">
								For your security, the reset link will expire in 1 hour. 
								If you didn't request this, you can safely ignore it.
							</p>
						</div>
					</div>
				</div>
			</form>
		{/if}
	{/snippet}

	{#snippet footer()}
		<p class="text-sm text-gray-600">
			Remember your password?
			<a href="/auth/login" class="font-medium text-blue-600 hover:text-blue-500">
				Back to Login
			</a>
		</p>
	{/snippet}
</AuthLayout>
