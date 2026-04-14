<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { tick } from 'svelte';
	import { authStore } from '$lib/stores/auth';
	import { toastStore } from '$lib/stores/toast';
	import { authApi, ApiErrorHandler } from '$lib/api/auth';
	import AuthLayout from '$lib/components/auth/AuthLayout.svelte';
	import Input from '$lib/components/ui/Input.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import type { LoginRequest } from '$lib/types/auth';
	import { validateEmail, validateRequired } from '$lib/utils/validation';

	// ── Storage keys ──────────────────────────────────────────────────────────
	const KEY_EMAIL    = 'chtm_rm_email';
	const KEY_CRED     = 'chtm_rm_cred';   // { iv, data } base64 JSON
	const KEY_DEVICE   = 'chtm_rm_dk';     // base64 exported AES-GCM key

	// ── State ─────────────────────────────────────────────────────────────────
	let email       = $state('');
	let password    = $state('');
	let rememberMe  = $state(false);
	let isSubmitting = $state(false);
	let showPassword = $state(false);
	let isResendingVerification = $state(false);
	let showVerificationHelp = $state(false);
	let resendCooldown = $state(0);
	let errors = $state<{ email?: string; password?: string }>({});
	let resendCooldownTimer: ReturnType<typeof setInterval> | null = null;

	function closeVerificationModal() {
		showVerificationHelp = false;
	}

	function startResendCooldown(seconds = 30) {
		if (resendCooldownTimer) {
			clearInterval(resendCooldownTimer);
		}

		resendCooldown = seconds;
		resendCooldownTimer = setInterval(() => {
			if (resendCooldown <= 1) {
				if (resendCooldownTimer) {
					clearInterval(resendCooldownTimer);
					resendCooldownTimer = null;
				}
				resendCooldown = 0;
				return;
			}

			resendCooldown -= 1;
		}, 1000);
	}

	function clearError(field: 'email' | 'password') {
		errors = { ...errors, [field]: undefined };
	}

	function validateLoginForm(normalizedEmail: string): boolean {
		const nextErrors: { email?: string; password?: string } = {};

		const emailError = validateEmail(normalizedEmail);
		if (emailError) {
			nextErrors.email = emailError.message;
		}

		const passwordError = validateRequired(password, 'password');
		if (passwordError) {
			nextErrors.password = passwordError.message;
		}

		errors = nextErrors;
		return Object.keys(nextErrors).length === 0;
	}

	// ── Crypto helpers ────────────────────────────────────────────────────────

	/** Get or create a device-bound AES-GCM key stored in localStorage. */
	async function getDeviceKey(): Promise<CryptoKey> {
		const stored = localStorage.getItem(KEY_DEVICE);
		if (stored) {
			const raw = Uint8Array.from(atob(stored), c => c.charCodeAt(0));
			return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, true, ['encrypt', 'decrypt']);
		}
		const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
		const exported = await crypto.subtle.exportKey('raw', key);
		localStorage.setItem(KEY_DEVICE, btoa(String.fromCharCode(...new Uint8Array(exported))));
		return key;
	}

	async function encryptPassword(plain: string): Promise<string> {
		const key = await getDeviceKey();
		const iv  = crypto.getRandomValues(new Uint8Array(12));
		const enc = await crypto.subtle.encrypt(
			{ name: 'AES-GCM', iv },
			key,
			new TextEncoder().encode(plain)
		);
		return JSON.stringify({
			iv:   btoa(String.fromCharCode(...iv)),
			data: btoa(String.fromCharCode(...new Uint8Array(enc)))
		});
	}

	async function decryptPassword(stored: string): Promise<string | null> {
		try {
			const { iv, data } = JSON.parse(stored) as { iv: string; data: string };
			const key     = await getDeviceKey();
			const ivBytes = Uint8Array.from(atob(iv),   c => c.charCodeAt(0));
			const cipher  = Uint8Array.from(atob(data), c => c.charCodeAt(0));
			const plain   = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: ivBytes }, key, cipher);
			return new TextDecoder().decode(plain);
		} catch {
			return null;
		}
	}

	// ── Lifecycle ─────────────────────────────────────────────────────────────

	onMount(async () => {
		const savedEmail = localStorage.getItem(KEY_EMAIL);
		const savedCred  = localStorage.getItem(KEY_CRED);
		if (savedEmail && savedCred) {
			email      = savedEmail;
			rememberMe = true;
			const plain = await decryptPassword(savedCred);
			if (plain) password = plain;
		}
	});

	onDestroy(() => {
		if (resendCooldownTimer) {
			clearInterval(resendCooldownTimer);
		}
	});

	async function handleResendVerificationEmail() {
		const normalizedEmail = email.trim().toLowerCase();

		const emailError = validateEmail(normalizedEmail);
		if (emailError) {
			errors = { ...errors, email: emailError.message };
			toastStore.error('Enter a valid email first.', 'Cannot Resend Verification');
			return;
		}

		if (resendCooldown > 0 || isResendingVerification) {
			return;
		}

		isResendingVerification = true;

		try {
			const response = await authApi.resendVerification(normalizedEmail);
			toastStore.success(response.message, 'Verification Email Sent');
			startResendCooldown();
		} catch (error) {
			if (error instanceof ApiErrorHandler) {
				toastStore.error(error.message, 'Cannot Resend Verification');
			} else {
				toastStore.error('Failed to resend verification email. Please try again.', 'Cannot Resend Verification');
			}
		} finally {
			isResendingVerification = false;
		}
	}

	function handleVerificationModalKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			closeVerificationModal();
		}
	}

	// ── Submit ────────────────────────────────────────────────────────────────

	async function handleSubmit(e: Event) {
		e.preventDefault();

		const normalizedEmail = email.trim().toLowerCase();
		if (!validateLoginForm(normalizedEmail)) {
			return;
		}

		isSubmitting = true;
		email = normalizedEmail;

		if (rememberMe && normalizedEmail && password) {
			localStorage.setItem(KEY_EMAIL, normalizedEmail);
			localStorage.setItem(KEY_CRED, await encryptPassword(password));
		} else {
			localStorage.removeItem(KEY_EMAIL);
			localStorage.removeItem(KEY_CRED);
			// Keep the device key so it can be reused if they re-enable remember me
		}

		try {
			const formData: LoginRequest = { email: normalizedEmail, password, rememberMe };
			const response = await authApi.login(formData);
			showVerificationHelp = false;

			authStore.login(response.user);
			await tick();

			if (response.user.role === 'student') {
				goto('/student/dashboard');
			} else if (response.user.role === 'instructor') {
				goto('/instructor/dashboard');
			} else if (response.user.role === 'custodian') {
				goto('/custodian/dashboard');
			} else if (response.user.role === 'superadmin' || response.user.role === 'admin') {
				goto('/superadmin/dashboard');
			} else {
				goto('/admin/dashboard');
			}
		} catch (error) {
			if (error instanceof ApiErrorHandler) {
				const isEmailNotVerified =
					error.status === 401 && /email not verified/i.test(error.message);
				const isInvalidCredentials =
					error.status === 401 && /invalid credentials|invalid email or password/i.test(error.message);

				if (isEmailNotVerified) {
					showVerificationHelp = true;
					toastStore.error('Email not verified. Please verify your email or resend a new link below.', 'Login Failed');
				} else if (isInvalidCredentials) {
					showVerificationHelp = false;
					toastStore.error('Invalid email or password. Please try again.', 'Login Failed');
				} else {
					showVerificationHelp = false;
					toastStore.error(error.message, 'Login Failed');
				}
			} else {
				showVerificationHelp = false;
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
				error={errors.email}
				required
				autocomplete="username"
				oninput={() => clearError('email')}
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
					error={errors.password}
					required
					autocomplete="current-password"
					oninput={() => clearError('password')}
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

{#if showVerificationHelp}
	<div
		class="fixed inset-0 z-[100] flex items-center justify-center p-4"
		role="dialog"
		aria-modal="true"
		aria-labelledby="verification-modal-title"
		onkeydown={handleVerificationModalKeydown}
	>
		<button
			type="button"
			class="absolute inset-0 bg-black/45 backdrop-blur-[2px]"
			onclick={closeVerificationModal}
			aria-label="Close verification modal"
		></button>

		<div class="relative w-full max-w-md rounded-2xl border border-amber-200 bg-white p-5 shadow-2xl">
			<div class="flex items-start justify-between gap-3">
				<div>
					<h3 id="verification-modal-title" class="text-lg font-semibold text-gray-900">Email verification required</h3>
					<p class="mt-1 text-sm leading-relaxed text-gray-600">
						Your account is not verified yet. Check your inbox for the verification link, or resend a new one now.
					</p>
				</div>
				<button
					type="button"
					onclick={closeVerificationModal}
					class="rounded-lg p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
					aria-label="Close"
				>
					<svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
					</svg>
				</button>
			</div>

			<div class="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-2">
				<button
					type="button"
					onclick={handleResendVerificationEmail}
					disabled={isResendingVerification || resendCooldown > 0}
					class="inline-flex w-full items-center justify-center rounded-xl bg-gradient-to-r from-pink-600 to-rose-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md transition duration-200 hover:from-pink-700 hover:to-rose-700 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
				>
					{#if isResendingVerification}
						Sending...
					{:else if resendCooldown > 0}
						Resend in {resendCooldown}s
					{:else}
						Resend verification email
					{/if}
				</button>
				<button
					type="button"
					onclick={closeVerificationModal}
					class="inline-flex w-full items-center justify-center rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 transition duration-200 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 focus-visible:ring-offset-2"
				>
					Close
				</button>
			</div>
		</div>
	</div>
{/if}