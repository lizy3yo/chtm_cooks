<script lang="ts">
	import { goto } from '$app/navigation';
	import { authStore, user } from '$lib/stores/auth';
	import type { Snippet } from 'svelte';
	
	interface Props {
		children: Snippet;
	}
	
	let { children }: Props = $props();
	
	const navItems = [
		{ name: 'Dashboard', href: '/admin/dashboard', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
		{ name: 'Users', href: '/admin/users', icon: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z' },
		{ name: 'Shortcut Keys', href: '/admin/shortcut-keys', icon: 'M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z' },
		{ name: 'Settings', href: '/admin/settings', icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z' }
	];
	
	async function handleLogout() {
		await authStore.logout();
		goto('/auth/login');
	}
</script>

<div class="flex min-h-screen bg-gray-100">
	<!-- Sidebar -->
	<aside class="fixed inset-y-0 left-0 z-50 w-64 border-r border-gray-200 bg-white">
		<!-- Logo -->
		<div class="flex h-16 items-center border-b border-gray-200 px-6">
			<div class="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600">
				<svg class="h-6 w-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/>
				</svg>
			</div>
			<span class="ml-3 text-xl font-bold text-gray-900">Admin Panel</span>
		</div>
		
		<!-- Navigation -->
		<nav class="flex-1 space-y-1 px-3 py-4">
			{#each navItems as item}
				<a
					href={item.href}
					class="group flex items-center rounded-lg px-3 py-2 text-sm font-medium transition-colors hover:bg-gray-100"
				>
					<svg class="mr-3 h-5 w-5 text-gray-400 group-hover:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d={item.icon}/>
					</svg>
					{item.name}
				</a>
			{/each}
		</nav>
		
		<!-- User Info -->
		<div class="absolute bottom-0 w-64 border-t border-gray-200 bg-gray-50 p-4">
			{#if $user}
				<div class="mb-3">
					<p class="text-sm font-medium text-gray-900">
						{$user.firstName} {$user.lastName}
					</p>
					<p class="text-xs text-gray-500 capitalize">{$user.role}</p>
				</div>
			{/if}
			<button
				onclick={handleLogout}
				class="flex w-full items-center justify-center rounded-lg bg-gray-200 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-300"
			>
				<svg class="mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/>
				</svg>
				Logout
			</button>
		</div>
	</aside>
	
	<!-- Main Content -->
	<main class="ml-64 flex-1">
		<div class="mx-auto max-w-7xl px-8 py-8">
			{@render children()}
		</div>
	</main>
</div>
