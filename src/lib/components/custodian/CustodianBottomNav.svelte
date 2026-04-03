<script lang="ts">
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { toastStore } from '$lib/stores/toast';
	import { borrowRequestsAPI } from '$lib/api/borrowRequests';
	import QrScanner from '$lib/components/custodian/QrScanner.svelte';
	import { X, CheckCircle2, QrCode } from 'lucide-svelte';

	const isCustodianRoute = $derived($page.url.pathname.startsWith('/custodian'));

	const items = [
		{
			name: 'Home',
			href: '/custodian/dashboard',
			icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6'
		},
		{
			name: 'Inventory',
			href: '/custodian/inventory',
			icon: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4'
		},
		{
			name: 'Requests',
			href: '/custodian/requests',
			icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2'
		},
		{
			name: 'Resources',
			href: '/custodian/replacement',
			icon: 'M21 2v6h-6M3 12a9 9 0 0115-6.7L21 8M3 22v-6h6M21 12a9 9 0 01-15 6.7L3 16'
		}
	] as const;

	// QR code icon for center button
	const qrIcon = 'M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z';

	let scannerOpen = $state(false);
	let scannerResult = $state<{ id: string; code: string; studentName: string; status: string } | null>(null);
	let lookingUp = $state(false);

	function openScanner() {
		scannerOpen = true;
		scannerResult = null;
	}

	async function handleScanResult(rawId: string) {
		lookingUp = true;
		try {
			const res = await borrowRequestsAPI.getById(rawId);
			const studentName = res.student?.fullName ?? `Student ${res.studentId.slice(-6).toUpperCase()}`;
			scannerResult = { id: rawId, code: `REQ-${rawId.slice(-6).toUpperCase()}`, studentName, status: res.status };
		} catch {
			toastStore.error('QR code not recognised as a valid request.', 'Scan Error');
		} finally {
			lookingUp = false;
		}
	}

	function closeScanner() {
		scannerOpen = false;
		scannerResult = null;
		lookingUp = false;
	}

	function goToRequest() {
		if (!scannerResult) return;
		const id = scannerResult.id;
		closeScanner();
		goto(`/custodian/requests?requestId=${id}`);
	}

	function statusLabel(s: string): string {
		const map: Record<string, string> = {
			approved_instructor: 'Pending Release',
			ready_for_pickup: 'Ready for Pickup',
			borrowed: 'Active Loan',
			pending_return: 'Pending Return',
			missing: 'Missing',
			returned: 'Returned'
		};
		return map[s] ?? s.replace(/_/g, ' ');
	}

	function statusColor(s: string): string {
		const map: Record<string, string> = {
			approved_instructor: 'bg-amber-100 text-amber-800',
			ready_for_pickup: 'bg-indigo-100 text-indigo-800',
			borrowed: 'bg-violet-100 text-violet-800',
			pending_return: 'bg-orange-100 text-orange-800',
			missing: 'bg-red-100 text-red-800',
			returned: 'bg-emerald-100 text-emerald-800'
		};
		return map[s] ?? 'bg-gray-100 text-gray-700';
	}

	function isActive(href: string): boolean {
		return $page.url.pathname === href || $page.url.pathname.startsWith(href + '/');
	}
</script>

<!--
  Bottom navigation bar — visible only on mobile/tablet (hidden lg+).
  Matches the system's white bg, border-gray-200, pink accent design.
  The centre button is a raised circular FAB-style button.
