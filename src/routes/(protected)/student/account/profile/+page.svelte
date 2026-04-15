<script lang="ts">
	import { onMount } from 'svelte';
	import { tick } from 'svelte';
	import { goto } from '$app/navigation';
	import Input from '$lib/components/ui/Input.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import PasswordStrength from '$lib/components/ui/PasswordStrength.svelte';
	import { toastStore } from '$lib/stores/toast';
	import { confirmStore } from '$lib/stores/confirm';
	import { authStore } from '$lib/stores/auth';
	import { profileApi } from '$lib/api/profile';
	import type { UserResponse } from '$lib/types/auth';
	import { validatePassword, validatePasswordConfirmation } from '$lib/utils/validation';

	let loading = $state(true);
	let isUploadingPhoto = $state(false);
	let isRemovingPhoto = $state(false);
	let isChangingPassword = $state(false);

	let profile = $state<UserResponse | null>(null);

	let firstName = $state('');
	let lastName = $state('');
	let yearLevel = $state('');
	let block = $state('');
	let email = $state('');

	let currentPassword = $state('');
	let newPassword = $state('');
	let confirmPassword = $state('');

	let passwordErrors = $state<Record<string, string>>({});
	let photoInput = $state<HTMLInputElement | null>(null);
	let personalInfoCard = $state<HTMLElement | null>(null);
	let photoCardHeight = $state<string>('auto');

	const MAX_PHOTO_SIZE_BYTES = 10 * 1024 * 1024;
	const ALLOWED_PHOTO_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);

	function syncPhotoCardHeight() {
		if (typeof window === 'undefined') return;
		if (window.innerWidth < 1024 || !personalInfoCard) {
			photoCardHeight = 'auto';
			return;
		}
		photoCardHeight = `${personalInfoCard.offsetHeight}px`;
	}

	function hydrateForm(user: UserResponse) {
		profile = user;
		firstName = user.firstName || '';
		lastName = user.lastName || '';
		yearLevel = user.yearLevel || '';
		block = user.block || '';
		email = user.email || '';
	}

	function getInitials(user: UserResponse | null): string {
		if (!user) return 'ST';
		return `${user.firstName?.[0] ?? ''}${user.lastName?.[0] ?? ''}`.toUpperCase() || 'ST';
	}

	async function loadProfile(forceRefresh = false) {
		try {
			const user = await profileApi.get(forceRefresh);
			hydrateForm(user);
			authStore.updateUser(user);
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to load profile';
			toastStore.error(message, 'Profile');
		}
	}

	function validatePasswordForm(): boolean {
		const errors: Record<string, string> = {};

		if (!currentPassword) {
			errors.currentPassword = 'Current password is required';
		}

		const newPasswordError = validatePassword(newPassword);
		if (newPasswordError) {
			errors.newPassword = newPasswordError.message;
		}

		const confirmPasswordError = validatePasswordConfirmation(newPassword, confirmPassword);
		if (confirmPasswordError) {
			errors.confirmPassword = confirmPasswordError.message;
		}

		if (currentPassword && newPassword && currentPassword === newPassword) {
			errors.newPassword = 'New password must be different from current password';
		}

		passwordErrors = errors;
		return Object.keys(errors).length === 0;
	}

	async function handlePhotoUpload(event: Event) {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;

		if (!ALLOWED_PHOTO_TYPES.has(file.type)) {
			toastStore.error('Invalid file type. Use JPG, PNG, or WebP.', 'Profile Photo');
			input.value = '';
			return;
		}

		if (file.size > MAX_PHOTO_SIZE_BYTES) {
			toastStore.error('File is too large. Maximum allowed size is 10MB.', 'Profile Photo');
			input.value = '';
			return;
		}

		isUploadingPhoto = true;
		try {
			const updatedUser = await profileApi.uploadPhoto(file);
			hydrateForm(updatedUser);
			authStore.updateUser(updatedUser);
			toastStore.success('Profile photo updated successfully', 'Profile');
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to upload photo';
			toastStore.error(message, 'Profile Photo');
		} finally {
			input.value = '';
			isUploadingPhoto = false;
		}
	}

	function openPhotoPicker() {
		if (isUploadingPhoto || isRemovingPhoto) return;
		photoInput?.click();
	}

	async function handleRemovePhoto() {
		if (!profile?.profilePhotoUrl || isRemovingPhoto || isUploadingPhoto) return;

		const confirmed = await confirmStore.warning(
			'Removing your profile photo will reset your avatar to initials. Continue?',
			'Remove Profile Photo',
			'Remove',
			'Cancel'
		);

		if (!confirmed) return;

		isRemovingPhoto = true;
		try {
			const updatedUser = await profileApi.removePhoto();
			hydrateForm(updatedUser);
			authStore.updateUser(updatedUser);
			toastStore.success('Profile photo removed successfully', 'Profile');
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to remove photo';
			toastStore.error(message, 'Profile Photo');
		} finally {
			isRemovingPhoto = false;
		}
	}

	async function handlePasswordChange() {
		if (!validatePasswordForm()) return;

		isChangingPassword = true;
		try {
			await profileApi.changePassword({
				currentPassword,
				newPassword
			});

			toastStore.success('Password changed. Signing you out for security.', 'Password Updated');
			await authStore.logout();
			await goto('/auth/login');
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to change password';
			toastStore.error(message, 'Security');
		} finally {
			isChangingPassword = false;
		}
	}

	onMount(() => {
		let mounted = true;
		let resizeObserver: ResizeObserver | null = null;

		(async () => {
			await loadProfile();
			if (mounted) {
				loading = false;
				await tick();
				syncPhotoCardHeight();
			}
		})();

		const unsubscribeSse = profileApi.subscribeToProfileChanges(async () => {
			if (!mounted) return;
			await loadProfile(true);
			await tick();
			syncPhotoCardHeight();
		});

		if (typeof window !== 'undefined') {
			window.addEventListener('resize', syncPhotoCardHeight);
			resizeObserver = new ResizeObserver(() => syncPhotoCardHeight());
			if (personalInfoCard) {
				resizeObserver.observe(personalInfoCard);
			}
		}

		return () => {
			mounted = false;
			unsubscribeSse();
			if (typeof window !== 'undefined') {
				window.removeEventListener('resize', syncPhotoCardHeight);
			}
			if (resizeObserver) {
				resizeObserver.disconnect();
			}
		};
	});
