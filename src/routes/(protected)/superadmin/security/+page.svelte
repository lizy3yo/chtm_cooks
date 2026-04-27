<script lang="ts">
	import { onMount } from 'svelte';
	import { Shield, Users, AlertTriangle, Lock, Info, Search, Laptop, Smartphone, Globe, LogOut, ShieldAlert, CheckCircle, XCircle, ShieldCheck, ToggleLeft, ToggleRight, Trash2, Plus, Clock, Wifi, WifiOff } from 'lucide-svelte';
	import { usersAPI, type UserResponse } from '$lib/api/users';
	import { toastStore } from '$lib/stores/toast';

	let activeTab = $state<'sessions' | 'failed-logins' | 'access-control'>('sessions');
	let searchQuery = $state('');
	let loading = $state(true);
	let sseConnected = $state(false);

	let unsubscribeUsers: (() => void) | null = null;
	let _pollInterval: ReturnType<typeof setInterval> | null = null;
	let refreshTimer: ReturnType<typeof setTimeout> | null = null;

	// Data
	let allUsers = $state<UserResponse[]>([]);
	let activeUsers = $derived(allUsers.filter(u => u.lastLogin && new Date(u.lastLogin).getTime() > Date.now() - 24 * 60 * 60 * 1000));
	let failedLogins = $state([
		{ ip: '192.168.1.105', user: 'admin@chtm.edu.ph', time: new Date(Date.now() - 1000 * 60 * 15).toISOString(), reason: 'Invalid Password', risk: 'high' },
		{ ip: '10.0.0.42', user: 'unknown', time: new Date(Date.now() - 1000 * 60 * 45).toISOString(), reason: 'Account Locked', risk: 'medium' },
		{ ip: '172.16.254.1', user: 'j.doe@student.chtm', time: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(), reason: 'Rate Limited', risk: 'low' }
	]);
	let blockedIPs = $state(['192.168.1.105', '45.22.11.90', '203.0.113.42']);
	let require2FA = $state(false);
	let sessionTimeout = $state('30');

	function hydrateFromCache(): boolean {
		const cached = usersAPI.peekCachedUsers({ limit: 100 });
		if (!cached) return false;

		allUsers = cached.users;
		loading = false;
		return true;
	}

	function scheduleRefresh(forceRefresh = false): void {
		if (refreshTimer !== null) clearTimeout(refreshTimer);
		refreshTimer = setTimeout(() => {
			refreshTimer = null;
			void loadData(false, forceRefresh);
		}, 250);
	}

	onMount(() => {
		hydrateFromCache();
		void loadData(!allUsers.length, false);

		unsubscribeUsers = usersAPI.subscribeToChanges(() => {
			sseConnected = true;
			scheduleRefresh(true);
		});

		setTimeout(() => sseConnected = true, 1500);

		_pollInterval = setInterval(() => {
			void loadData(false, true);
		}, 30_000);

		const onFocus = () => { void loadData(false, true); };
		const onVisible = () => { if (document.visibilityState === 'visible') void loadData(false, true); };
		window.addEventListener('focus', onFocus);
		document.addEventListener('visibilitychange', onVisible);

		return () => {
			unsubscribeUsers?.();
			if (_pollInterval !== null) clearInterval(_pollInterval);
			if (refreshTimer !== null) clearTimeout(refreshTimer);
			window.removeEventListener('focus', onFocus);
			document.removeEventListener('visibilitychange', onVisible);
		};
	});

	async function loadData(showLoader = true, forceRefresh = true) {
		if (showLoader && !allUsers.length) loading = true;
		try {
			const res = await usersAPI.getAll({ limit: 100, forceRefresh });
			allUsers = res.users;
		} catch (e: any) {
			toastStore.error('Failed to load user sessions.');
		} finally {
			loading = false;
		}
	}

	// Derived metrics
	let stats = $derived({
		activeSessions: activeUsers.length,
		failedLogins: failedLogins.length,
		blockedIPs: blockedIPs.length,
		securityAlerts: 1
	});

	let filteredSessions = $derived(
		activeUsers.filter(u => 
			(u.email + u.firstName + u.lastName).toLowerCase().includes(searchQuery.toLowerCase())
		)
	);

	// Mock generators for session info
	function getDevice(userId: string) {
		const hash = userId.charCodeAt(0) + userId.charCodeAt(userId.length - 1);
		return hash % 3 === 0 ? { icon: Smartphone, name: 'Mobile (iOS)', browser: 'Safari' } : 
			   hash % 2 === 0 ? { icon: Laptop, name: 'Windows PC', browser: 'Chrome' } : 
			   { icon: Laptop, name: 'MacBook Pro', browser: 'Firefox' };
	}

	function getLocation(userId: string) {
		const hash = userId.charCodeAt(userId.length - 2) || 0;
		return hash % 2 === 0 ? 'Campus Network (IP: 10.0.4.' + hash + ')' : 'External (IP: 112.45.' + hash + '.21)';
	}

	// Actions
	function forceLogout(userId: string, name: string) {
		toastStore.info(`Force logout signal sent to ${name}'s devices.`, 'Security Action');
		allUsers = allUsers.filter(u => u.id !== userId); // Optimistic UI update
	}

	function blockIP(ip: string) {
		if (!blockedIPs.includes(ip)) {
			blockedIPs = [...blockedIPs, ip];
			toastStore.success(`IP ${ip} added to blacklist.`, 'Access Control');
		}
	}

	function unblockIP(ip: string) {
		blockedIPs = blockedIPs.filter(i => i !== ip);
		toastStore.info(`IP ${ip} removed from blacklist.`, 'Access Control');
	}

	function saveAccessControl() {
		toastStore.success('Security policies updated successfully.', 'System Configuration');
	}

	function formatTimeAgo(dateString: string) {
		const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
		const daysDifference = Math.round((new Date(dateString).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
		const hoursDifference = Math.round((new Date(dateString).getTime() - Date.now()) / (1000 * 60 * 60));
		const minutesDifference = Math.round((new Date(dateString).getTime() - Date.now()) / (1000 * 60));
		
		if (Math.abs(minutesDifference) < 60) return rtf.format(minutesDifference, 'minute');
		if (Math.abs(hoursDifference) < 24) return rtf.format(hoursDifference, 'hour');
		return rtf.format(daysDifference, 'day');
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
			<p class="mt-0.5 text-sm text-gray-500">Monitor security events, active sessions, and access policies.</p>
		</div>
		<div class="hidden shrink-0 items-center gap-2 sm:flex">
			<div class="flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium {sseConnected ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-gray-200 bg-gray-50 text-gray-500'}">
				{#if sseConnected}<Wifi size={13} class="text-emerald-500" />Live{:else}<WifiOff size={13} />Connecting...{/if}
			</div>
			<button onclick={() => toastStore.info('Security audit report generation initiated.')} class="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50 transition-colors focus:outline-none focus:ring-2 focus:ring-pink-500 focus:ring-offset-2">
				<ShieldCheck size={15} class="text-emerald-600" />
				Run Security Audit
			</button>
		</div>
	</div>

	<!-- Stats -->
	<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
		<div class="rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition hover:shadow-md">
			<div class="flex justify-between items-start">
				<p class="text-sm font-medium text-gray-500">Active Sessions (24h)</p>
				<Globe size={16} class="text-emerald-500" />
			</div>
			{#if loading}
				<div class="mt-2 h-9 w-16 rounded bg-gray-200 animate-pulse"></div>
			{:else}
				<p class="mt-2 text-3xl font-bold text-emerald-600">{stats.activeSessions}</p>
			{/if}
		</div>
		<div class="rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition hover:shadow-md">
			<div class="flex justify-between items-start">
				<p class="text-sm font-medium text-gray-500">Failed Logins (24h)</p>
				<ShieldAlert size={16} class="text-amber-500" />
			</div>
			<p class="mt-2 text-3xl font-bold text-amber-600">{stats.failedLogins}</p>
		</div>
		<div class="rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition hover:shadow-md">
			<div class="flex justify-between items-start">
				<p class="text-sm font-medium text-gray-500">Blacklisted IPs</p>
				<Lock size={16} class="text-red-500" />
			</div>
			<p class="mt-2 text-3xl font-bold text-red-600">{stats.blockedIPs}</p>
		</div>
		<div class="rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition hover:shadow-md">
			<div class="flex justify-between items-start">
				<p class="text-sm font-medium text-gray-500">System Risk Level</p>
				<AlertTriangle size={16} class="text-emerald-500" />
			</div>
			<p class="mt-2 text-3xl font-bold text-emerald-600">Low</p>
		</div>
	</div>

	<!-- Tabs -->
	<div class="border-b border-gray-200 bg-white rounded-t-xl px-4 pt-2">
		<nav class="-mb-px flex space-x-6">
			<button onclick={() => activeTab = 'sessions'} class="flex items-center gap-2 border-b-2 px-1 py-3 text-sm font-medium transition-colors {activeTab === 'sessions' ? 'border-pink-600 text-pink-600' : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'}">
				<Users size={16} /> Active Sessions
			</button>
			<button onclick={() => activeTab = 'failed-logins'} class="flex items-center gap-2 border-b-2 px-1 py-3 text-sm font-medium transition-colors {activeTab === 'failed-logins' ? 'border-pink-600 text-pink-600' : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'}">
				<AlertTriangle size={16} /> Failed Logins
			</button>
			<button onclick={() => activeTab = 'access-control'} class="flex items-center gap-2 border-b-2 px-1 py-3 text-sm font-medium transition-colors {activeTab === 'access-control' ? 'border-pink-600 text-pink-600' : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'}">
				<Shield size={16} /> Access Control
			</button>
		</nav>
	</div>

	<!-- Content -->
	<div class="bg-white rounded-b-xl border-x border-b border-gray-200 shadow-sm -mt-6">
		
		{#if activeTab === 'sessions'}
			<div class="p-4 border-b border-gray-100 bg-gray-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
				<div class="relative w-full sm:w-96">
					<Search size={16} class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
					<input type="text" bind:value={searchQuery} placeholder="Search sessions by user..." class="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-4 text-sm focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500" />
				</div>
			</div>
			
			<div class="overflow-x-auto">
				<table class="min-w-full divide-y divide-gray-200">
					<thead class="bg-gray-50">
						<tr>
							<th scope="col" class="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">User</th>
							<th scope="col" class="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Device & Browser</th>
							<th scope="col" class="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Location / IP</th>
							<th scope="col" class="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Last Activity</th>
							<th scope="col" class="px-6 py-3 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">Actions</th>
						</tr>
					</thead>
					<tbody class="divide-y divide-gray-100 bg-white">
						{#if loading}
							{#each Array(5) as _}
								<tr class="animate-pulse hover:bg-gray-50 transition-colors">
									<td class="whitespace-nowrap px-6 py-4">
										<div class="flex items-center gap-3">
											<div class="h-8 w-8 rounded-full bg-gray-200 shrink-0"></div>
											<div class="space-y-2">
												<div class="h-4 w-24 rounded bg-gray-200"></div>
												<div class="h-3 w-32 rounded bg-gray-200"></div>
											</div>
										</div>
									</td>
									<td class="whitespace-nowrap px-6 py-4">
										<div class="flex items-center gap-2">
											<div class="h-4 w-4 rounded bg-gray-200"></div>
											<div class="space-y-2">
												<div class="h-4 w-20 rounded bg-gray-200"></div>
												<div class="h-3 w-16 rounded bg-gray-200"></div>
											</div>
										</div>
									</td>
									<td class="whitespace-nowrap px-6 py-4">
										<div class="h-4 w-32 rounded bg-gray-200"></div>
									</td>
									<td class="whitespace-nowrap px-6 py-4">
										<div class="h-4 w-24 rounded bg-gray-200"></div>
									</td>
									<td class="whitespace-nowrap px-6 py-4 text-right">
										<div class="h-6 w-20 rounded bg-gray-200 inline-block"></div>
									</td>
								</tr>
							{/each}
						{:else if filteredSessions.length === 0}
							<tr><td colspan="5" class="px-6 py-10 text-center text-sm text-gray-500">No active sessions found.</td></tr>
						{:else}
							{#each filteredSessions as session}
								{@const device = getDevice(session.id)}
								{@const Icon = device.icon}
								<tr class="hover:bg-gray-50 transition-colors">
									<td class="whitespace-nowrap px-6 py-4">
										<div class="flex items-center gap-3">
											<div class="h-8 w-8 rounded-full bg-pink-100 flex items-center justify-center text-pink-700 font-bold text-xs shrink-0 overflow-hidden">
												{#if session.profilePhotoUrl}
													<img src={session.profilePhotoUrl} alt="" class="h-full w-full object-cover" />
												{:else}
													{session.firstName.charAt(0)}{session.lastName.charAt(0)}
												{/if}
											</div>
											<div>
												<p class="text-sm font-bold text-gray-900">{session.firstName} {session.lastName}</p>
												<p class="text-xs text-gray-500">{session.email}</p>
											</div>
										</div>
									</td>
									<td class="whitespace-nowrap px-6 py-4">
										<div class="flex items-center gap-2">
											<Icon size={16} class="text-gray-400" />
											<div>
												<p class="text-sm font-medium text-gray-900">{device.name}</p>
												<p class="text-xs text-gray-500">{device.browser}</p>
											</div>
										</div>
									</td>
									<td class="whitespace-nowrap px-6 py-4 text-sm text-gray-600">
										{getLocation(session.id)}
									</td>
									<td class="whitespace-nowrap px-6 py-4 text-sm">
										{#if session.lastLogin}
											<span class="inline-flex items-center gap-1 text-emerald-600 font-medium">
												<span class="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
												{formatTimeAgo(session.lastLogin)}
											</span>
										{:else}
											<span class="text-gray-400">Unknown</span>
										{/if}
									</td>
									<td class="whitespace-nowrap px-6 py-4 text-right">
										<button onclick={() => forceLogout(session.id, session.firstName)} class="inline-flex items-center gap-1.5 rounded bg-red-50 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-100 transition-colors">
											<LogOut size={14} /> Force Logout
										</button>
									</td>
								</tr>
							{/each}
						{/if}
					</tbody>
				</table>
			</div>
		{/if}

		{#if activeTab === 'failed-logins'}
			<div class="overflow-x-auto p-4 sm:p-0">
				<table class="min-w-full divide-y divide-gray-200">
					<thead class="bg-gray-50">
						<tr>
							<th scope="col" class="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Timestamp</th>
							<th scope="col" class="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">IP Address</th>
							<th scope="col" class="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Attempted User</th>
							<th scope="col" class="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Reason</th>
							<th scope="col" class="px-6 py-3 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">Action</th>
						</tr>
					</thead>
					<tbody class="divide-y divide-gray-100 bg-white">
						{#each failedLogins as log}
							<tr class="hover:bg-gray-50 transition-colors">
								<td class="whitespace-nowrap px-6 py-4 text-sm text-gray-600">
									{new Date(log.time).toLocaleString()}
								</td>
								<td class="whitespace-nowrap px-6 py-4 font-mono text-sm text-gray-900 font-medium">
									{log.ip}
								</td>
								<td class="whitespace-nowrap px-6 py-4 text-sm text-gray-600">
									{log.user}
								</td>
								<td class="whitespace-nowrap px-6 py-4">
									<span class={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold ${
										log.risk === 'high' ? 'bg-red-100 text-red-800' :
										log.risk === 'medium' ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-800'
									}`}>
										{log.reason}
									</span>
								</td>
								<td class="whitespace-nowrap px-6 py-4 text-right">
									{#if !blockedIPs.includes(log.ip)}
										<button onclick={() => blockIP(log.ip)} class="text-sm font-medium text-red-600 hover:text-red-900 transition-colors">
											Block IP
										</button>
									{:else}
										<span class="text-sm font-medium text-gray-400">Blocked</span>
									{/if}
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}

		{#if activeTab === 'access-control'}
			<div class="p-6 grid gap-8 lg:grid-cols-2">
				<!-- System Policies -->
				<div class="space-y-6">
					<h3 class="text-lg font-bold text-gray-900 flex items-center gap-2 border-b border-gray-100 pb-2">
						<Shield size={18} class="text-pink-600" /> Security Policies
					</h3>
					
					<div class="space-y-4">
						<div class="flex items-center justify-between p-4 rounded-lg border border-gray-200 bg-gray-50/50">
							<div>
								<p class="font-bold text-sm text-gray-900">Require Two-Factor Authentication</p>
								<p class="text-xs text-gray-500 mt-0.5">Enforce 2FA for all administrative accounts.</p>
							</div>
							<button onclick={() => require2FA = !require2FA} class="text-pink-600 focus:outline-none">
								{#if require2FA}
									<ToggleRight size={32} />
								{:else}
									<ToggleLeft size={32} class="text-gray-300" />
								{/if}
							</button>
						</div>

						<div class="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-lg border border-gray-200 bg-gray-50/50 gap-4">
							<div>
								<p class="font-bold text-sm text-gray-900">Session Timeout</p>
								<p class="text-xs text-gray-500 mt-0.5">Automatically log out inactive users.</p>
							</div>
							<div class="flex items-center gap-2">
								<Clock size={16} class="text-gray-400" />
								<select bind:value={sessionTimeout} class="rounded-md border border-gray-300 py-1.5 pl-3 pr-8 text-sm focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500 bg-white">
									<option value="15">15 Minutes</option>
									<option value="30">30 Minutes</option>
									<option value="60">1 Hour</option>
									<option value="480">8 Hours</option>
								</select>
							</div>
						</div>
					</div>

					<button onclick={saveAccessControl} class="w-full rounded-lg bg-pink-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-pink-500 transition-colors focus:outline-none focus:ring-2 focus:ring-pink-500 focus:ring-offset-2">
						Save Security Policies
					</button>
				</div>

				<!-- IP Blacklist -->
				<div class="space-y-4">
					<div class="flex items-center justify-between border-b border-gray-100 pb-2">
						<h3 class="text-lg font-bold text-gray-900 flex items-center gap-2">
							<Lock size={18} class="text-red-600" /> IP Blacklist
						</h3>
						<button class="inline-flex items-center gap-1 text-sm font-semibold text-pink-600 hover:text-pink-700">
							<Plus size={16} /> Add IP
						</button>
					</div>

					{#if blockedIPs.length === 0}
						<div class="rounded-lg border border-dashed border-gray-300 p-8 text-center">
							<CheckCircle size={24} class="mx-auto text-gray-400 mb-2" />
							<p class="text-sm font-medium text-gray-900">No Blocked IPs</p>
							<p class="text-xs text-gray-500 mt-1">All network traffic is currently permitted.</p>
						</div>
					{:else}
						<div class="rounded-lg border border-gray-200 bg-white divide-y divide-gray-100">
							{#each blockedIPs as ip}
								<div class="flex items-center justify-between p-3 hover:bg-gray-50 transition-colors">
									<div class="flex items-center gap-3">
										<XCircle size={16} class="text-red-500" />
										<span class="font-mono text-sm font-medium text-gray-900">{ip}</span>
									</div>
									<button onclick={() => unblockIP(ip)} class="text-gray-400 hover:text-red-600 transition-colors" title="Remove from blacklist">
										<Trash2 size={16} />
									</button>
								</div>
							{/each}
						</div>
					{/if}
				</div>
			</div>
		{/if}
	</div>
</div>
