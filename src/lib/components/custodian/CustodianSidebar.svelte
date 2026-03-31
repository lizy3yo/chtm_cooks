<script lang="ts">
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { authStore, user } from '$lib/stores/auth';
	import { toastStore } from '$lib/stores/toast';
	import { sidebarCollapsed } from '$lib/stores/custodian';
	import { mobileSidebarOpen } from '$lib/stores/custodian';
	import logo from '$lib/assets/CHTM_LOGO.png';
	import SignOutModal from '$lib/components/ui/SignOutModal.svelte';
	
	interface NavItem {
		name: string;
		href: string;
		icon: string;
		children?: { name: string; href: string }[];
	}
	
	let isMobileMenuOpen = $derived($mobileSidebarOpen);
	let signOutOpen = $state(false);
	let expandedSections = $state<Record<string, boolean>>({
		inventory: false,
		requests: false,
		financial: false,
		operations: false,
		reports: false
	});
	
	function toggleCollapse() {
		sidebarCollapsed.update(val => !val);
	}
	
	const navItems: NavItem[] = [
		{
			name: 'Dashboard',
			href: '/custodian/dashboard',
			icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6'
		},
		{
			name: 'Inventory',
			href: '/custodian/inventory',
			icon: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4'
		},
		{
			name: 'Requests & Loans',
			href: '/custodian/requests',
			icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2'
		},
		{
			name: 'Resource Management',
			href: '/custodian/financial',
			icon: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4'
		},
		{
			name: 'Operations',
			href: '/custodian/operations',
			icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z'
		},
		{
			name: 'Reports & Analytics',
			href: '/custodian/reports',
			icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z'
		}
	];
	
	function toggleSection(section: string) {
		expandedSections[section] = !expandedSections[section];
	}
	
	function isActive(href: string): boolean {
		return $page.url.pathname === href || $page.url.pathname.startsWith(href + '/');
	}
	
	function getSectionKey(itemName: string): string {
		return itemName.toLowerCase().replace(/\s+&\s+/g, '-').replace(/\s+/g, '-');
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
	<div
		class="fixed inset-0 z-40 bg-black bg-opacity-50 lg:hidden"
		onclick={closeMobileMenu}
		role="button"
		tabindex="0"
	></div>
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
						<h1 class="text-lg font-bold text-gray-900">Custodian</h1>
						<p class="text-xs text-gray-500">Lab Management</p>
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
			<div class="space-y-1 {$sidebarCollapsed ? 'lg:space-y-2' : ''}">
				{#each navItems as item}
					{@const sectionKey = getSectionKey(item.name)}
					{@const hasChildren = item.children && item.children.length > 0}
					{@const isItemActive = isActive(item.href)}
					
					<div class="group">
						{#if hasChildren}
							<!-- Parent item with children -->
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
										class="h-5 w-5 transition-all {isItemActive ? 'text-pink-600 scale-110' : 'text-gray-400 group-hover:text-pink-500'} {$sidebarCollapsed ? 'lg:h-6 lg:w-6' : ''}"
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
									<svg
										class="h-4 w-4 transition-transform duration-200 {expandedSections[sectionKey] ? 'rotate-180' : ''}"
										fill="none"
										stroke="currentColor"
										viewBox="0 0 24 24"
									>
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
									</svg>
								{/if}
							</button>
							
							<!-- Children items -->
							{#if expandedSections[sectionKey] && !$sidebarCollapsed}
								<div class="ml-8 mt-1 space-y-1 border-l-2 border-gray-200 pl-3">
									{#each item.children as child}
										<a
											href={child.href}
											onclick={closeMobileMenu}
											class="block rounded-md px-3 py-2 text-sm transition-colors {isActive(child.href)
												? 'bg-pink-50 font-medium text-pink-700'
												: 'text-gray-600 hover:bg-pink-50 hover:text-pink-600'}"
										>
											{child.name}
										</a>
									{/each}
								</div>
							{/if}
						{:else}
							<!-- Single item without children -->
							<a
								href={item.href}
								onclick={closeMobileMenu}
								class="relative flex items-center rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200 {isItemActive
									? 'bg-pink-50 text-pink-700 shadow-sm'
									: 'text-gray-700 hover:bg-pink-50 hover:text-pink-600 hover:shadow-sm'} {$sidebarCollapsed ? 'lg:justify-center lg:px-2 lg:py-3' : ''}"
								title={$sidebarCollapsed ? item.name : ''}
							>
								{#if isItemActive && $sidebarCollapsed}
									<div class="absolute left-0 top-1/2 -translate-y-1/2 h-8 w-1 bg-pink-600 rounded-r-full hidden lg:block"></div>
								{/if}
								<svg
									class="h-5 w-5 transition-all {isItemActive ? 'text-pink-600 scale-110' : 'text-gray-400 group-hover:text-pink-500'} {$sidebarCollapsed ? 'lg:h-6 lg:w-6' : ''}"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
								>
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d={item.icon}/>
								</svg>
								{#if !$sidebarCollapsed}
									<span class="ml-3">{item.name}</span>
								{/if}
							</a>
						{/if}
					</div>
				{/each}
			</div>
		</nav>
	</div>
</aside>

<SignOutModal
	open={signOutOpen}
	onconfirm={handleLogout}
	oncancel={() => (signOutOpen = false)}
/>
