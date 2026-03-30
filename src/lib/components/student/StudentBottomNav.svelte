<script lang="ts">
	import { page } from '$app/stores';

	const isStudentRoute = $derived($page.url.pathname.startsWith('/student'));

	const items = [
		{
			name: 'Home',
			href: '/student/dashboard',
			icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6'
		},
		{
			name: 'Catalog',
			href: '/student/catalog',
			icon: 'M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10'
		},
		// centre — raised action button
		{
			name: 'Request',
			href: '/student/request',
			icon: 'M12 4v16m8-8H4',
			center: true
		},
		{
			name: 'Requests',
			href: '/student/requests',
			icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2'
		},
		{
			name: 'Borrowed',
			href: '/student/borrowed',
			icon: 'M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4'
		}
	] as const;

	function isActive(href: string): boolean {
		return $page.url.pathname === href || $page.url.pathname.startsWith(href + '/');
	}
</script>

<!--
  Bottom navigation bar — visible only on mobile/tablet (hidden lg+).
  Matches the system's white bg, border-gray-200, pink accent design.
  The centre "Request" item is a raised circular FAB-style button.
-->
{#if isStudentRoute}
<nav
	class="fixed inset-x-0 bottom-0 z-40 flex h-16 items-end border-t border-gray-200 bg-white pb-safe lg:hidden"
	aria-label="Bottom navigation"
>
	{#each items as item}
		{@const active = isActive(item.href)}

		{#if item.center}
			<!-- Raised centre action button -->
			<a
				href={item.href}
				class="relative -top-4 mx-auto flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-pink-600 shadow-lg ring-4 ring-white transition-transform duration-200 active:scale-95 hover:bg-pink-700"
				aria-label={item.name}
				aria-current={active ? 'page' : undefined}
			>
				<svg class="h-6 w-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d={item.icon} />
				</svg>
			</a>
		{:else}
			<a
				href={item.href}
				class="flex flex-1 flex-col items-center justify-center gap-1 pb-2 pt-2 text-xs font-medium transition-colors duration-200
					{active ? 'text-pink-600' : 'text-gray-400 hover:text-gray-600'}"
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

				<!-- Active indicator dot -->
				{#if active}
					<span class="absolute bottom-1 h-1 w-1 rounded-full bg-pink-600"></span>
				{/if}
			</a>
		{/if}
	{/each}
</nav>

<!-- Spacer so page content isn't hidden behind the bottom nav -->
<div class="h-16 lg:hidden"></div>
{/if}
