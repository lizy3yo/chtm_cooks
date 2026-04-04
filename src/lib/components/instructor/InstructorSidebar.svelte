<script lang="ts">
	import { page } from '$app/stores';
	import { sidebarCollapsed } from '$lib/stores/instructor';
	import logo from '$lib/assets/CHTM_LOGO.png';

	interface NavItem {
		name: string;
		href: string;
		icon: string;
		badge?: number;
	}

	let isMobileMenuOpen = $state(false);

	function toggleCollapse() {
		sidebarCollapsed.update(val => !val);
	}

	const navItems: NavItem[] = [
		{
			name: 'Dashboard',
			href: '/instructor/dashboard',
			icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6'
		},
		{
			name: 'Equipment Catalog',
			href: '/instructor/catalog',
			icon: 'M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10'
		},
		{
			name: 'Student Requests',
			href: '/instructor/requests',
			icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2',
			badge: 0 // Will be dynamic - pending approvals
		},
		{
			name: 'Reports & Analytics',
			href: '/instructor/reports',
			icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z'
		},
		{
			name: 'Operations',
			href: '/instructor/operations',
			icon: 'M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z'
		},
		{
			name: 'Notifications',
			href: '/instructor/notifications',
			icon: 'M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9',
			badge: 0 // Will be dynamic - unread notifications
		}
	];
	
	function isActive(href: string): boolean {
		return $page.url.pathname === href || $page.url.pathname.startsWith(href + '/');
	}

	function closeMobileMenu() {
		isMobileMenuOpen = false;
	}
</script>

<!-- Overlay for mobile -->
{#if isMobileMenuOpen}
	<div
		class="fixed inset-0 z-40 bg-transparent lg:hidden"
		onclick={closeMobileMenu}
		role="button"
		tabindex="0"
	></div>
{/if}

<!-- Sidebar -->
<aside
	class="fixed inset-y-0 left-0 z-50 transform border-r border-gray-200 shadow-lg transition-all duration-300 ease-in-out {isMobileMenuOpen
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
						<h1 class="text-lg font-bold text-gray-900">Instructor</h1>
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
				class="hidden lg:flex items-center justify-center h-8 w-8 rounded-full bg-white border-2 border-gray-200 hover:border-pink-500 hover:bg-pink-50 hover:text-pink-600 text-gray-600 shadow-md hover:shadow-lg transition-all duration-200 absolute top-4 -right-4 z-50"
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
					{@const isItemActive = isActive(item.href)}
					
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
						{#if item.badge !== undefined && item.badge > 0}
							<span class="flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 text-xs font-semibold text-white bg-red-500 rounded-full {$sidebarCollapsed ? 'lg:absolute lg:top-1 lg:right-1' : ''}">
								{item.badge > 99 ? '99+' : item.badge}
							</span>
						{/if}
					</a>
				{/each}
			</div>
		</nav>
	</div>
</aside>
