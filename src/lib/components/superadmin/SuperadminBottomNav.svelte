<script lang="ts">
	import { page } from '$app/stores';
	import { Shield, Users, Settings, BarChart3 } from 'lucide-svelte';

	const isSuperadminRoute = $derived($page.url.pathname.startsWith('/superadmin'));

	const items = [
		{
			name: 'Dashboard',
			href: '/superadmin/dashboard',
			icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6'
		},
		{
			name: 'Users',
			href: '/superadmin/users',
			icon: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z'
		},
		{
			name: 'Analytics',
			href: '/superadmin/analytics',
			icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z'
		},
		{
			name: 'Settings',
			href: '/superadmin/settings',
			icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z'
		}
	] as const;

	function isActive(href: string): boolean {
		return $page.url.pathname === href || $page.url.pathname.startsWith(href + '/');
	}
</script>

{#if isSuperadminRoute}
<nav
	class="fixed inset-x-0 bottom-0 z-40 flex h-16 items-end border-t border-gray-200 bg-white pb-safe lg:hidden"
	aria-label="Bottom navigation"
>
	{#each items as item, index}
		{@const active = isActive(item.href)}

		{#if index === 2}
			<!-- Raised centre action button for System Health -->
			<a
				href="/superadmin/health"
				class="group relative -top-4 mx-auto flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-white shadow-lg ring-4 ring-purple-600 transition-all duration-300 active:scale-95"
				aria-label="System Health"
			>
				<span class="absolute -inset-2 rounded-full bg-purple-400 opacity-0 blur-lg transition-opacity duration-300 group-hover:opacity-40 group-active:opacity-40"></span>
				<Shield class="relative h-7 w-7 text-purple-600" strokeWidth={2.5} />
			</a>
		{/if}

		<a
			href={item.href}
			class="flex flex-1 flex-col items-center justify-center gap-1 pb-2 pt-2 text-xs font-medium transition-colors duration-200
				{active ? 'text-purple-600' : 'text-gray-400 hover:text-gray-600'}"
			aria-current={active ? 'page' : undefined}
		>
			<svg
				class="h-5 w-5 transition-transform duration-200 {active ? 'scale-110' : ''}"
				fill="none"
				stroke="currentColor"
				viewBox="0 0 24 24"
				aria-hidden="true"
			>
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="{active ? 2.5 : 2}" d={item.icon} />
			</svg>
			<span>{item.name}</span>

			{#if active}
				<span class="absolute bottom-1 h-1 w-1 rounded-full bg-purple-600"></span>
			{/if}
		</a>
	{/each}
</nav>

<!-- Spacer so page content isn't hidden behind the bottom nav -->
<div class="h-16 lg:hidden"></div>
{/if}
