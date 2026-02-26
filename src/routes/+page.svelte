<script lang="ts">
	import { goto } from '$app/navigation';
	import { isAuthenticated, user } from '$lib/stores/auth';
	import { onMount } from 'svelte';

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

<div class="min-h-screen bg-gradient-to-br from-blue-50 via-white to-orange-50">
	<!-- Hero Section -->
	<div class="container mx-auto px-4 py-16">
		<div class="text-center mb-16">
			<!-- Logo/Brand -->
			<div class="mb-8">
				<h1 class="text-5xl md:text-6xl font-bold text-gray-900 mb-4">
					🍳 CHTM <span class="text-blue-600">Cooks</span>
				</h1>
				<p class="text-xl text-gray-600">
					Gordon College Kitchen Management System
				</p>
			</div>

			<!-- Hero Description -->
			<div class="max-w-2xl mx-auto mb-12">
				<p class="text-lg text-gray-700 mb-4">
					Streamline your culinary education with our comprehensive kitchen management platform.
				</p>
				<p class="text-gray-600">
					Track resources, manage schedules, and enhance your learning experience.
				</p>
			</div>

			<!-- CTA Buttons -->
			<div class="flex flex-col sm:flex-row gap-4 justify-center items-center">
				<a
					href="/auth/login"
					class="px-8 py-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg shadow-lg hover:shadow-xl transition-all duration-200 transform hover:scale-105"
				>
					Sign In
				</a>
				<a
					href="/auth/register"
					class="px-8 py-4 bg-white hover:bg-gray-50 text-blue-600 font-semibold rounded-lg shadow-lg hover:shadow-xl border-2 border-blue-600 transition-all duration-200 transform hover:scale-105"
				>
					Create Account
				</a>
			</div>

			<!-- Staff Access Link -->
			<div class="mt-8">
				<a
					href="/auth/staff-access"
					class="text-sm text-gray-600 hover:text-gray-900 underline"
				>
					Staff & Admin Access
				</a>
				<p class="text-xs text-gray-500 mt-2">
					Use keyboard shortcuts: Ctrl+Shift+K (Staff) or Ctrl+Shift+Alt+K (Superadmin)
				</p>
			</div>
		</div>

		<!-- Features Section -->
		<div class="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto mt-20">
			<!-- Feature 1 -->
			<div class="bg-white rounded-xl p-6 shadow-md hover:shadow-xl transition-shadow">
				<div class="text-4xl mb-4">👨‍🍳</div>
				<h3 class="text-xl font-semibold mb-2 text-gray-900">For Students</h3>
				<p class="text-gray-600">
					Access your class schedules, track progress, and manage your culinary journey.
				</p>
			</div>

			<!-- Feature 2 -->
			<div class="bg-white rounded-xl p-6 shadow-md hover:shadow-xl transition-shadow">
				<div class="text-4xl mb-4">👔</div>
				<h3 class="text-xl font-semibold mb-2 text-gray-900">For Instructors</h3>
				<p class="text-gray-600">
					Manage classes, monitor student progress, and streamline kitchen operations.
				</p>
			</div>

			<!-- Feature 3 -->
			<div class="bg-white rounded-xl p-6 shadow-md hover:shadow-xl transition-shadow">
				<div class="text-4xl mb-4">🔧</div>
				<h3 class="text-xl font-semibold mb-2 text-gray-900">For Custodians</h3>
				<p class="text-gray-600">
					Track inventory, manage equipment, and maintain kitchen facilities efficiently.
				</p>
			</div>
		</div>

		<!-- About Section -->
		<div class="max-w-3xl mx-auto mt-20 text-center">
			<h2 class="text-3xl font-bold text-gray-900 mb-6">About CHTM Cooks</h2>
			<p class="text-gray-700 mb-4">
				The College of Hospitality and Tourism Management (CHTM) at Gordon College 
				is committed to providing world-class culinary education.
			</p>
			<p class="text-gray-600">
				Our Kitchen Management System helps students, staff, and administrators 
				coordinate activities, manage resources, and enhance the learning experience.
			</p>
		</div>

		<!-- Security Features Notice -->
		<div class="max-w-3xl mx-auto mt-16 bg-blue-50 rounded-xl p-6 border border-blue-200">
			<h3 class="text-lg font-semibold text-blue-900 mb-3">🔒 Secure & Private</h3>
			<ul class="text-sm text-blue-800 space-y-2">
				<li>✓ Email verification required for all accounts</li>
				<li>✓ Role-based access control (Student, Instructor, Custodian, Superadmin)</li>
				<li>✓ "Remember Me" feature for convenient access (optional)</li>
				<li>✓ Password reset via email</li>
				<li>✓ Industry-standard security practices</li>
			</ul>
		</div>

		<!-- Footer -->
		<div class="mt-20 text-center text-gray-500 text-sm">
			<p>© 2026 Gordon College - College of Hospitality and Tourism Management</p>
			<p class="mt-2">
				<a href="javascript:void(0)" class="hover:text-gray-700">Privacy Policy</a> • 
				<a href="javascript:void(0)" class="hover:text-gray-700">Terms of Service</a> • 
				<a href="javascript:void(0)" class="hover:text-gray-700">Contact Support</a>
			</p>
		</div>
	</div>
</div>

<style>
	/* Add smooth animations */
	:global(body) {
		overflow-x: hidden;
	}
</style>
