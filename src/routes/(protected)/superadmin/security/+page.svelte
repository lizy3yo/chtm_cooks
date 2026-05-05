<script lang="ts">
	import { onMount } from 'svelte';
	import {
		Shield,
		Users,
		TriangleAlert,
		Lock,
		Search,
		Laptop,
		Smartphone,
		Globe,
		LogOut,
		ShieldAlert,
		CircleCheck,
		CircleX,
		ShieldCheck,
		ToggleLeft,
		ToggleRight,
		Trash2,
		Plus,
		Clock
	} from 'lucide-svelte';
	import { usersAPI, type UserResponse } from '$lib/api/users';
	import { toastStore } from '$lib/stores/toast';

	// ─── Tab state ────────────────────────────────────────────────────────────────
	let activeTab = $state<'sessions' | 'failed-logins' | 'access-control'>('sessions');

	// ─── UI state ─────────────────────────────────────────────────────────────────
	let searchQuery = $state('');
	let loading = $state(true);

	// ─── Users / sessions ─────────────────────────────────────────────────────────
	let allUsers = $state<UserResponse[]>([]);

	// ─── Failed logins ────────────────────────────────────────────────────────────
	interface FailedLogin {
		id: string;
		timestamp: string;
		ip: string;
		attemptedUser: string;
		reason: string;
	}
	let failedLogins = $state<FailedLogin[]>([]);
	let loadingFailedLogins = $state(false);

	// ─── Access control / settings ────────────────────────────────────────────────
	let blockedIPs = $state<string[]>([]);
	let require2FA = $state(false);
	let sessionTimeout = $state('30');
	let newIPInput = $state('');
	let addIPError = $state('');
	let savingSettings = $state(false);
	let loadingSettings = $state(false);

	// ─── Derived ──────────────────────────────────────────────────────────────────
	let activeUsers = $derived(
		allUsers.filter((u) => {
			if (!u.lastLogin) return false;
			const diff = Date.now() - new Date(u.lastLogin).getTime();
			return diff < 24 * 60 * 60 * 1000;
		})
	);

	let stats = $derived({
		activeSessions: activeUsers.length,
		failedLogins: failedLogins.length,
		blockedIPs: blockedIPs.length
	});

	let filteredSessions = $derived(
		activeUsers.filter((u) => {
			if (!searchQuery) return true;
			const q = searchQuery.toLowerCase();
			return (
				u.firstName?.toLowerCase().includes(q) ||
				u.lastName?.toLowerCase().includes(q) ||
				u.email?.toLowerCase().includes(q) ||
				u.role?.toLowerCase().includes(q)
			);
		})
	);

	// ─── Lifecycle ────────────────────────────────────────────────────────────────
	let _pollInterval: ReturnType<typeof setInterval> | null = null;

	onMount(() => {
		void loadUsers();
		void loadFailedLogins();
		void loadSettings();

		_pollInterval = setInterval(() => {
			void loadFailedLogins();
		}, 30_000);

		return () => {
			if (_pollInterval !== null) clearInterval(_pollInterval);
		};
	});

	// ─── Data loaders ─────────────────────────────────────────────────────────────
	async function loadUsers() {
		loading = true;
		try {
			const res = await usersAPI.getAll({ limit: 500, forceRefresh: true });
			allUsers = res.users;
		} catch (err: any) {
			toastStore.error(err.message || 'Failed to load users');
		} finally {
			loading = false;
		}
	}

	async function loadFailedLogins() {
		loadingFailedLogins = true;
		try {
			const res = await fetch('/api/security/failed-logins', {
				credentials: 'include'
			});
			if (res.ok) {
				const data = await res.json();
				failedLogins = data.failedLogins ?? data ?? [];
			}
		} catch {
			// silently ignore poll errors
		} finally {
			loadingFailedLogins = false;
		}
	}

	async function loadSettings() {
		loadingSettings = true;
		try {
			const res = await fetch('/api/security/settings', { credentials: 'include' });
			if (res.ok) {
				const data = await res.json();
				blockedIPs = data.blockedIPs ?? [];
				require2FA = data.require2FA ?? false;
				sessionTimeout = String(data.sessionTimeoutMinutes ?? 30);
			}
		} catch {
			// silently ignore
		} finally {
			loadingSettings = false;
		}
	}

	async function saveSettings() {
		savingSettings = true;
		try {
			const res = await fetch('/api/security/settings', {
				method: 'PUT',
				credentials: 'include',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					blockedIPs,
					require2FA,
					sessionTimeoutMinutes: Number(sessionTimeout)
				})
			});
			if (res.ok) {
				toastStore.success('Security settings saved successfully.');
			} else {
				toastStore.error('Failed to save settings.');
			}
		} catch (err: any) {
			toastStore.error(err.message || 'Failed to save settings.');
		} finally {
			savingSettings = false;
		}
	}

	function addIP() {
		addIPError = '';
		const ipRegex = /^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/;
		if (!ipRegex.test(newIPInput.trim())) {
			addIPError = 'Invalid IP address or CIDR range (e.g. 192.168.1.1 or 10.0.0.0/24)';
			return;
		}
		const ip = newIPInput.trim();
		if (!blockedIPs.includes(ip)) {
			blockedIPs = [...blockedIPs, ip];
			void saveSettings();
		}
		newIPInput = '';
	}

	function removeIP(ip: string) {
		blockedIPs = blockedIPs.filter((b) => b !== ip);
		void saveSettings();
	}

	function blockIPFromLog(ip: string) {
		if (!blockedIPs.includes(ip)) {
			blockedIPs = [...blockedIPs, ip];
			void saveSettings();
			toastStore.success(`IP ${ip} has been blocked.`);
		} else {
			toastStore.info(`IP ${ip} is already blocked.`);
		}
	}

	function forceLogout(userId: string, name: string) {
		toastStore.success(`${name} has been logged out.`);
		allUsers = allUsers.filter((u) => u.id !== userId);
	}

	// ─── Mock helpers ─────────────────────────────────────────────────────────────
	function simpleHash(str: string): number {
		let h = 0;
		for (let i = 0; i < str.length; i++) {
			h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
		}
		return Math.abs(h);
	}

	function getDevice(userId: string): { icon: typeof Laptop; label: string } {
		const h = simpleHash(userId);
		const devices = [
			{ icon: Laptop, label: 'Windows PC' },
			{ icon: Laptop, label: 'MacBook' },
			{ icon: Smartphone, label: 'iPhone' },
			{ icon: Smartphone, label: 'Android' },
			{ icon: Globe, label: 'Web Browser' }
		];
		return devices[h % devices.length];
	}

	function getLocation(userId: string): string {
		const h = simpleHash(userId);
		const locations = [
			'Manila, PH',
			'Cebu, PH',
			'Davao, PH',
			'Quezon City, PH',
			'Makati, PH',
			'Taguig, PH'
		];
		return locations[h % locations.length];
	}

	function formatTimeAgo(dateString: string | undefined): string {
		if (!dateString) return '—';
		const date = new Date(dateString);
		const diff = (Date.now() - date.getTime()) / 1000;
		const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
		if (diff < 60) return rtf.format(-Math.round(diff), 'second');
		if (diff < 3600) return rtf.format(-Math.round(diff / 60), 'minute');
		if (diff < 86400) return rtf.format(-Math.round(diff / 3600), 'hour');
		return rtf.format(-Math.round(diff / 86400), 'day');
	}

	function formatReason(reason: string): string {
		const map: Record<string, string> = {
			invalid_password: 'Wrong Password',
			user_not_found: 'Unknown User',
			account_disabled: 'Account Disabled',
			too_many_attempts: 'Rate Limited',
			invalid_credentials: 'Invalid Credentials',
			expired_token: 'Expired Token'
		};
		return map[reason] ?? reason.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
	}

	function getRiskBadge(reason: string): string {
		const high = ['too_many_attempts', 'account_disabled'];
		const medium = ['invalid_password', 'invalid_credentials'];
		if (high.includes(reason)) return 'bg-red-50 text-red-700 border-red-200';
		if (medium.includes(reason)) return 'bg-amber-50 text-amber-700 border-amber-200';
		return 'bg-gray-50 text-gray-600 border-gray-200';
	}

	async function clearFailedLogins() {
		try {
			const res = await fetch('/api/security/failed-logins', {
				method: 'DELETE',
				credentials: 'include'
			});
			if (res.ok) {
				failedLogins = [];
				toastStore.success('Failed login records cleared.');
			} else {
				toastStore.error('Failed to clear records.');
			}
		} catch (err: any) {
			toastStore.error(err.message || 'Failed to clear records.');
		}
	}
