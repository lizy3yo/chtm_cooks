<script lang="ts">
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { authStore, user } from '$lib/stores/auth';
	import { toastStore } from '$lib/stores/toast';
	import { sidebarCollapsed, mobileSidebarOpen } from '$lib/stores/superadmin';
	import logo from '$lib/assets/CHTM_LOGO.png';
	import SignOutModal from '$lib/components/ui/SignOutModal.svelte';
	import { ChevronDown, ChevronRight } from 'lucide-svelte';
	
	interface NavSubItem {
		name: string;
		href: string;
	}
	
	interface NavItem {
		name: string;
		href?: string;
		icon: string;
		badge?: number;
		children?: NavSubItem[];
	}
	
	interface NavSection {
		title?: string;
		items: NavItem[];
	}
	
	let isMobileMenuOpen = $derived($mobileSidebarOpen);
	let signOutOpen = $state(false);
	
	// Track expanded sections
	let expandedSections = $state<Record<string, boolean>>({
		users: false,
		classCodes: false,
		requests: false,
		analytics: false,
		auditLogs: false,
		inventory: false,
		system: false,
		security: false
	});
	
	function toggleCollapse() {
		sidebarCollapsed.update(val => !val);
	}
	
	function toggleSection(key: string) {
		if ($sidebarCollapsed) {
			// If sidebar is collapsed, expand it first
			sidebarCollapsed.set(false);
		}
		expandedSections[key] = !expandedSections[key];
	}
	
	const navSections: NavSection[] = [
		{
			items: [
				{
					name: 'Dashboard',
					href: '/superadmin/dashboard',
					icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6'
				}
			]
		},
		{
			title: 'User Management',
			items: [
				{
					name: 'Users',
					href: '/superadmin/users',
					icon: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z'
				},
				{
					name: 'Class Codes',
					href: '/superadmin/class-codes',
					icon: 'M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10'
				}
			]
		},
		{
			title: 'Operations',
			items: [
				{
					name: 'Requests',
					href: '/superadmin/requests',
					icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2'
				},
				{
					name: 'Inventory',
					href: '/superadmin/inventory',
					icon: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4'
				}
			]
		},
		{
			title: 'Analytics & Reporting',
			items: [
				{
					name: 'Analytics',
					href: '/superadmin/analytics',
					icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z'
				},
				{
					name: 'Audit Logs',
					href: '/superadmin/audit',
					icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z'
				}
			]
		},
		{
			title: 'System Administration',
			items: [
				{
					name: 'Database',
					href: '/superadmin/database',
					icon: 'M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4'
				},
				{
					name: 'Security',
					href: '/superadmin/security',
					icon: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z'
				}
			]
		}
	];
	
	function isActive(href: string): boolean {
		return $page.url.pathname === href || $page.url.pathname.startsWith(href + '/');
	}
	
	function isParentActive(item: NavItem): boolean {
		if (item.href && isActive(item.href)) return true;
		if (item.children) {
			return item.children.some(child => isActive(child.href));
		}
		return false;
	}
	
	function getSectionKey(itemName: string): string {
		return itemName.toLowerCase().replace(/\s+/g, '');
	}
	
	async function handleLogout() {
		await authStore.logout();
		toastStore.success('You have been logged out successfully.', 'Logged Out');
		goto('/auth/login');
	}
	
	function closeMobileMenu() {
		mobileSidebarOpen.set(false);
	}
</script>

<!-- Overlay for mobile -->
{#if $mobileSidebarOpen}
	<button
		type="button"
		class="fixed inset-0 z-40 bg-black bg-opacity-50 lg:hidden"
		onclick={closeMobileMenu}
		onkeydown={(e) => e.key === 'Escape' && closeMobileMenu()}
		aria-label="Close sidebar"
	></button>
{/if}

<!-- Sidebar -->
<aside
	class="fixed inset-y-0 left-0 z-50 transform border-r border-gray-200 shadow-lg transition-all duration-300 ease-in-out {$mobileSidebarOpen
		? 'translate-x-0'
		: '-translate-x-full'} lg:translate-x-0 {$sidebarCollapsed ? 'lg:w-20' : 'w-56 md:w-72'}"
	style="background-color: #ffffff;"
