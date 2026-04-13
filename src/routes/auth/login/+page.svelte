<script lang="ts">
	import { onMount } from 'svelte';
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
	let errors = $state<{ email?: string; password?: string }>({});

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

			authStore.login(response.user);
			await tick();

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
				const isInvalidCredentials =
					error.status === 401 && /invalid credentials|invalid email or password/i.test(error.message);

				if (isInvalidCredentials) {
					toastStore.error('Invalid email or password. Please try again.', 'Login Failed');
				} else {
					toastStore.error(error.message, 'Login Failed');
				}
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