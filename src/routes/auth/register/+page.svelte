<script lang="ts">
	import { goto } from '$app/navigation';
	import { authStore } from '$lib/stores/auth';
	import { authApi, ApiErrorHandler } from '$lib/api/auth';
	import type { ValidationError } from '$lib/types/auth';
	import {
		validateStudentEmail,
		validatePassword,
		validatePasswordConfirmation,
		validateName,
		validateRequired,
		batchValidate
	} from '$lib/utils/validation';
	import AuthLayout from '$lib/components/auth/AuthLayout.svelte';
	import Input from '$lib/components/ui/Input.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Alert from '$lib/components/ui/Alert.svelte';
	import PasswordStrength from '$lib/components/ui/PasswordStrength.svelte';
	
	// Form state - use separate $state variables for proper binding
	let email = $state('');
	let password = $state('');
	let confirmPassword = $state('');
	let firstName = $state('');
	let lastName = $state('');
	let yearLevel = $state('');
	let block = $state('');
	let agreedToTerms = $state(false);
	
	let errors = $state<Record<string, string>>({});
	let isSubmitting = $state(false);
	let apiError = $state<string | null>(null);
	let showPassword = $state(false);
	let registrationSuccess = $state(false);
	let showTermsModal = $state(false);
	let showPrivacyModal = $state(false);
	
	// Multi-step wizard state
	let currentStep = $state(1);
	const totalSteps = 4;
	
	console.log('🎬 Component loaded, currentStep:', currentStep);
	
	// Track currentStep changes
	$effect(() => {
		console.log('📍 currentStep changed to:', currentStep);
	});
	
	// Field touched state for showing validation only after user interaction
	let touched = $state<Record<string, boolean>>({});
	
	const steps = [
		{ number: 1, title: 'Personal Info', description: 'Tell us about yourself' },
		{ number: 2, title: 'Account Setup', description: 'Create your credentials' },
		{ number: 3, title: 'Academic Details', description: 'Your program information' },
		{ number: 4, title: 'Review & Agree', description: 'Final confirmation' }
	];
	
	const yearLevels = ['1st Year', '2nd Year', '3rd Year', '4th Year'];
	
	// Mark field as touched
	function markTouched(field: string) {
		touched = { ...touched, [field]: true };
	}
	
	// Sanitize name input - only allow letters, spaces, hyphens, and apostrophes
	function sanitizeName(value: string): string {
		return value.replace(/[^a-zA-Z\s'\-]/g, '');
	}
	
	// Handle name blur - sanitize and validate
	function handleNameBlur(field: 'firstName' | 'lastName') {
		if (field === 'firstName') {
			firstName = sanitizeName(firstName);
		} else {
			lastName = sanitizeName(lastName);
		}
		markTouched(field);
	}
	
	// Real-time field validation
	function validateField(field: string): string | null {
		let error: ValidationError | null = null;
		
		switch (field) {
			case 'firstName':
				error = validateName(firstName.trim(), 'firstName');
				break;
			case 'lastName':
				error = validateName(lastName.trim(), 'lastName');
				break;
			case 'email':
				error = validateStudentEmail(email);
				break;
			case 'password':
				error = validatePassword(password);
				break;
			case 'confirmPassword':
				error = validatePasswordConfirmation(password, confirmPassword);
				break;
			case 'yearLevel':
				error = validateRequired(yearLevel, 'yearLevel');
				break;
			case 'block':
				if (!block || !block.trim()) {
					error = { field: 'block', message: 'Block/Section is required' };
				} else if (block.trim().length > 10) {
					error = { field: 'block', message: 'Block/Section must be 10 characters or less' };
				}
				break;
			case 'agreedToTerms':
				error = validateRequired(agreedToTerms, 'agreedToTerms');
				if (error) {
					error.message = 'You must agree to the Terms and Conditions';
				}
				break;
		}
		
		return error?.message || null;
	}
	
	// Update error for specific field (only when touched to avoid premature validation)
	function updateFieldError(field: string) {
		// Only update if field has been touched, otherwise leave errors as-is
		if (!touched[field]) {
			return;
		}
		
		const errorMessage = validateField(field);
		
		// Create new errors object
		const newErrors = { ...errors };
		
		if (errorMessage) {
			newErrors[field] = errorMessage;
		} else {
			delete newErrors[field];
		}
		
		errors = newErrors;
	}
	
	// Clear error when user starts typing (gives immediate feedback)
	function clearFieldError(field: string) {
		if (errors[field]) {
			const newErrors = { ...errors };
			delete newErrors[field];
			errors = newErrors;
		}
	}
	
	// Step-specific validation
	function validateStep(step: number): boolean {
		let validationErrors: Array<{ field: string; message: string }> = [];
		let fieldsToValidate: string[] = [];
		
		switch (step) {
			case 1: // Personal Information
				fieldsToValidate = ['firstName', 'lastName'];
				
				// Log the actual values being validated
				console.log('🔍 Validating Step 1:', {
					firstName: `"${firstName}"`,
					firstNameTrimmed: `"${firstName.trim()}"`,
					firstNameLength: firstName.trim().length,
					lastName: `"${lastName}"`,
					lastNameTrimmed: `"${lastName.trim()}"`,
					lastNameLength: lastName.trim().length
				});
				
				// Validate both fields explicitly
				const firstNameError = validateName(firstName.trim(), 'firstName');
				const lastNameError = validateName(lastName.trim(), 'lastName');
				
				console.log('📋 Validation results:', {
					firstNameError,
					lastNameError
				});
				
				if (firstNameError) validationErrors.push(firstNameError);
				if (lastNameError) validationErrors.push(lastNameError);
				break;
			case 2: // Account Setup
				fieldsToValidate = ['email', 'password', 'confirmPassword'];
				validationErrors = batchValidate([
					validateStudentEmail(email),
					validatePassword(password),
					validatePasswordConfirmation(password, confirmPassword)
				]);
				break;
			case 3: // Academic Details
				fieldsToValidate = ['yearLevel', 'block'];
				validationErrors = batchValidate([
					validateRequired(yearLevel, 'yearLevel'),
					block.trim() ? null : { field: 'block', message: 'Block/Section is required' }
				]);
				break;
			case 4: // Review & Agree
				fieldsToValidate = ['agreedToTerms'];
				validationErrors = batchValidate([
					agreedToTerms ? null : { 
						field: 'agreedToTerms', 
						message: 'You must agree to the Terms and Conditions' 
					}
				]);
				break;
		}
		
		// Mark all fields in this step as touched
		const newTouched = { ...touched };
		fieldsToValidate.forEach(field => {
			newTouched[field] = true;
		});
		touched = newTouched;
		
		// Build new error object with ONLY errors for this step's fields
		const newErrors: Record<string, string> = {};
		
		// Add validation errors for this step
		validationErrors.forEach(err => {
			newErrors[err.field] = err.message;
		});
		
		// Keep errors from other steps that aren't in current step
		Object.keys(errors).forEach(key => {
			if (!fieldsToValidate.includes(key)) {
				newErrors[key] = errors[key];
			}
		});
		
		errors = newErrors;
		
		const isValid = validationErrors.length === 0;
		console.log(`${isValid ? '✅' : '❌'} Step ${step} validation result:`, { 
			isValid,
			validationErrorsCount: validationErrors.length,
			validationErrors,
			newErrors
		});
		
		return isValid;
	}
	
	// Full form validation
	function validate(): boolean {
		// Mark all fields as touched
		touched = {
			firstName: true,
			lastName: true,
			email: true,
			password: true,
			confirmPassword: true,
			yearLevel: true,
			block: true,
			agreedToTerms: true
		};
		
		const validationErrors = batchValidate([
			validateStudentEmail(email),
			validatePassword(password),
			validatePasswordConfirmation(password, confirmPassword),
			validateName(firstName.trim(), 'firstName'),
			validateName(lastName.trim(), 'lastName'),
			validateRequired(yearLevel, 'yearLevel'),
			block.trim() ? null : { field: 'block', message: 'Block/Section is required' },
			agreedToTerms ? null : { 
				field: 'agreedToTerms', 
				message: 'You must agree to the Terms and Conditions' 
			}
		]);
		
		errors = validationErrors.reduce((acc, err) => {
			acc[err.field] = err.message;
			return acc;
		}, {} as Record<string, string>);
		
		return validationErrors.length === 0;
	}
	
	// Navigation handlers
	function handleNext() {
		console.log('🚀 Continue button clicked');
		console.log('   Current step variable value:', currentStep);
		console.log('   Field values:', { firstName, lastName, email, password, confirmPassword });
		const isValid = validateStep(currentStep);
		
		if (!isValid) {
			console.log('❌ Validation failed, staying on step', currentStep, 'Errors:', errors);
			// Scroll to first error
			const firstErrorField = Object.keys(errors)[0];
			const errorElement = document.getElementById(firstErrorField);
			errorElement?.scrollIntoView({ behavior: 'smooth', block: 'center' });
			return;
		}
		
		console.log('✅ Validation passed, advancing to next step');
		
		if (currentStep < totalSteps) {
			console.log('➡️ Incrementing currentStep from', currentStep, 'to', currentStep + 1);
			currentStep++;
			apiError = null;
		}
	}
	
	function handleBack() {
		console.log('⬅️ Back button clicked from step', currentStep);
		if (currentStep > 1) {
			currentStep--;
			apiError = null;
		}
	}
	
	function goToStep(step: number) {
		console.log('🎯 goToStep called:', { from: currentStep, to: step });
		console.trace('Call stack:');
		
		// Allow navigation back, but validate forward navigation
		if (step < currentStep) {
			currentStep = step;
			apiError = null;
		} else if (step > currentStep) {
			// Validate all intermediate steps
			for (let i = currentStep; i < step; i++) {
				if (!validateStep(i)) {
					return;
				}
			}
			currentStep = step;
			apiError = null;
		}
	}
	
	// Get current step error count for visual feedback
	function getStepErrorCount(step: number): number {
		let count = 0;
		switch (step) {
			case 1:
				if (errors.firstName) count++;
				if (errors.lastName) count++;
				break;
			case 2:
				if (errors.email) count++;
				if (errors.password) count++;
				if (errors.confirmPassword) count++;
				break;
			case 3:
				if (errors.yearLevel) count++;
				if (errors.block) count++;
				break;
			case 4:
				if (errors.agreedToTerms) count++;
				break;
		}
		return count;
	}
	
	// Handle form submission
	async function handleSubmit(event: Event) {
		event.preventDefault();
		apiError = null;
		
		if (!validate()) {
			// Scroll to first error
			const firstErrorField = Object.keys(errors)[0];
			const errorElement = document.getElementById(firstErrorField);
			errorElement?.scrollIntoView({ behavior: 'smooth', block: 'center' });
			return;
		}
		
		isSubmitting = true;
		
		try {
			const response = await authApi.register({
				email: email.trim().toLowerCase(),
				password,
				confirmPassword,
				firstName: firstName.trim(),
				lastName: lastName.trim(),
				role: 'student',
				yearLevel,
				block: block.trim(),
				agreedToTerms
			});
			
			registrationSuccess = true;
			
			// Show success message for a moment before redirecting
			setTimeout(() => {
				authStore.login(response.user);
				goto('/student/dashboard');
			}, 2000);
		} catch (error) {
			if (error instanceof ApiErrorHandler) {
				apiError = error.message;
				
				// Handle specific field errors from backend
				if (error.message.includes('email')) {
					errors = { ...errors, email: error.message };
					touched = { ...touched, email: true };
					goToStep(2); // Navigate to email step
				} else if (error.message.includes('password')) {
					errors = { ...errors, password: error.message };
					touched = { ...touched, password: true };
					goToStep(2); // Navigate to password step
				} else if (error.message.includes('already exists')) {
					errors = { ...errors, email: 'This email is already registered' };
					touched = { ...touched, email: true };
					goToStep(2); // Navigate to email step
				}
			} else {
				apiError = 'An unexpected error occurred. Please try again.';
			}
			
			// Scroll to top to show error
			window.scrollTo({ top: 0, behavior: 'smooth' });
		} finally {
			isSubmitting = false;
		}
	}

</script>

<svelte:head>
	<title>Student Registration - CHTM Cooks</title>
</svelte:head>

<style>
	@keyframes fadeIn {
		from {
			opacity: 0;
			transform: translateY(10px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	.animate-fadeIn {
		animation: fadeIn 0.3s ease-out;
	}
</style>

<AuthLayout
	title="Create Your Account"
	subtitle="Join CHTM Cooks as a student"
>
	{#snippet children()}
		{#if registrationSuccess}
			<Alert type="success" title="Registration Successful!">
				<p>Your account has been created. Redirecting to your dashboard...</p>
			</Alert>
		{:else}
			<!-- Progress Indicator -->
			<div class="mb-8">
				<!-- Progress Bar -->
				<div class="relative mb-6">
					<div class="h-2 bg-gray-200 rounded-full overflow-hidden">
						<div 
							class="h-full bg-blue-600 transition-all duration-300 ease-in-out"
							style="width: {(currentStep / totalSteps) * 100}%"
						></div>
					</div>
				</div>
				
				<!-- Step Indicators -->
				<div class="flex justify-between">
					{#each steps as step}
						<button
							type="button"
							onclick={() => goToStep(step.number)}
							class="flex flex-col items-center group transition-all"
							disabled={isSubmitting}
						>
							<div 
								class="w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold mb-2 transition-all relative
									{currentStep === step.number ? 'bg-blue-600 text-white scale-110' : 
									currentStep > step.number ? 'bg-green-500 text-white' : 
									'bg-gray-200 text-gray-500'}"
							>
								{#if currentStep > step.number}
									<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" />
									</svg>
								{:else}
									{step.number}
								{/if}
								
								<!-- Error indicator -->
								{#if getStepErrorCount(step.number) > 0 && touched[Object.keys(touched)[0]]}
									<span class="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
										!
									</span>
								{/if}
							</div>
							<div class="text-center max-w-[80px]">
								<p class="text-xs font-medium {currentStep === step.number ? 'text-gray-900' : 'text-gray-500'}">
									{step.title}
								</p>
							</div>
						</button>
					{/each}
				</div>
			</div>

			<form onsubmit={handleSubmit} class="space-y-6" novalidate>
				<!-- API Error Alert -->
				{#if apiError}
					<Alert type="error" dismissible onDismiss={() => apiError = null}>
						{apiError}
					</Alert>
				{/if}
				
				<!-- Step Validation Summary -->
				{#if getStepErrorCount(currentStep) > 0 && Object.keys(touched).length > 0}
					<Alert type="error">
						<div class="flex items-start">
							<svg class="w-5 h-5 mr-2 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
								<path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd" />
							</svg>
							<div>
								<p class="font-semibold">Please correct the following errors:</p>
								<ul class="mt-2 space-y-1 text-sm">
									{#each Object.entries(errors) as [field, message]}
										<li>• {message}</li>
									{/each}
								</ul>
							</div>
						</div>
					</Alert>
				{/if}

				<!-- Step Content -->
				<div class="min-h-[320px]">
					{#if currentStep === 1}
						<!-- Step 1: Personal Information -->
						<div class="space-y-4 animate-fadeIn">
							<div class="mb-6">
								<h3 class="text-lg font-semibold text-gray-900">Personal Information</h3>
								<p class="text-sm text-gray-600 mt-1">Let's start with your basic details</p>
							</div>
							
							<div class="grid grid-cols-2 gap-4">
								<Input
									id="firstName"
									type="text"
									label="First Name"
									placeholder="Juan"
									bind:value={firstName}
									error={errors.firstName}
									helperText={!errors.firstName ? 'Letters, spaces, hyphens only' : ''}
									required
									autocomplete="given-name"
									disabled={isSubmitting}
									pattern="[a-zA-Z\s'\-]+"
									oninput={(e) => {
										const target = e.target as HTMLInputElement;
										firstName = sanitizeName(target.value);
									}}
									onblur={() => handleNameBlur('firstName')}
								/>
								<Input
									id="lastName"
									type="text"
									label="Last Name"
									placeholder="Dela Cruz"
									bind:value={lastName}
									error={errors.lastName}
									helperText={!errors.lastName ? 'Letters, spaces, hyphens only' : ''}
									required
									autocomplete="family-name"
									disabled={isSubmitting}
									pattern="[a-zA-Z\s'\-]+"
									oninput={(e) => {
										const target = e.target as HTMLInputElement;
										lastName = sanitizeName(target.value);
									}}
									onblur={() => handleNameBlur('lastName')}
								/>
							</div>
						</div>

					{:else if currentStep === 2}
						<!-- Step 2: Account Setup -->
						<div class="space-y-4 animate-fadeIn">
							<div class="mb-6">
								<h3 class="text-lg font-semibold text-gray-900">Account Setup</h3>
								<p class="text-sm text-gray-600 mt-1">Create your login credentials</p>
							</div>
							
							<Input
								id="email"
								type="email"
								label="Student Email"
								placeholder="juan.delacruz@gordoncollege.edu.ph"
								bind:value={email}
								error={errors.email}
								helperText="Must use your @gordoncollege.edu.ph email"
								required
								autocomplete="email"
								disabled={isSubmitting}
								onblur={() => markTouched('email')}
							/>

							<Input
								id="password"
								type={showPassword ? 'text' : 'password'}
								label="Password"
								placeholder="Create a strong password"
								bind:value={password}
								error={errors.password}
								helperText={!errors.password && !password ? 'Minimum 8 characters with uppercase, lowercase, number & special character' : ''}
								required
								autocomplete="new-password"
								disabled={isSubmitting}
								onblur={() => markTouched('password')}
							/>

							{#if password}
								<PasswordStrength password={password} />
							{/if}

							<Input
								id="confirmPassword"
								type={showPassword ? 'text' : 'password'}
								label="Confirm Password"
								placeholder="Re-enter your password"
								bind:value={confirmPassword}
								error={errors.confirmPassword}
								required
								autocomplete="new-password"
								disabled={isSubmitting}
								onblur={() => markTouched('confirmPassword')}
							/>

							<label class="flex items-center cursor-pointer">
								<input
									type="checkbox"
									bind:checked={showPassword}
									class="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
								/>
								<span class="ml-2 text-sm text-gray-600">Show passwords</span>
							</label>
						</div>

					{:else if currentStep === 3}
						<!-- Step 3: Academic Details -->
						<div class="space-y-4 animate-fadeIn">
							<div class="mb-6">
								<h3 class="text-lg font-semibold text-gray-900">Academic Information</h3>
								<p class="text-sm text-gray-600 mt-1">Tell us about your program</p>
							</div>
							
							<div class="grid grid-cols-2 gap-4">
								<div>
									<label for="yearLevel" class="block text-sm font-medium text-gray-700 mb-2">
										Year Level <span class="text-red-500">*</span>
									</label>
									<select
										id="yearLevel"
										bind:value={yearLevel}
										disabled={isSubmitting}
										onblur={() => markTouched('yearLevel')}
										onchange={() => {
											markTouched('yearLevel');
											updateFieldError('yearLevel');
										}}
										class="block w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:bg-gray-100"
									>
										<option value="">Select Year</option>
										{#each yearLevels as year}
											<option value={year}>{year}</option>
										{/each}
									</select>
									{#if errors.yearLevel}
										<p class="mt-2 text-sm text-red-600">{errors.yearLevel}</p>
									{/if}
								</div>
								
								<Input
									id="block"
									type="text"
									label="Block/Section"
									placeholder="A"
									bind:value={block}
									error={errors.block}
									required
									disabled={isSubmitting}
									onblur={() => markTouched('block')}
								/>
							</div>
						</div>

					{:else if currentStep === 4}
						<!-- Step 4: Review & Agree -->
						<div class="space-y-6 animate-fadeIn">
							<div class="mb-6">
								<h3 class="text-lg font-semibold text-gray-900">Review Your Information</h3>
								<p class="text-sm text-gray-600 mt-1">Please confirm your details are correct</p>
							</div>
							
							<!-- Summary Cards -->
							<div class="space-y-4">
								<div class="p-4 bg-gray-50 rounded-lg border border-gray-200">
									<h4 class="text-sm font-semibold text-gray-700 mb-3">Personal Information</h4>
									<div class="grid grid-cols-2 gap-3 text-sm">
										<div>
											<span class="text-gray-600">First Name:</span>
											<span class="ml-2 font-medium text-gray-900">{firstName}</span>
										</div>
										<div>
											<span class="text-gray-600">Last Name:</span>
											<span class="ml-2 font-medium text-gray-900">{lastName}</span>
										</div>
									</div>
									<button 
										type="button" 
										onclick={() => goToStep(1)}
										class="mt-3 text-xs text-blue-600 hover:text-blue-500 font-medium"
									>
										Edit
									</button>
								</div>

								<div class="p-4 bg-gray-50 rounded-lg border border-gray-200">
									<h4 class="text-sm font-semibold text-gray-700 mb-3">Account Details</h4>
									<div class="text-sm">
										<span class="text-gray-600">Email:</span>
										<span class="ml-2 font-medium text-gray-900">{email}</span>
									</div>
									<button 
										type="button" 
										onclick={() => goToStep(2)}
										class="mt-3 text-xs text-blue-600 hover:text-blue-500 font-medium"
									>
										Edit
									</button>
								</div>

								<div class="p-4 bg-gray-50 rounded-lg border border-gray-200">
									<h4 class="text-sm font-semibold text-gray-700 mb-3">Academic Information</h4>
									<div class="grid grid-cols-2 gap-3 text-sm">
										<div>
											<span class="text-gray-600">Year Level:</span>
											<span class="ml-2 font-medium text-gray-900">{yearLevel}</span>
										</div>
										<div>
											<span class="text-gray-600">Block:</span>
											<span class="ml-2 font-medium text-gray-900">{block}</span>
										</div>
									</div>
									<button 
										type="button" 
										onclick={() => goToStep(3)}
										class="mt-3 text-xs text-blue-600 hover:text-blue-500 font-medium"
									>
										Edit
									</button>
								</div>
							</div>

							<!-- Terms and Conditions -->
							<div class="pt-4 border-t border-gray-200">
								<label class="flex items-start">
									<input
										type="checkbox"
										bind:checked={agreedToTerms}
										disabled={isSubmitting}
										onchange={() => {
											markTouched('agreedToTerms');
											updateFieldError('agreedToTerms');
										}}
										class="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500
											{errors.agreedToTerms ? 'border-red-500' : ''}"
									/>
									<span class="ml-3 text-sm text-gray-600">
										I agree to the
										<button
											type="button"
											onclick={() => showTermsModal = true}
											class="font-medium text-blue-600 hover:text-blue-500 underline"
										>
											Terms and Conditions
										</button>
										and
										<button
											type="button"
											onclick={() => showPrivacyModal = true}
											class="font-medium text-blue-600 hover:text-blue-500 underline"
										>
											Privacy Policy
										</button>
										<span class="text-red-500">*</span>
									</span>
								</label>
								{#if errors.agreedToTerms}
									<p class="mt-2 ml-7 text-sm text-red-600">{errors.agreedToTerms}</p>
								{/if}
							</div>
						</div>
					{/if}
				</div>

				<!-- Navigation Buttons -->
				<div class="flex gap-3 pt-6 border-t border-gray-200">
					{#if currentStep > 1}
						<Button
							type="button"
							variant="secondary"
							size="lg"
							onclick={handleBack}
							disabled={isSubmitting}
							class="flex-1"
						>
							<svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
							</svg>
							Back
						</Button>
					{/if}

					{#if currentStep < totalSteps}
						<Button
							type="button"
							variant="primary"
							size="lg"
							onclick={handleNext}
							disabled={isSubmitting}
							class="flex-1"
						>
							Continue
							<svg class="w-5 h-5 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
							</svg>
						</Button>
					{:else}
						<Button
							type="submit"
							variant="primary"
							size="lg"
							fullWidth
							loading={isSubmitting}
						>
							Create Account
						</Button>
					{/if}
				</div>
			</form>
		{/if}
	{/snippet}

	{#snippet footer()}
		<p class="text-sm text-gray-600">
			Already have an account?
			<a href="/auth/login" class="font-medium text-blue-600 hover:text-blue-500">
				Sign in
			</a>
		</p>
	{/snippet}
</AuthLayout>

<!-- Terms and Conditions Modal -->
{#if showTermsModal}
	<div class="fixed inset-0 z-50 overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
		<div class="flex items-center justify-center min-h-screen px-4 py-6">
			<!-- Background overlay -->
			<div 
				class="fixed inset-0 backdrop-blur-md transition-opacity" 
				onclick={() => showTermsModal = false}
			></div>

			<!-- Modal panel -->
			<div class="relative bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all w-full max-w-3xl z-10">
				<div class="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
					<div class="flex items-start justify-between mb-4">
						<h3 class="text-2xl font-semibold text-gray-900" id="modal-title">
							Terms and Conditions
						</h3>
						<button
							type="button"
							onclick={() => showTermsModal = false}
							class="text-gray-400 hover:text-gray-500 focus:outline-none"
						>
							<svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
							</svg>
						</button>
					</div>
					
					<div class="mt-4 max-h-96 overflow-y-auto prose prose-sm max-w-none">
						<p class="text-sm text-gray-500 mb-4">Last updated: February 24, 2026</p>
						
						<h4 class="text-lg font-semibold text-gray-900 mt-4 mb-2">1. Acceptance of Terms</h4>
						<p class="text-sm text-gray-700 mb-3">
							By accessing and using the CHTM Cooks platform, you accept and agree to be bound by the terms and provisions of this agreement. If you do not agree to these terms, please do not use this service.
						</p>

						<h4 class="text-lg font-semibold text-gray-900 mt-4 mb-2">2. User Account</h4>
						<p class="text-sm text-gray-700 mb-3">
							You must provide accurate and complete information when creating your account. You are responsible for maintaining the confidentiality of your account credentials and for all activities that occur under your account.
						</p>

						<h4 class="text-lg font-semibold text-gray-900 mt-4 mb-2">3. Acceptable Use</h4>
						<p class="text-sm text-gray-700 mb-3">
							You agree to use the platform only for lawful purposes and in accordance with these Terms. You must not use the platform in any way that violates any applicable laws or regulations, infringes on the rights of others, or could damage or impair the service.
						</p>

						<h4 class="text-lg font-semibold text-gray-900 mt-4 mb-2">4. Intellectual Property</h4>
						<p class="text-sm text-gray-700 mb-3">
							The platform and its original content, features, and functionality are owned by CHTM Cooks and are protected by international copyright, trademark, and other intellectual property laws.
						</p>

						<h4 class="text-lg font-semibold text-gray-900 mt-4 mb-2">5. Termination</h4>
						<p class="text-sm text-gray-700 mb-3">
							We may terminate or suspend your account and access to the platform immediately, without prior notice or liability, for any reason, including if you breach these Terms and Conditions.
						</p>

						<h4 class="text-lg font-semibold text-gray-900 mt-4 mb-2">6. Limitation of Liability</h4>
						<p class="text-sm text-gray-700 mb-3">
							In no event shall CHTM Cooks, its directors, employees, or partners be liable for any indirect, incidental, special, consequential, or punitive damages resulting from your use or inability to use the service.
						</p>

						<h4 class="text-lg font-semibold text-gray-900 mt-4 mb-2">7. Changes to Terms</h4>
						<p class="text-sm text-gray-700 mb-3">
							We reserve the right to modify or replace these Terms at any time. We will provide notice of any significant changes. Your continued use of the platform after any such changes constitutes your acceptance of the new Terms.
						</p>

						<h4 class="text-lg font-semibold text-gray-900 mt-4 mb-2">8. Contact Information</h4>
						<p class="text-sm text-gray-700 mb-3">
							If you have any questions about these Terms and Conditions, please contact us at support@chtmcooks.edu.ph
						</p>
					</div>
				</div>
				
				<div class="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
					<button
						type="button"
						onclick={() => showTermsModal = false}
						class="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-blue-600 text-base font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:ml-3 sm:w-auto sm:text-sm"
					>
						Close
					</button>
				</div>
			</div>
		</div>
	</div>
{/if}

<!-- Privacy Policy Modal -->
{#if showPrivacyModal}
	<div class="fixed inset-0 z-50 overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
		<div class="flex items-center justify-center min-h-screen px-4 py-6">
			<!-- Background overlay -->
			<div 
				class="fixed inset-0 backdrop-blur-md transition-opacity" 
				onclick={() => showPrivacyModal = false}
			></div>

			<!-- Modal panel -->
			<div class="relative bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all w-full max-w-3xl z-10">
				<div class="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
					<div class="flex items-start justify-between mb-4">
						<h3 class="text-2xl font-semibold text-gray-900" id="modal-title">
							Privacy Policy
						</h3>
						<button
							type="button"
							onclick={() => showPrivacyModal = false}
							class="text-gray-400 hover:text-gray-500 focus:outline-none"
						>
							<svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
							</svg>
						</button>
					</div>
					
					<div class="mt-4 max-h-96 overflow-y-auto prose prose-sm max-w-none">
						<p class="text-sm text-gray-500 mb-4">Last updated: February 24, 2026</p>
						
						<h4 class="text-lg font-semibold text-gray-900 mt-4 mb-2">1. Information We Collect</h4>
						<p class="text-sm text-gray-700 mb-3">
							We collect information that you provide directly to us, including your name, email address, academic details (year level and block/section), and any other information you choose to provide. We also automatically collect certain information about your device and how you interact with our platform.
						</p>

						<h4 class="text-lg font-semibold text-gray-900 mt-4 mb-2">2. How We Use Your Information</h4>
						<p class="text-sm text-gray-700 mb-3">
							We use the information we collect to provide, maintain, and improve our services, to communicate with you, to monitor and analyze trends and usage, and to protect the security and integrity of our platform.
						</p>

						<h4 class="text-lg font-semibold text-gray-900 mt-4 mb-2">3. Information Sharing</h4>
						<p class="text-sm text-gray-700 mb-3">
							We do not sell, trade, or rent your personal information to third parties. We may share your information with service providers who assist us in operating our platform, conducting our business, or serving our users, as long as those parties agree to keep this information confidential.
						</p>

						<h4 class="text-lg font-semibold text-gray-900 mt-4 mb-2">4. Data Security</h4>
						<p class="text-sm text-gray-700 mb-3">
							We implement appropriate technical and organizational measures to protect your personal information against unauthorized access, alteration, disclosure, or destruction. However, no method of transmission over the Internet or electronic storage is 100% secure.
						</p>

						<h4 class="text-lg font-semibold text-gray-900 mt-4 mb-2">5. Student Data Protection</h4>
						<p class="text-sm text-gray-700 mb-3">
							As an educational platform, we are committed to protecting student data in compliance with applicable educational privacy laws. We only collect data necessary for educational purposes and maintain strict confidentiality standards.
						</p>

						<h4 class="text-lg font-semibold text-gray-900 mt-4 mb-2">6. Your Rights</h4>
						<p class="text-sm text-gray-700 mb-3">
							You have the right to access, correct, or delete your personal information. You may also object to or restrict certain processing of your data. To exercise these rights, please contact us at privacy@chtmcooks.edu.ph
						</p>

						<h4 class="text-lg font-semibold text-gray-900 mt-4 mb-2">7. Cookies and Tracking</h4>
						<p class="text-sm text-gray-700 mb-3">
							We use cookies and similar tracking technologies to track activity on our platform and hold certain information. You can instruct your browser to refuse all cookies or to indicate when a cookie is being sent.
						</p>

						<h4 class="text-lg font-semibold text-gray-900 mt-4 mb-2">8. Changes to Privacy Policy</h4>
						<p class="text-sm text-gray-700 mb-3">
							We may update our Privacy Policy from time to time. We will notify you of any changes by posting the new Privacy Policy on this page and updating the "Last updated" date.
						</p>

						<h4 class="text-lg font-semibold text-gray-900 mt-4 mb-2">9. Contact Us</h4>
						<p class="text-sm text-gray-700 mb-3">
							If you have any questions about this Privacy Policy, please contact us at privacy@chtmcooks.edu.ph
						</p>
					</div>
				</div>
				
				<div class="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
					<button
						type="button"
						onclick={() => showPrivacyModal = false}
						class="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-blue-600 text-base font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:ml-3 sm:w-auto sm:text-sm"
					>
						Close
					</button>
				</div>
			</div>
		</div>
	</div>
{/if}
