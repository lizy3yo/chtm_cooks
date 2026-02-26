<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { authApi, ApiErrorHandler } from '$lib/api/auth';
	import AuthLayout from '$lib/components/auth/AuthLayout.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import StatusMessage from '$lib/components/ui/StatusMessage.svelte';
	
	// State
	let token = $state('');
	let isVerifying = $state(true);
	let success = $state(false);
	let error = $state<string | null>(null);
	let errorDetails = $state<string | null>(null);
	let countdown = $state(5);
	
	// Auto-verify on mount
	onMount(() => {
		const urlParams = new URLSearchParams(window.location.search);
		const urlToken = urlParams.get('token');
		
		if (!urlToken) {
			isVerifying = false;
			error = 'Verification token is missing';
			errorDetails = 'The verification link appears to be incomplete. Please check your email and try again.';
			return;
		}
		
		token = urlToken;
		verifyEmail(urlToken);
	});
	
	// Verify email function
	async function verifyEmail(verificationToken: string) {
		try {
			// Use GET request since the backend expects GET
			const response = await fetch(`/api/auth/verify-email?token=${encodeURIComponent(verificationToken)}`);
			const data = await response.json();
			
			if (!response.ok) {
				throw new ApiErrorHandler(
					data.error || 'Verification failed',
					response.status,
					data.code
				);
			}
			
			isVerifying = false;
			success = true;
			
			// Start countdown to redirect
			startRedirectCountdown();
		} catch (err) {
			isVerifying = false;
			
			if (err instanceof ApiErrorHandler) {
				error = err.message;
				
				if (err.status === 400) {
					if (err.message.includes('expired')) {
						errorDetails = 'Your verification link has expired. Please request a new verification email.';
					} else {
						errorDetails = 'This verification link is invalid or has already been used.';
					}
				}
			} else {
				error = 'An unexpected error occurred';
				errorDetails = 'Please try again or contact support if the problem persists.';
			}
		}
	}
	
	// Countdown timer for redirect
	function startRedirectCountdown() {
		const interval = setInterval(() => {
			countdown--;
			
			if (countdown <= 0) {
				clearInterval(interval);
				goto('/auth/login');
			}
		}, 1000);
	}
	
	// Manual redirect to login
	function handleGoToLogin() {
		goto('/auth/login');
	}
	
	// Resend verification email
	function handleResendVerification() {
		goto('/auth/login'); // They can resend from login page if needed
	}
</script>

<svelte:head>
	<title>Verify Email - CHTM Cooks</title>
	<meta name="description" content="Verify your email address to activate your CHTM Cooks account" />
</svelte:head>

<AuthLayout
	title="Email Verification"
	subtitle={isVerifying ? 'Please wait while we verify your email...' : ''}
>
	{#snippet children()}
		{#if isVerifying}
			<!-- Loading State -->
			<div class="flex flex-col items-center justify-center space-y-6 py-8">
				<div class="relative h-24 w-24">
					<!-- Spinning Circle -->
					<svg 
						class="h-24 w-24 animate-spin text-blue-600" 
						xmlns="http://www.w3.org/2000/svg" 
						fill="none" 
						viewBox="0 0 24 24"
					>
						<circle 
							class="opacity-25" 
							cx="12" 
							cy="12" 
							r="10" 
							stroke="currentColor" 
							stroke-width="4"
						></circle>
						<path 
							class="opacity-75" 
							fill="currentColor" 
							d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
						></path>
					</svg>
					
					<!-- Email Icon -->
					<div class="absolute inset-0 flex items-center justify-center">
						<svg class="h-10 w-10 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
						</svg>
					</div>
				</div>
				
				<div class="text-center">
					<p class="text-lg font-medium text-gray-900">Verifying your email...</p>
					<p class="mt-2 text-sm text-gray-600">This will only take a moment</p>
				</div>
			</div>
			
		{:else if success}
			<!-- Success State -->
			<div class="space-y-6">
				<StatusMessage type="success" title="Email Verified Successfully!">
					{#snippet children()}
						<p class="mt-1">
							Your email address has been verified. You can now access all features 
							of your CHTM Cooks account.
						</p>
						<div class="mt-4 rounded-lg bg-green-50 p-3">
							<p class="text-sm text-green-800">
								Redirecting to login in {countdown} second{countdown !== 1 ? 's' : ''}...
							</p>
						</div>
					{/snippet}
				</StatusMessage>
				
				<!-- Welcome Message -->
				<div class="rounded-lg border border-green-200 bg-green-50 p-4">
					<div class="flex items-start">
						<svg class="mr-3 mt-0.5 h-6 w-6 flex-shrink-0 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L7 11v9m7-10h-2M7 20H5a2 2 0 01-2-2v-6a2 2 0 012-2h2.5"/>
						</svg>
						<div class="text-left">
							<p class="text-sm font-medium text-green-900">Welcome to CHTM Cooks!</p>
							<p class="mt-1 text-sm text-green-800">
								Your account is now fully activated. Log in to start exploring our platform.
							</p>
						</div>
					</div>
				</div>
				
				<Button 
					variant="primary" 
					size="lg" 
					fullWidth 
					onclick={handleGoToLogin}
				>
					Go to Login
				</Button>
			</div>
			
		{:else if error}
			<!-- Error State -->
			<div class="space-y-6">
				<StatusMessage type="error" title="Verification Failed">
					{#snippet children()}
						<p class="mt-1 font-medium">{error}</p>
						{#if errorDetails}
							<p class="mt-2">{errorDetails}</p>
						{/if}
					{/snippet}
				</StatusMessage>
				
				<!-- Troubleshooting -->
				<div class="rounded-lg border border-gray-200 bg-gray-50 p-4">
					<div class="text-left text-sm">
						<p class="font-medium text-gray-900">Troubleshooting Tips:</p>
						<ul class="mt-2 ml-4 list-disc space-y-1 text-gray-700">
							<li>Make sure you clicked the latest verification link</li>
							<li>Check if the link was copied completely</li>
							<li>Verification links expire after 24 hours</li>
							<li>Each link can only be used once</li>
						</ul>
					</div>
				</div>
				
				<!-- Actions -->
				<div class="flex flex-col gap-3 sm:flex-row">
					<Button 
						variant="outline" 
						fullWidth 
						onclick={handleGoToLogin}
					>
						Back to Login
					</Button>
					<Button 
						variant="primary" 
						fullWidth 
						onclick={handleResendVerification}
					>
						Request New Link
					</Button>
				</div>
			</div>
		{/if}
	{/snippet}

	{#snippet footer()}
		{#if !isVerifying}
			<p class="text-sm text-gray-600">
				Need help?
				<a href="mailto:support@gordoncollege.edu.ph" class="font-medium text-blue-600 hover:text-blue-500">
					Contact Support
				</a>
			</p>
		{/if}
	{/snippet}
</AuthLayout>
