<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { isAuthenticated, user } from '$lib/stores/auth';
	import favicon from '$lib/assets/CHTM_LOGO.png';

	let scrollY = $state(0);
	let isVisible = $state(false);

	onMount(() => {
		isVisible = true;
		
		const handleScroll = () => {
			scrollY = window.scrollY;
		};
		
		window.addEventListener('scroll', handleScroll);
		return () => window.removeEventListener('scroll', handleScroll);
	});

	function handleGetStarted() {
		if ($isAuthenticated && $user) {
			if ($user.role === 'student') {
				goto('/student/dashboard');
			} else if ($user.role === 'instructor') {
				goto('/instructor/dashboard');
			} else if ($user.role === 'custodian') {
				goto('/custodian/dashboard');
			} else if ($user.role === 'superadmin' || $user.role === 'admin') {
				goto('/superadmin/dashboard');
			}
		} else {
			goto('/auth/login');
		}
	}

	const features = [
		{
			icon: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4',
			title: 'Equipment Catalog',
			description: 'Comprehensive inventory management with real-time availability tracking',
			color: 'from-pink-500 to-rose-500',
			bgColor: 'bg-pink-50',
			iconColor: 'text-pink-600'
		},
		{
			icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4',
			title: 'Smart Requests',
			description: 'Streamlined borrowing workflow with automated approval processes',
			color: 'from-purple-500 to-indigo-500',
			bgColor: 'bg-purple-50',
			iconColor: 'text-purple-600'
		},
		{
			icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z',
			title: 'Advanced Analytics',
			description: 'Data-driven insights with customizable reports and visualizations',
			color: 'from-blue-500 to-cyan-500',
			bgColor: 'bg-blue-50',
			iconColor: 'text-blue-600'
		},
		{
			icon: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z',
			title: 'Role-Based Access',
			description: 'Secure multi-tier authentication with granular permission controls',
			color: 'from-emerald-500 to-teal-500',
			bgColor: 'bg-emerald-50',
			iconColor: 'text-emerald-600'
		}
	];

	const stats = [
		{ value: '99.9%', label: 'Uptime' },
		{ value: '24/7', label: 'Support' },
		{ value: '< 100ms', label: 'Response Time' },
		{ value: 'SOC 2', label: 'Compliant' }
	];
</script>

<svelte:head>
	<title>CHTM Cooks - Modern Laboratory Management System</title>
	<meta name="description" content="Industry-leading laboratory equipment management platform with real-time tracking, smart workflows, and advanced analytics." />
</svelte:head>

