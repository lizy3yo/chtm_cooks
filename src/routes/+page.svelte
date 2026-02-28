<script lang="ts">
	import { goto } from '$app/navigation';
	import { isAuthenticated, user } from '$lib/stores/auth';
	import { onMount } from 'svelte';
	import logo from '$lib/assets/CHTM_LOGO.png';

	// Redirect if already logged in - reactive to auth state changes
	$effect(() => {
		if ($isAuthenticated && $user) {
			console.log('[HomePage] User authenticated, redirecting to dashboard...');
			if ($user.role === 'student') {
				goto('/student/dashboard');
			} else if ($user.role === 'instructor') {
				goto('/instructor/dashboard');
			} else if ($user.role === 'custodian') {
				goto('/custodian/dashboard');
			} else {
				goto('/admin/dashboard');
			}
		}
	});
</script>

<svelte:head>
	<title>CHTM Cooks - Kitchen Management System</title>
	<meta name="description" content="Welcome to CHTM Cooks - Gordon College Kitchen Management System" />
</svelte:head>

<div class="min-h-screen bg-gradient-to-br from-pink-50 via-white to-rose-50 flex items-center justify-center relative overflow-hidden px-4">
	<!-- Decorative Background Elements -->
	<div class="absolute inset-0 overflow-hidden pointer-events-none">
		<div class="absolute -top-40 -right-40 w-80 h-80 bg-pink-200 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-blob"></div>
		<div class="absolute -bottom-40 -left-40 w-80 h-80 bg-rose-200 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-blob animation-delay-2000"></div>
		<div class="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-80 h-80 bg-pink-100 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob animation-delay-4000"></div>
	</div>

	<!-- Main Content -->
	<div class="relative z-10 max-w-4xl mx-auto text-center py-12">
		<!-- Logo and Branding -->
		<div class="mb-12 animate-fadeIn">
			<div class="flex justify-center mb-8">
				<div class="relative group">
					<div class="absolute inset-0 bg-gradient-to-r from-pink-600 to-rose-600 rounded-3xl blur-2xl opacity-20 group-hover:opacity-30 transition-opacity duration-300"></div>
					<img 
						src={logo} 
						alt="CHTM Logo" 
						class="relative h-32 md:h-40 lg:h-48 w-auto object-contain drop-shadow-2xl transform group-hover:scale-105 transition-transform duration-300"
					/>
				</div>
			</div>
			
			<h1 class="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold text-gray-900 mb-4 tracking-tight">
				CHTM <span class="text-gradient">Cooks</span>
			</h1>
			
			<div class="h-1 w-32 mx-auto bg-gradient-to-r from-pink-600 to-rose-600 rounded-full mb-6"></div>
			
			<p class="text-lg md:text-xl lg:text-2xl text-gray-600 font-medium mb-8">
				Gordon College Kitchen Management System
			</p>
			
			<p class="text-base md:text-lg text-gray-700 max-w-2xl mx-auto mb-12 leading-relaxed">
				Streamline your culinary education with our comprehensive kitchen management platform.
			</p>
		</div>

		<!-- CTA Buttons -->
		<div class="flex flex-col sm:flex-row gap-4 justify-center items-center mb-12 animate-fadeIn">
			<a
				href="/auth/login"
				class="group relative w-full sm:w-auto px-10 py-5 bg-gradient-to-r from-pink-600 to-rose-600 text-white font-semibold rounded-2xl shadow-xl hover:shadow-2xl transition-all duration-300 transform hover:scale-105 overflow-hidden"
			>
				<span class="relative z-10 flex items-center justify-center gap-2 text-lg">
					<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
					</svg>
					Sign In
				</span>
				<div class="absolute inset-0 bg-gradient-to-r from-pink-700 to-rose-700 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
			</a>
			
			<a
				href="/auth/register"
				class="group relative w-full sm:w-auto px-10 py-5 bg-white text-pink-600 font-semibold rounded-2xl shadow-xl hover:shadow-2xl border-2 border-pink-600 transition-all duration-300 transform hover:scale-105 overflow-hidden"
			>
				<span class="relative z-10 flex items-center justify-center gap-2 text-lg">
					<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
					</svg>
					Create Account
				</span>
				<div class="absolute inset-0 bg-gradient-to-r from-pink-50 to-rose-50 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
			</a>
		</div>

		<!-- Footer -->
		<div class="mt-16 pt-8 border-t border-pink-100 animate-fadeIn">
			<p class="text-sm text-gray-600">
				© 2026 Gordon College - College of Hospitality and Tourism Management
			</p>
		</div>
	</div>
</div>

<style>
	@keyframes blob {
		0%, 100% {
			transform: translate(0, 0) scale(1);
		}
		33% {
			transform: translate(30px, -50px) scale(1.1);
		}
		66% {
			transform: translate(-20px, 20px) scale(0.9);
		}
	}

	.animate-blob {
		animation: blob 7s infinite;
	}

	.animation-delay-2000 {
		animation-delay: 2s;
	}

	.animation-delay-4000 {
		animation-delay: 4s;
	}
</style>