-->
{#if isCustodianRoute}
<nav
	class="fixed inset-x-0 bottom-0 z-40 flex h-16 items-end border-t border-gray-200 bg-white pb-safe lg:hidden"
	aria-label="Bottom navigation"
>
	{#each items as item, index}
		{@const active = isActive(item.href)}

		{#if index === 2}
			<!-- Raised centre action button for QR scanner with white background and pink border -->
			<button
				type="button"
				onclick={openScanner}
				class="group relative -top-4 mx-auto flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-white shadow-lg ring-4 ring-pink-600 transition-all duration-300 active:scale-95"
				aria-label="Scan QR Code"
			>
				<!-- Glowing ring on hover/tap -->
				<span class="absolute -inset-2 rounded-full bg-pink-400 opacity-0 blur-lg transition-opacity duration-300 group-hover:opacity-40 group-active:opacity-40"></span>
				
				<!-- Lucide QR Code Icon -->
				<QrCode class="relative h-7 w-7 text-pink-600" strokeWidth={2.5} />
			</button>
		{/if}

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
	{/each}
</nav>

<!-- Spacer so page content isn't hidden behind the bottom nav -->
<div class="h-16 lg:hidden"></div>
{/if}

<!-- QR Scanner Modal -->
{#if scannerOpen}
	<div class="fixed inset-0 z-50 flex items-end justify-center sm:items-center lg:hidden" role="dialog" aria-modal="true" aria-label="QR Scanner">
		<!-- Backdrop with fade-in -->
		<button 
			type="button" 
			class="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300" 
			onclick={closeScanner} 
			aria-label="Close scanner" 
			tabindex="-1"
		></button>

		<!-- Modal with slide-up animation -->
		<div class="relative w-full max-w-sm rounded-t-3xl bg-white shadow-2xl transition-transform duration-500 ease-out animate-slide-up sm:rounded-2xl">
			<!-- Handle bar (mobile) -->
			<div class="flex justify-center pt-3 sm:hidden">
				<div class="h-1 w-10 rounded-full bg-gray-300"></div>
			</div>

			<!-- Header -->
			<div class="flex items-center justify-between px-5 pb-2 pt-4">
				<div>
					<h2 class="text-base font-bold text-gray-900">Scan QR Code</h2>
					<p class="text-xs text-gray-400">Point camera at student's request QR</p>
				</div>
				<button onclick={closeScanner} class="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200 transition-colors">
					<X size={16} />
				</button>
			</div>

			<div class="px-5 pb-6">
				{#if lookingUp}
					<!-- Looking up request -->
					<div class="flex flex-col items-center gap-3 py-10">
						<div class="h-10 w-10 animate-spin rounded-full border-4 border-gray-200 border-t-pink-600"></div>
						<p class="text-sm text-gray-500">Looking up request…</p>
					</div>
				{:else if scannerResult}
					<!-- Success -->
					<div class="flex flex-col items-center gap-4 py-4">
						<div class="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
							<CheckCircle2 size={32} class="text-emerald-600" />
						</div>
						<div class="text-center">
							<p class="text-xs font-semibold uppercase tracking-widest text-gray-400">Request Found</p>
							<p class="mt-1 font-mono text-xl font-bold text-gray-900">{scannerResult.code}</p>
							<p class="mt-0.5 text-sm text-gray-600">{scannerResult.studentName}</p>
							<span class="mt-2 inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold {statusColor(scannerResult.status)}">
								{statusLabel(scannerResult.status)}
							</span>
						</div>
						<div class="flex w-full gap-3">
							<button onclick={() => { scannerResult = null; }} class="flex-1 rounded-xl border border-gray-200 bg-white py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors">
								Scan Again
							</button>
							<button onclick={goToRequest} class="flex-1 rounded-xl bg-pink-600 py-3 text-sm font-semibold text-white hover:bg-pink-700 transition-colors">
								Open Request
							</button>
						</div>
					</div>
				{:else}
					<!-- Scanner component -->
					<QrScanner onResult={handleScanResult} onClose={closeScanner} />
				{/if}
			</div>
		</div>
	</div>
{/if}

<style>
	@keyframes slide-up {
		from {
			transform: translateY(100%);
			opacity: 0;
		}
		to {
			transform: translateY(0);
			opacity: 1;
		}
	}

	.animate-slide-up {
		animation: slide-up 0.5s ease-out;
	}
</style>