<div class="relative min-h-screen overflow-hidden bg-white">
	<!-- Animated Background -->
	<div class="pointer-events-none fixed inset-0 z-0">
		<div class="absolute -left-1/4 -top-1/4 h-96 w-96 animate-blob rounded-full bg-pink-200 opacity-30 mix-blend-multiply blur-3xl filter"></div>
		<div class="animation-delay-2000 absolute -right-1/4 -top-1/4 h-96 w-96 animate-blob rounded-full bg-purple-200 opacity-30 mix-blend-multiply blur-3xl filter"></div>
		<div class="animation-delay-4000 absolute -bottom-1/4 left-1/3 h-96 w-96 animate-blob rounded-full bg-rose-200 opacity-30 mix-blend-multiply blur-3xl filter"></div>
	</div>

	<!-- Navigation -->
	<nav class="sticky top-0 z-50 border-b border-gray-100 bg-white/80 backdrop-blur-xl transition-all duration-300"
		class:shadow-lg={scrollY > 10}
		class:border-gray-200={scrollY > 10}>
		<div class="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
			<div class="flex h-20 items-center justify-between">
				<div class="flex items-center gap-3 transition-transform duration-300 hover:scale-105">
					<div class="relative">
						<div class="absolute inset-0 animate-pulse rounded-full bg-pink-400 opacity-20 blur-md"></div>
						<img src={favicon} alt="CHTM Logo" class="relative h-12 w-12" />
					</div>
					<div>
						<span class="text-2xl font-black tracking-tight text-gray-900">CHTM Cooks</span>
						<div class="text-xs font-medium text-gray-500">Laboratory Management</div>
					</div>
				</div>
				<div class="flex items-center gap-3">
					<button
						onclick={() => goto('/auth/login')}
						class="rounded-xl px-5 py-2.5 text-sm font-semibold text-gray-700 transition-all duration-200 hover:bg-gray-100 hover:text-gray-900"
					>
						Sign In
					</button>
					<button
						onclick={() => goto('/auth/register')}
						class="group relative overflow-hidden rounded-xl bg-linear-to-r from-pink-600 to-rose-600 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-pink-500/30 transition-all duration-300 hover:shadow-xl hover:shadow-pink-500/40 hover:scale-105"
					>
						<span class="relative z-10">Get Started</span>
						<div class="absolute inset-0 bg-linear-to-r from-pink-700 to-rose-700 opacity-0 transition-opacity duration-300 group-hover:opacity-100"></div>
					</button>
				</div>
			</div>
		</div>
	</nav>

	<!-- Hero Section -->
	<main class="relative z-10">
		<section class="mx-auto max-w-7xl px-4 pt-20 pb-24 sm:px-6 lg:px-8">
			<div class="grid items-center gap-12 lg:grid-cols-2">
				<!-- Left Column: Content -->
				<div class="text-center lg:text-left">
					<!-- Badge -->
					<div class="mb-8 inline-flex items-center gap-2 rounded-full border border-pink-200 bg-pink-50 px-4 py-2 text-sm font-medium text-pink-700 transition-all duration-300 hover:border-pink-300 hover:bg-pink-100"
						class:opacity-0={!isVisible}
						class:translate-y-4={!isVisible}
						style="transition: opacity 0.6s ease-out, transform 0.6s ease-out;">
						<svg class="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
							<path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" />
						</svg>
						<span>Industry-Leading Laboratory Management Platform</span>
					</div>

					<!-- Main Heading -->
					<h1 class="mb-6 text-5xl font-black tracking-tight text-gray-900 sm:text-6xl lg:text-7xl"
						class:opacity-0={!isVisible}
						class:translate-y-4={!isVisible}
						style="transition: opacity 0.8s ease-out 0.2s, transform 0.8s ease-out 0.2s;">
						Elevate Your
						<span class="relative inline-block">
							<span class="bg-linear-to-r from-pink-600 via-rose-600 to-purple-600 bg-clip-text text-transparent">Laboratory</span>
							<svg class="absolute -bottom-2 left-0 w-full" height="12" viewBox="0 0 300 12" fill="none" xmlns="http://www.w3.org/2000/svg">
								<path d="M2 10C50 5 100 2 150 2C200 2 250 5 298 10" stroke="url(#gradient)" stroke-width="3" stroke-linecap="round"/>
								<defs>
									<linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="0%">
										<stop offset="0%" style="stop-color:#ec4899;stop-opacity:1" />
										<stop offset="50%" style="stop-color:#f43f5e;stop-opacity:1" />
										<stop offset="100%" style="stop-color:#a855f7;stop-opacity:1" />
									</linearGradient>
								</defs>
							</svg>
						</span>
						Management
					</h1>

					<p class="mb-8 max-w-2xl text-lg leading-relaxed text-gray-600 sm:text-xl lg:mx-0"
						class:opacity-0={!isVisible}
						class:translate-y-4={!isVisible}
						style="transition: opacity 1s ease-out 0.4s, transform 1s ease-out 0.4s;">
						Enterprise-grade platform for seamless equipment tracking, intelligent workflows, and data-driven decision making.
					</p>

					<!-- CTA Buttons -->
					<div class="mb-12 flex flex-col items-center justify-center gap-4 sm:flex-row lg:justify-start"
						class:opacity-0={!isVisible}
						class:translate-y-4={!isVisible}
						style="transition: opacity 1.2s ease-out 0.6s, transform 1.2s ease-out 0.6s;">
						<button
							onclick={handleGetStarted}
							class="group relative overflow-hidden rounded-2xl bg-linear-to-r from-pink-600 to-rose-600 px-10 py-5 text-lg font-bold text-white shadow-2xl shadow-pink-500/40 transition-all duration-300 hover:shadow-3xl hover:shadow-pink-500/50 hover:scale-105"
						>
							<span class="relative z-10 flex items-center gap-2">
								Start Free Trial
								<svg class="h-5 w-5 transition-transform duration-300 group-hover:translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7l5 5m0 0l-5 5m5-5H6" />
								</svg>
							</span>
							<div class="absolute inset-0 bg-linear-to-r from-pink-700 to-rose-700 opacity-0 transition-opacity duration-300 group-hover:opacity-100"></div>
						</button>
						<button
							onclick={() => goto('/auth/register')}
							class="group rounded-2xl border-2 border-gray-300 bg-white px-10 py-5 text-lg font-bold text-gray-700 shadow-lg transition-all duration-300 hover:border-gray-400 hover:bg-gray-50 hover:shadow-xl"
						>
							<span class="flex items-center gap-2">
								View Demo
								<svg class="h-5 w-5 transition-transform duration-300 group-hover:scale-110" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
								</svg>
							</span>
						</button>
					</div>

					<!-- Stats -->
					<div class="grid grid-cols-2 gap-4 sm:gap-6"
						class:opacity-0={!isVisible}
						class:translate-y-4={!isVisible}
						style="transition: opacity 1.4s ease-out 0.8s, transform 1.4s ease-out 0.8s;">
						{#each stats as stat}
							<div class="group rounded-2xl border border-gray-200 bg-white/50 p-4 backdrop-blur-sm transition-all duration-300 hover:border-pink-300 hover:bg-white hover:shadow-xl">
								<div class="text-2xl font-black text-gray-900 transition-colors duration-300 group-hover:text-pink-600 sm:text-3xl">{stat.value}</div>
								<div class="mt-1 text-xs font-medium text-gray-600 sm:text-sm">{stat.label}</div>
							</div>
						{/each}
					</div>
				</div>

				<!-- Right Column: Animated Dashboard Preview -->
				<div class="relative hidden lg:block"
					class:opacity-0={!isVisible}
					class:translate-x-8={!isVisible}
					style="transition: opacity 1s ease-out 0.4s, transform 1s ease-out 0.4s;">
					
					<!-- Main Dashboard Card -->
					<div class="relative z-10 overflow-hidden rounded-3xl border border-gray-200 bg-white p-6 shadow-2xl">
						<!-- Dashboard Header -->
						<div class="mb-6 flex items-center justify-between">
							<div class="flex items-center gap-3">
								<div class="h-10 w-10 rounded-xl bg-linear-to-br from-pink-500 to-rose-500 p-2">
									<svg class="h-full w-full text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
									</svg>
								</div>
								<div>
									<div class="text-sm font-bold text-gray-900">Inventory Overview</div>
									<div class="text-xs text-gray-500">Real-time tracking</div>
								</div>
							</div>
							<div class="flex gap-1">
								<div class="h-2 w-2 animate-pulse rounded-full bg-green-500"></div>
								<div class="h-2 w-2 animate-pulse rounded-full bg-green-500 animation-delay-200"></div>
								<div class="h-2 w-2 animate-pulse rounded-full bg-green-500 animation-delay-400"></div>
							</div>
						</div>

						<!-- Animated Chart -->
						<div class="mb-6 h-32 rounded-xl bg-linear-to-br from-pink-50 to-purple-50 p-4">
							<div class="flex h-full items-end justify-between gap-2">
								{#each [65, 45, 80, 55, 70, 50, 85] as height}
									<div class="flex-1 rounded-t-lg bg-linear-to-t from-pink-500 to-rose-400 animate-bar-grow" style="height: {height}%;"></div>
								{/each}
							</div>
						</div>

						<!-- Equipment Cards -->
						<div class="space-y-3">
							{#each [
								{ name: 'Beakers (250ml)', qty: 45, status: 'available', color: 'green' },
								{ name: 'Microscopes', qty: 12, status: 'low stock', color: 'yellow' },
								{ name: 'Test Tubes', qty: 120, status: 'available', color: 'green' }
							] as item, i}
								<div class="flex items-center justify-between rounded-xl border border-gray-100 bg-gray-50 p-3 animate-slide-in"
									style="animation-delay: {i * 150}ms;">
									<div class="flex items-center gap-3">
										<div class="h-10 w-10 rounded-lg bg-white p-2 shadow-sm">
											<svg class="h-full w-full text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
												<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
											</svg>
										</div>
										<div>
											<div class="text-sm font-semibold text-gray-900">{item.name}</div>
											<div class="text-xs text-gray-500">Qty: {item.qty}</div>
										</div>
									</div>
									<div class="flex items-center gap-2">
										<span class="rounded-full bg-{item.color}-100 px-2 py-1 text-xs font-medium text-{item.color}-700">
											{item.status}
										</span>
									</div>
								</div>
							{/each}
						</div>
					</div>

					<!-- Floating Request Card -->
					<div class="absolute -right-6 top-12 z-20 w-64 animate-float rounded-2xl border border-pink-200 bg-white p-4 shadow-xl">
						<div class="mb-3 flex items-center gap-2">
							<div class="h-8 w-8 rounded-lg bg-pink-100 p-1.5">
								<svg class="h-full w-full text-pink-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
								</svg>
							</div>
							<div>
								<div class="text-xs font-bold text-gray-900">New Request</div>
								<div class="text-xs text-gray-500">Just now</div>
							</div>
						</div>
						<div class="text-xs text-gray-600">Student requested 3 beakers for Chemistry Lab</div>
						<div class="mt-3 flex gap-2">
							<button class="flex-1 rounded-lg bg-pink-600 px-3 py-1.5 text-xs font-semibold text-white">Approve</button>
							<button class="flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700">Review</button>
						</div>
					</div>

					<!-- Floating Analytics Card -->
					<div class="absolute -left-6 bottom-12 z-20 w-56 animate-float-delayed rounded-2xl border border-purple-200 bg-white p-4 shadow-xl">
						<div class="mb-2 flex items-center gap-2">
							<div class="h-8 w-8 rounded-lg bg-purple-100 p-1.5">
								<svg class="h-full w-full text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
								</svg>
							</div>
							<div class="text-xs font-bold text-gray-900">Usage Analytics</div>
						</div>
						<div class="space-y-2">
							<div class="flex items-center justify-between text-xs">
								<span class="text-gray-600">Active Borrows</span>
								<span class="font-bold text-gray-900">24</span>
							</div>
							<div class="flex items-center justify-between text-xs">
								<span class="text-gray-600">Pending Returns</span>
								<span class="font-bold text-gray-900">8</span>
							</div>
							<div class="flex items-center justify-between text-xs">
								<span class="text-gray-600">Overdue Items</span>
								<span class="font-bold text-red-600">2</span>
							</div>
						</div>
					</div>

					<!-- Connection Lines Animation -->
					<svg class="pointer-events-none absolute inset-0 h-full w-full" style="z-index: 5;">
						<line x1="50%" y1="30%" x2="85%" y2="20%" stroke="url(#lineGradient)" stroke-width="2" stroke-dasharray="5,5" class="animate-dash" opacity="0.3" />
						<line x1="50%" y1="70%" x2="15%" y2="80%" stroke="url(#lineGradient)" stroke-width="2" stroke-dasharray="5,5" class="animate-dash animation-delay-1000" opacity="0.3" />
						<defs>
							<linearGradient id="lineGradient" x1="0%" y1="0%" x2="100%" y2="0%">
								<stop offset="0%" style="stop-color:#ec4899;stop-opacity:1" />
								<stop offset="100%" style="stop-color:#a855f7;stop-opacity:1" />
							</linearGradient>
						</defs>
					</svg>
				</div>
			</div>
		</section>

		<!-- Features Section -->
		<section class="bg-linear-to-b from-gray-50 to-white py-24">
			<div class="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
				<div class="mb-16 text-center">
					<h2 class="mb-4 text-5xl font-black tracking-tight text-gray-900">
						Powerful Features for Modern Labs
					</h2>
					<p class="mx-auto max-w-2xl text-lg text-gray-600">
						Everything you need to manage your laboratory equipment efficiently and effectively
					</p>
				</div>

				<div class="grid gap-8 md:grid-cols-2 lg:gap-12">
					{#each features as feature, i}
						<div class="group relative overflow-hidden rounded-3xl border border-gray-200 bg-white p-8 transition-all duration-500 hover:border-transparent hover:shadow-2xl hover:scale-105"
							style="transition-delay: {i * 100}ms;">
							<!-- Gradient overlay on hover -->
							<div class="absolute inset-0 bg-linear-to-br {feature.color} opacity-0 transition-opacity duration-500 group-hover:opacity-5"></div>
							
							<div class="relative z-10">
								<div class="mb-6 inline-flex h-16 w-16 items-center justify-center rounded-2xl {feature.bgColor} transition-all duration-500 group-hover:scale-110 group-hover:rotate-6">
									<svg class="h-8 w-8 {feature.iconColor}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d={feature.icon} />
									</svg>
								</div>
								
								<h3 class="mb-3 text-2xl font-bold text-gray-900 transition-colors duration-300 group-hover:text-pink-600">
									{feature.title}
								</h3>
								
								<p class="text-base leading-relaxed text-gray-600">
									{feature.description}
								</p>

								<div class="mt-6 flex items-center gap-2 text-sm font-semibold text-pink-600 opacity-0 transition-all duration-300 group-hover:opacity-100">
									Learn more
									<svg class="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
									</svg>
								</div>
							</div>
						</div>
					{/each}
				</div>
			</div>
		</section>

		<!-- CTA Section -->
		<section class="relative overflow-hidden bg-linear-to-br from-pink-600 via-rose-600 to-purple-600 py-24">
			<div class="absolute inset-0 bg-grid-white/10"></div>
			<div class="relative z-10 mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
				<h2 class="mb-6 text-5xl font-black tracking-tight text-white">
					Ready to Transform Your Lab?
				</h2>
				<p class="mb-10 text-xl text-pink-100">
					Join hundreds of institutions already using CHTM Cooks to streamline their operations
				</p>
				<div class="flex flex-col items-center justify-center gap-4 sm:flex-row">
					<button
						onclick={handleGetStarted}
						class="group rounded-2xl bg-white px-10 py-5 text-lg font-bold text-pink-600 shadow-2xl transition-all duration-300 hover:bg-gray-50 hover:shadow-3xl hover:scale-105"
					>
						<span class="flex items-center gap-2">
							Get Started Now
							<svg class="h-5 w-5 transition-transform duration-300 group-hover:translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7l5 5m0 0l-5 5m5-5H6" />
							</svg>
						</span>
					</button>
					<button
						onclick={() => goto('/auth/login')}
						class="rounded-2xl border-2 border-white/30 bg-white/10 px-10 py-5 text-lg font-bold text-white backdrop-blur-sm transition-all duration-300 hover:border-white/50 hover:bg-white/20"
					>
						Sign In
					</button>
				</div>
			</div>
		</section>
	</main>

	<!-- Footer -->
	<footer class="border-t border-gray-200 bg-white">
		<div class="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
			<div class="flex flex-col items-center justify-between gap-4 sm:flex-row">
				<div class="flex items-center gap-3">
					<img src={favicon} alt="CHTM Logo" class="h-8 w-8" />
					<span class="text-lg font-bold text-gray-900">CHTM Cooks</span>
				</div>
				<p class="text-sm text-gray-600">
					© {new Date().getFullYear()} CHTM Cooks. All rights reserved.
				</p>
			</div>
		</div>
	</footer>
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

	@keyframes float {
		0%, 100% {
			transform: translateY(0px);
		}
		50% {
			transform: translateY(-20px);
		}
	}

	@keyframes float-delayed {
		0%, 100% {
			transform: translateY(0px);
		}
		50% {
			transform: translateY(-15px);
		}
	}

	@keyframes slide-in {
		from {
			opacity: 0;
			transform: translateX(-20px);
		}
		to {
			opacity: 1;
			transform: translateX(0);
		}
	}

	@keyframes bar-grow {
		from {
			transform: scaleY(0);
			transform-origin: bottom;
		}
		to {
			transform: scaleY(1);
			transform-origin: bottom;
		}
	}

	@keyframes dash {
		to {
			stroke-dashoffset: -20;
		}
	}

	.animate-blob {
		animation: blob 7s infinite;
	}

	.animate-float {
		animation: float 6s ease-in-out infinite;
	}

	.animate-float-delayed {
		animation: float-delayed 7s ease-in-out infinite;
	}

	.animate-slide-in {
		animation: slide-in 0.6s ease-out forwards;
		opacity: 0;
	}

	.animate-bar-grow {
		animation: bar-grow 1.5s ease-out forwards;
	}

	.animate-dash {
		animation: dash 20s linear infinite;
	}

	.animation-delay-200 {
		animation-delay: 0.2s;
	}

	.animation-delay-400 {
		animation-delay: 0.4s;
	}

	.animation-delay-1000 {
		animation-delay: 1s;
	}

	.animation-delay-2000 {
		animation-delay: 2s;
	}

	.animation-delay-4000 {
		animation-delay: 4s;
	}

	.bg-grid-white\/10 {
		background-image: linear-gradient(to right, rgba(255, 255, 255, 0.1) 1px, transparent 1px),
			linear-gradient(to bottom, rgba(255, 255, 255, 0.1) 1px, transparent 1px);
		background-size: 40px 40px;
	}
</style>