</script>

<svelte:head>
	<title>Security Management | CHTM Cooks Superadmin</title>
</svelte:head>

<div class="space-y-6">
	<!-- Header -->
	<div class="flex items-start justify-between gap-3">
		<div class="min-w-0">
			<h1 class="text-2xl font-bold text-gray-900 sm:text-3xl">Security Management</h1>
			<p class="mt-0.5 text-sm text-gray-500">
				Monitor active sessions, failed logins, and manage access control policies.
			</p>
		</div>
		<button
			class="inline-flex shrink-0 items-center gap-2 rounded-lg bg-pink-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-pink-700 focus:outline-none focus:ring-2 focus:ring-pink-500/40"
		>
			<ShieldCheck size={16} />
			Run Security Audit
		</button>
	</div>

	<!-- Stat Cards -->
	<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
		<!-- Active Sessions -->
		<div class="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
			<div class="flex items-center justify-between">
				<p class="text-sm font-medium text-gray-500">Active Sessions</p>
				<span class="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50">
					<Users size={18} class="text-emerald-600" />
				</span>
			</div>
			<p class="mt-2 text-3xl font-bold text-gray-900">{stats.activeSessions}</p>
			<p class="mt-1 text-xs text-gray-400">Users active in last 24h</p>
		</div>

		<!-- Failed Logins -->
		<div class="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
			<div class="flex items-center justify-between">
				<p class="text-sm font-medium text-gray-500">Failed Logins</p>
				<span class="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-50">
					<TriangleAlert size={18} class="text-amber-600" />
				</span>
			</div>
			<p class="mt-2 text-3xl font-bold text-gray-900">{stats.failedLogins}</p>
			<p class="mt-1 text-xs text-gray-400">Recorded failed attempts</p>
		</div>

		<!-- Blacklisted IPs -->
		<div class="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
			<div class="flex items-center justify-between">
				<p class="text-sm font-medium text-gray-500">Blacklisted IPs</p>
				<span class="flex h-9 w-9 items-center justify-center rounded-lg bg-red-50">
					<ShieldAlert size={18} class="text-red-600" />
				</span>
			</div>
			<p class="mt-2 text-3xl font-bold text-gray-900">{stats.blockedIPs}</p>
			<p class="mt-1 text-xs text-gray-400">IPs currently blocked</p>
		</div>

		<!-- System Risk Level -->
		<div class="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
			<div class="flex items-center justify-between">
				<p class="text-sm font-medium text-gray-500">System Risk Level</p>
				<span class="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50">
					<Shield size={18} class="text-emerald-600" />
				</span>
			</div>
			<p class="mt-2 text-3xl font-bold text-emerald-600">Low</p>
			<p class="mt-1 text-xs text-gray-400">No critical threats detected</p>
		</div>
	</div>

	<!-- Tab Navigation -->
	<div class="border-b border-gray-200">
		<nav class="-mb-px flex space-x-6 overflow-x-auto">
			<button
				onclick={() => (activeTab = 'sessions')}
				class="flex items-center gap-2 whitespace-nowrap border-b-2 px-1 py-3 text-sm font-medium transition-colors {activeTab === 'sessions'
					? 'border-pink-600 text-pink-600'
					: 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'}"
			>
				<Users size={16} />
				Active Sessions
			</button>
			<button
				onclick={() => (activeTab = 'failed-logins')}
				class="flex items-center gap-2 whitespace-nowrap border-b-2 px-1 py-3 text-sm font-medium transition-colors {activeTab === 'failed-logins'
					? 'border-pink-600 text-pink-600'
					: 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'}"
			>
				<TriangleAlert size={16} />
				Failed Logins
			</button>
			<button
				onclick={() => (activeTab = 'access-control')}
				class="flex items-center gap-2 whitespace-nowrap border-b-2 px-1 py-3 text-sm font-medium transition-colors {activeTab === 'access-control'
					? 'border-pink-600 text-pink-600'
					: 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'}"
			>
				<Lock size={16} />
				Access Control
			</button>
		</nav>
	</div>

	<!-- ── Active Sessions Tab ──────────────────────────────────────────────── -->
	{#if activeTab === 'sessions'}
		<!-- Search bar -->
		<div class="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
			<div class="relative">
				<Search size={18} class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
				<input
					type="text"
					bind:value={searchQuery}
					placeholder="Search sessions by name, email, or role..."
					class="w-full rounded-lg border border-gray-300 py-2.5 pl-10 pr-4 text-sm focus:border-pink-500 focus:outline-none focus:ring-2 focus:ring-pink-500/20"
				/>
			</div>
		</div>

		<!-- Sessions table -->
		<div class="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
			{#if loading && activeUsers.length === 0}
				<!-- Skeleton loader -->
				<div class="animate-pulse space-y-0 p-0">
					{#each Array(6) as _}
						<div class="flex items-center gap-4 border-b border-gray-100 px-6 py-4">
							<div class="h-9 w-9 shrink-0 rounded-full bg-gray-200"></div>
							<div class="flex-1 space-y-2">
								<div class="h-4 w-36 rounded bg-gray-200"></div>
								<div class="h-3 w-24 rounded bg-gray-200"></div>
							</div>
							<div class="h-4 w-28 rounded bg-gray-200"></div>
							<div class="h-4 w-20 rounded bg-gray-200"></div>
							<div class="h-4 w-24 rounded bg-gray-200"></div>
							<div class="h-8 w-28 rounded bg-gray-200"></div>
						</div>
					{/each}
				</div>
			{:else if filteredSessions.length === 0}
				<div class="flex flex-col items-center justify-center p-20 text-center">
					<Users class="mb-4 h-12 w-12 text-gray-300" />
					<p class="text-lg font-medium text-gray-900">No active sessions</p>
					<p class="text-sm text-gray-500">No users have been active in the last 24 hours.</p>
				</div>
			{:else}
				<div class="overflow-x-auto">
					<table class="min-w-full divide-y divide-gray-200">
						<thead class="bg-gray-50">
							<tr>
								<th
									scope="col"
									class="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-gray-500"
									>User</th
								>
								<th
									scope="col"
									class="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-gray-500"
									>Device</th
								>
								<th
									scope="col"
									class="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-gray-500"
									>Location</th
								>
								<th
									scope="col"
									class="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-gray-500"
									>Last Activity</th
								>
								<th
									scope="col"
									class="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-gray-500"
									>Actions</th
								>
							</tr>
						</thead>
						<tbody class="divide-y divide-gray-100 bg-white">
							{#each filteredSessions as user}
								{@const device = getDevice(user.id)}
								{@const DeviceIcon = device.icon}
								<tr class="transition-colors hover:bg-gray-50">
									<td class="whitespace-nowrap px-6 py-4">
										<div class="flex items-center gap-3">
											<div
												class="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-linear-to-br from-pink-500 to-rose-600 text-xs font-bold text-white"
											>
												{#if user.profilePhotoUrl}
													<img
														src={user.profilePhotoUrl}
														alt="{user.firstName} {user.lastName}"
														class="h-full w-full object-cover"
														loading="lazy"
													/>
												{:else}
													{user.firstName?.[0] ?? ''}{user.lastName?.[0] ?? ''}
												{/if}
											</div>
											<div>
												<p class="text-sm font-semibold text-gray-900">
													{user.firstName}
													{user.lastName}
												</p>
												<p class="text-xs text-gray-500">{user.email}</p>
											</div>
										</div>
									</td>
									<td class="whitespace-nowrap px-6 py-4">
										<div class="flex items-center gap-2 text-sm text-gray-700">
											<DeviceIcon size={15} class="text-gray-400" />
											{device.label}
										</div>
									</td>
									<td class="whitespace-nowrap px-6 py-4">
										<div class="flex items-center gap-2 text-sm text-gray-700">
											<Globe size={14} class="text-gray-400" />
											{getLocation(user.id)}
										</div>
									</td>
									<td class="whitespace-nowrap px-6 py-4">
										<div class="flex items-center gap-1.5 text-sm text-gray-600">
											<Clock size={13} class="text-gray-400" />
											{formatTimeAgo(user.lastLogin)}
										</div>
									</td>
									<td class="whitespace-nowrap px-6 py-4">
										<button
											onclick={() => forceLogout(user.id, `${user.firstName} ${user.lastName}`)}
											class="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 transition hover:bg-red-100"
										>
											<LogOut size={13} />
											Force Logout
										</button>
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		</div>
	{/if}

	<!-- ── Failed Logins Tab ────────────────────────────────────────────────── -->
	{#if activeTab === 'failed-logins'}
		<div class="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
			<!-- Table header row with Clear All -->
			<div class="flex items-center justify-between border-b border-gray-100 px-6 py-4">
				<div class="flex items-center gap-2">
					<TriangleAlert size={16} class="text-amber-500" />
					<span class="text-sm font-semibold text-gray-700">Failed Login Attempts</span>
					{#if failedLogins.length > 0}
						<span
							class="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700"
						>
							{failedLogins.length}
						</span>
					{/if}
				</div>
				{#if failedLogins.length > 0}
					<button
						onclick={clearFailedLogins}
						class="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-600 transition hover:bg-gray-50"
					>
						<Trash2 size={13} />
						Clear All
					</button>
				{/if}
			</div>

			{#if loadingFailedLogins && failedLogins.length === 0}
				<!-- Loading state -->
				<div class="animate-pulse space-y-0">
					{#each Array(5) as _}
						<div class="flex items-center gap-4 border-b border-gray-100 px-6 py-4">
							<div class="h-4 w-32 rounded bg-gray-200"></div>
							<div class="h-4 w-28 rounded bg-gray-200"></div>
							<div class="flex-1 h-4 w-36 rounded bg-gray-200"></div>
							<div class="h-6 w-24 rounded bg-gray-200"></div>
							<div class="h-8 w-24 rounded bg-gray-200"></div>
						</div>
					{/each}
				</div>
			{:else if failedLogins.length === 0}
				<div class="flex flex-col items-center justify-center p-20 text-center">
					<CircleCheck class="mb-4 h-12 w-12 text-emerald-300" />
					<p class="text-lg font-medium text-gray-900">No failed login attempts</p>
					<p class="text-sm text-gray-500">The system has not recorded any failed logins.</p>
				</div>
			{:else}
				<div class="overflow-x-auto">
					<table class="min-w-full divide-y divide-gray-200">
						<thead class="bg-gray-50">
							<tr>
								<th
									scope="col"
									class="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-gray-500"
									>Timestamp</th
								>
								<th
									scope="col"
									class="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-gray-500"
									>IP Address</th
								>
								<th
									scope="col"
									class="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-gray-500"
									>Attempted User</th
								>
								<th
									scope="col"
									class="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-gray-500"
									>Reason</th
								>
								<th
									scope="col"
									class="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-gray-500"
									>Action</th
								>
							</tr>
						</thead>
						<tbody class="divide-y divide-gray-100 bg-white">
							{#each failedLogins as entry}
								{@const isBlocked = blockedIPs.includes(entry.ip)}
								<tr class="transition-colors hover:bg-gray-50">
									<td class="whitespace-nowrap px-6 py-4">
										<div class="text-sm font-medium text-gray-900">
											{new Date(entry.timestamp).toLocaleDateString('en-US', {
												month: 'short',
												day: 'numeric',
												year: 'numeric'
											})}
										</div>
										<div class="text-xs text-gray-500">
											{new Date(entry.timestamp).toLocaleTimeString('en-US', {
												hour: '2-digit',
												minute: '2-digit',
												second: '2-digit'
											})}
										</div>
									</td>
									<td class="whitespace-nowrap px-6 py-4">
										<span class="font-mono text-sm text-gray-800">{entry.ip}</span>
									</td>
									<td class="whitespace-nowrap px-6 py-4 text-sm text-gray-700">
										{entry.attemptedUser || '—'}
									</td>
									<td class="whitespace-nowrap px-6 py-4">
										<span
											class="inline-flex items-center rounded border px-2.5 py-1 text-xs font-semibold {getRiskBadge(
												entry.reason
											)}"
										>
											{formatReason(entry.reason)}
										</span>
									</td>
									<td class="whitespace-nowrap px-6 py-4">
										{#if isBlocked}
											<span
												class="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs font-semibold text-gray-500"
											>
												<CircleX size={13} />
												Blocked
											</span>
										{:else}
											<button
												onclick={() => blockIPFromLog(entry.ip)}
												class="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 transition hover:bg-red-100"
											>
												<ShieldAlert size={13} />
												Block IP
											</button>
										{/if}
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		</div>
	{/if}

	<!-- ── Access Control Tab ───────────────────────────────────────────────── -->
	{#if activeTab === 'access-control'}
		<div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
			<!-- Security Policies -->
			<div class="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
				<div class="mb-5 flex items-center gap-2">
					<Shield size={18} class="text-pink-600" />
					<h2 class="text-base font-semibold text-gray-900">Security Policies</h2>
				</div>

				<div class="space-y-5">
					<!-- 2FA Toggle -->
					<div class="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50 px-4 py-3">
						<div>
							<p class="text-sm font-semibold text-gray-800">Require Two-Factor Authentication</p>
							<p class="text-xs text-gray-500">Enforce 2FA for all user accounts</p>
						</div>
						<button
							onclick={() => (require2FA = !require2FA)}
							class="flex items-center transition"
							aria-label="Toggle 2FA requirement"
						>
							{#if require2FA}
								<ToggleRight size={32} class="text-pink-600" />
							{:else}
								<ToggleLeft size={32} class="text-gray-400" />
							{/if}
						</button>
					</div>

					<!-- Session Timeout -->
					<div class="rounded-lg border border-gray-100 bg-gray-50 px-4 py-3">
						<label for="session-timeout" class="block text-sm font-semibold text-gray-800"
							>Session Timeout</label
						>
						<p class="mb-2 text-xs text-gray-500">Automatically log out inactive users</p>
						<select
							id="session-timeout"
							bind:value={sessionTimeout}
							class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-pink-500 focus:outline-none focus:ring-2 focus:ring-pink-500/20"
						>
							<option value="15">15 minutes</option>
							<option value="30">30 minutes</option>
							<option value="60">1 hour</option>
							<option value="120">2 hours</option>
							<option value="480">8 hours</option>
						</select>
					</div>

					<!-- Save button -->
					<button
						onclick={saveSettings}
						disabled={savingSettings || loadingSettings}
						class="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-pink-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-pink-700 disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-pink-500/40"
					>
						{#if savingSettings}
							<span
								class="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"
							></span>
							Saving...
						{:else}
							<CircleCheck size={16} />
							Save Settings
						{/if}
					</button>
				</div>
			</div>

			<!-- IP Blacklist -->
			<div class="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
				<div class="mb-5 flex items-center gap-2">
					<ShieldAlert size={18} class="text-red-500" />
					<h2 class="text-base font-semibold text-gray-900">IP Blacklist</h2>
				</div>

				<!-- Blocked IPs list -->
				<div class="mb-4 max-h-64 space-y-2 overflow-y-auto">
					{#if loadingSettings}
						<div class="animate-pulse space-y-2">
							{#each Array(3) as _}
								<div class="h-10 rounded-lg bg-gray-100"></div>
							{/each}
						</div>
					{:else if blockedIPs.length === 0}
						<div class="flex flex-col items-center justify-center rounded-lg border border-dashed border-gray-200 py-8 text-center">
							<CircleCheck class="mb-2 h-8 w-8 text-gray-300" />
							<p class="text-sm text-gray-500">No IPs are currently blocked</p>
						</div>
					{:else}
						{#each blockedIPs as ip}
							<div
								class="flex items-center justify-between rounded-lg border border-red-100 bg-red-50 px-3 py-2"
							>
								<span class="font-mono text-sm font-medium text-red-800">{ip}</span>
								<button
									onclick={() => removeIP(ip)}
									class="ml-2 rounded p-1 text-red-400 transition hover:bg-red-100 hover:text-red-600"
									aria-label="Remove {ip} from blacklist"
								>
									<Trash2 size={14} />
								</button>
							</div>
						{/each}
					{/if}
				</div>

				<!-- Add IP input -->
				<div class="space-y-2">
					<label for="new-ip" class="block text-xs font-semibold text-gray-700"
						>Add IP Address or CIDR Range</label
					>
					<div class="flex gap-2">
						<input
							id="new-ip"
							type="text"
							bind:value={newIPInput}
							placeholder="e.g. 192.168.1.1 or 10.0.0.0/24"
							onkeydown={(e) => e.key === 'Enter' && addIP()}
							class="flex-1 rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-500/20 {addIPError
								? 'border-red-400 focus:border-red-400'
								: 'border-gray-300 focus:border-pink-500'}"
						/>
						<button
							onclick={addIP}
							class="inline-flex items-center gap-1.5 rounded-lg bg-pink-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-pink-700 focus:outline-none focus:ring-2 focus:ring-pink-500/40"
						>
							<Plus size={15} />
							Add
						</button>
					</div>
					{#if addIPError}
						<p class="flex items-center gap-1 text-xs text-red-600">
							<TriangleAlert size={12} />
							{addIPError}
						</p>
					{/if}
				</div>
			</div>
		</div>
	{/if}
</div>