</script>

<svelte:head>
	<title>Profile - Student Portal</title>
</svelte:head>

<div class="space-y-6">
	<div>
		<div>
			<h1 class="text-2xl font-bold text-gray-900 sm:text-3xl">Student Profile</h1>
			<p class="mt-1 text-sm text-gray-500">Keep your personal and academic details up to date for smooth account verification and requests.</p>
		</div>
	</div>

	{#if loading}
		<div class="grid gap-6 lg:grid-cols-3">
			<div class="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm lg:col-span-1">
				<div class="h-5 w-28 animate-pulse rounded bg-gray-200"></div>
				<div class="mt-4 h-72 w-72 animate-pulse rounded-xl bg-gray-200"></div>
				<div class="mt-6 h-4 w-full animate-pulse rounded bg-gray-200"></div>
			</div>
			<div class="space-y-6 lg:col-span-2">
				<div class="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
					<div class="h-5 w-48 animate-pulse rounded bg-gray-200"></div>
					<div class="mt-4 h-40 animate-pulse rounded bg-gray-200"></div>
				</div>
			</div>
		</div>
	{:else}
		<div class="grid gap-6 lg:grid-cols-3">
			<section class="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm lg:col-span-1" style={`height: ${photoCardHeight};`}>
				<h2 class="text-lg font-semibold text-gray-900">Profile Photo</h2>
				<p class="mt-1 text-sm text-gray-500">JPG, PNG, or WebP up to 10MB.</p>

				<div class="mt-6 flex flex-col items-center">
					<div class="group relative h-72 w-72">
						{#if profile?.profilePhotoUrl}
							<img
								src={profile.profilePhotoUrl}
								alt={(profile && `${profile.firstName ?? ''} ${profile.lastName ?? ''}`.trim()) || 'Student'}
								class="h-72 w-72 rounded-xl border-4 border-pink-100 object-cover"
							/>
							<button
								type="button"
								onclick={handleRemovePhoto}
								disabled={isRemovingPhoto || isUploadingPhoto}
								class="absolute right-3 top-3 inline-flex h-10 w-10 items-center justify-center rounded-full bg-black/65 text-white opacity-0 shadow-md transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100 disabled:cursor-not-allowed disabled:opacity-60"
								aria-label="Remove profile photo"
								title="Remove profile photo"
							>
								<svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3M4 7h16"/>
								</svg>
							</button>
						{:else}
							<div class="flex h-72 w-72 items-center justify-center rounded-xl bg-linear-to-br from-pink-600 to-rose-600 text-3xl font-semibold text-white shadow-lg">
								{getInitials(profile)}
							</div>
						{/if}
					</div>

					<input
						bind:this={photoInput}
						type="file"
						accept="image/png,image/jpeg,image/webp"
						class="hidden"
						onchange={handlePhotoUpload}
						disabled={isUploadingPhoto || isRemovingPhoto}
					/>
					<div class="mt-5 w-full">
						<Button variant="outline" fullWidth loading={isUploadingPhoto} disabled={isUploadingPhoto || isRemovingPhoto} onclick={openPhotoPicker}>
							Upload New Photo
						</Button>
					</div>
				</div>
			</section>

			<div class="space-y-6 lg:col-span-2">
				<section bind:this={personalInfoCard} class="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
					<div class="flex items-center justify-between gap-3">
						<div>
							<h2 class="text-lg font-semibold text-gray-900">Personal Information</h2>
							<p class="mt-1 text-sm text-gray-500">All fields below are currently locked and cannot be changed.</p>
						</div>
					</div>

					<div class="mt-5 grid gap-4 sm:grid-cols-2">
						<Input id="firstName" label="First Name" bind:value={firstName} maxlength={50} disabled />
						<Input id="lastName" label="Last Name" bind:value={lastName} maxlength={50} disabled />
						<Input id="yearLevel" label="Year Level" value={yearLevel || 'Not set'} disabled />
						<Input id="block" label="Block / Section" bind:value={block} maxlength={10} disabled />
						<Input id="email" label="Email" value={email} disabled helperText="Email cannot be changed from this page." />
					</div>

					<div class="mt-6 rounded-lg border border-pink-100 bg-pink-50 px-4 py-3 text-sm text-pink-700">
						Personal details are read-only and maintained by your institution administrator.
					</div>
				</section>

				<section class="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
					<h2 class="text-lg font-semibold text-gray-900">Change Password</h2>
					<p class="mt-1 text-sm text-gray-500">After a successful password change, your current session will be signed out automatically.</p>

					<div class="mt-5 grid gap-4">
						<Input
							id="currentPassword"
							type="password"
							label="Current Password"
							bind:value={currentPassword}
							error={passwordErrors.currentPassword}
							required
						/>
						<Input
							id="newPassword"
							type="password"
							label="New Password"
							bind:value={newPassword}
							error={passwordErrors.newPassword}
							required
						/>
						<PasswordStrength password={newPassword} />
						<Input
							id="confirmPassword"
							type="password"
							label="Confirm New Password"
							bind:value={confirmPassword}
							error={passwordErrors.confirmPassword}
							required
						/>
					</div>

					<div class="mt-6 flex justify-end">
						<Button
							variant="primary"
							loading={isChangingPassword}
							disabled={isChangingPassword}
							onclick={handlePasswordChange}
						>
							Update Password
						</Button>
					</div>
				</section>
			</div>
		</div>
	{/if}
</div>