>
	<div class="flex h-full flex-col overflow-hidden">
		<!-- Logo -->
		<div class="flex h-16 items-center justify-between border-b border-gray-200 px-4 overflow-hidden {$sidebarCollapsed ? 'lg:px-3 lg:justify-center' : 'px-6'}">
			<div class="flex items-center overflow-hidden">
				<div class="flex h-10 w-10 items-center justify-center rounded-lg bg-white shadow-md transition-all hover:shadow-lg {$sidebarCollapsed ? 'lg:h-9 lg:w-9' : ''}">
					<img src={logo} alt="CHTM Logo" class="h-8 w-8 object-contain {$sidebarCollapsed ? 'lg:h-7 lg:w-7' : ''}" />
				</div>
				{#if !$sidebarCollapsed}
					<div class="ml-3">
						<h1 class="text-lg font-bold text-gray-900">Superadmin</h1>
						<p class="text-xs text-gray-500">System Control</p>
					</div>
				{/if}
			</div>
			
			<!-- Desktop Collapse Toggle - In Header when expanded -->
			{#if !$sidebarCollapsed}
				<button
					onclick={toggleCollapse}
					class="hidden lg:flex items-center justify-center h-8 w-8 rounded-lg hover:bg-pink-50 hover:text-pink-600 text-gray-600 transition-all duration-200"
					aria-label="Collapse sidebar"
					title="Collapse sidebar"
				>
					<svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M11 19l-7-7 7-7m8 14l-7-7 7-7"/>
					</svg>
				</button>
			{/if}
		</div>
		
		<!-- Desktop Collapse Toggle - Floating on Side when collapsed -->
		{#if $sidebarCollapsed}
			<button
				onclick={toggleCollapse}
				class="hidden lg:flex shrink-0 items-center justify-center h-8 w-8 rounded-full bg-white border-2 border-gray-200 hover:border-pink-500 hover:bg-pink-50 hover:text-pink-600 text-gray-600 shadow-md hover:shadow-lg transition-all duration-200 absolute top-4 -right-4 z-50"
				aria-label="Expand sidebar"
				title="Expand sidebar"
			>
				<svg class="h-4 w-4 rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M11 19l-7-7 7-7m8 14l-7-7 7-7"/>
				</svg>
			</button>
		{/if}
		
		<!-- Navigation -->
		<nav class="flex-1 overflow-y-auto overflow-x-hidden px-3 py-4 {$sidebarCollapsed ? 'lg:px-2 lg:py-3' : ''}">
			{#each navSections as section, sectionIndex}
				<div class="mb-6 {sectionIndex === 0 ? '' : 'mt-6'}">
					<!-- Section Title -->
					{#if section.title && !$sidebarCollapsed}
						<h3 class="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
							{section.title}
						</h3>
					{/if}
					
					<!-- Section Items -->
					<div class="space-y-1 {$sidebarCollapsed ? 'lg:space-y-2' : ''}">
						{#each section.items as item}
							{@const sectionKey = getSectionKey(item.name)}
							{@const isItemActive = isParentActive(item)}
							{@const isExpanded = expandedSections[sectionKey]}
							
							{#if item.children}
								<!-- Parent Item with Children -->
								<div>
									<button
										onclick={() => toggleSection(sectionKey)}
										class="relative flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200 {isItemActive
											? 'bg-pink-50 text-pink-700 shadow-sm'
											: 'text-gray-700 hover:bg-pink-50 hover:text-pink-600 hover:shadow-sm'} {$sidebarCollapsed ? 'lg:justify-center lg:px-2 lg:py-3' : ''}"
										title={$sidebarCollapsed ? item.name : ''}
									>
										{#if isItemActive && $sidebarCollapsed}
											<div class="absolute left-0 top-1/2 -translate-y-1/2 h-8 w-1 bg-pink-600 rounded-r-full hidden lg:block"></div>
										{/if}
										<div class="flex items-center {$sidebarCollapsed ? 'lg:justify-center' : ''}">
											<svg
												class="h-5 w-5 transition-all {isItemActive ? 'text-pink-600 scale-110' : 'text-gray-400'} {$sidebarCollapsed ? 'lg:h-6 lg:w-6' : ''}"
												fill="none"
												stroke="currentColor"
												viewBox="0 0 24 24"
											>
												<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d={item.icon}/>
											</svg>
											{#if !$sidebarCollapsed}
												<span class="ml-3">{item.name}</span>
											{/if}
										</div>
										{#if !$sidebarCollapsed}
											<div class="transition-transform duration-200 {isExpanded ? 'rotate-0' : '-rotate-90'}">
												<ChevronDown size={16} class="text-gray-400" />
											</div>
										{/if}
									</button>
									
									<!-- Children Items -->
									{#if isExpanded && !$sidebarCollapsed}
										<div class="ml-4 mt-1 space-y-1 border-l-2 border-gray-200 pl-4">
											{#each item.children as child}
												{@const isChildActive = isActive(child.href)}
												<a
													href={child.href}
													onclick={closeMobileMenu}
													class="block rounded-lg px-3 py-2 text-sm transition-all duration-200 {isChildActive
														? 'bg-pink-100 font-medium text-pink-700'
														: 'text-gray-600 hover:bg-pink-50 hover:text-pink-600'}"
												>
													{child.name}
												</a>
											{/each}
										</div>
									{/if}
								</div>
							{:else if item.href}
								<!-- Single Item without Children -->
								<a
									href={item.href}
									onclick={closeMobileMenu}
									class="relative flex items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200 {isItemActive
										? 'bg-pink-50 text-pink-700 shadow-sm'
										: 'text-gray-700 hover:bg-pink-50 hover:text-pink-600 hover:shadow-sm'} {$sidebarCollapsed ? 'lg:justify-center lg:px-2 lg:py-3' : ''}"
									title={$sidebarCollapsed ? item.name : ''}
								>
									{#if isItemActive && $sidebarCollapsed}
										<div class="absolute left-0 top-1/2 -translate-y-1/2 h-8 w-1 bg-pink-600 rounded-r-full hidden lg:block"></div>
									{/if}
									<div class="flex items-center {$sidebarCollapsed ? 'lg:justify-center' : ''}">
										<svg
											class="h-5 w-5 transition-all {isItemActive ? 'text-pink-600 scale-110' : 'text-gray-400'} {$sidebarCollapsed ? 'lg:h-6 lg:w-6' : ''}"
											fill="none"
											stroke="currentColor"
											viewBox="0 0 24 24"
										>
											<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d={item.icon}/>
										</svg>
										{#if !$sidebarCollapsed}
											<span class="ml-3">{item.name}</span>
										{/if}
									</div>
									{#if item.badge !== undefined && item.badge > 0}
										<span class="flex items-center justify-center min-w-5 h-5 px-1.5 text-xs font-semibold text-white bg-red-500 rounded-full {$sidebarCollapsed ? 'lg:absolute lg:top-1 lg:right-1' : ''}">
											{item.badge > 99 ? '99+' : item.badge}
										</span>
									{/if}
								</a>
							{/if}
						{/each}
					</div>
				</div>
			{/each}
		</nav>
	</div>
</aside>

<SignOutModal
	open={signOutOpen}
	onconfirm={handleLogout}
	oncancel={() => (signOutOpen = false)}
/>
