<script lang="ts">
	import { Shield, Users, AlertTriangle, Lock, Info, Search } from 'lucide-svelte';

	let activeTab = $state<'sessions' | 'failed-logins' | 'access-control'>('sessions');
	let searchQuery = $state('');

	let stats = $state({
		activeSessions: 234,
		failedLogins: 12,
		blockedIPs: 3,
		securityAlerts: 2
	});
</script>

<div class="space-y-6">
	<div class="flex flex-col gap-4">
		<div class="flex-1">
			<h1 class="text-2xl font-bold text-gray-900">Security Management</h1>
			<p class="mt-1 text-sm text-gray-500">Monitor security events and manage access control</p>
			
			<div class="mt-4 flex items-start gap-3 rounded-lg border border-pink-200 bg-pink-50 p-4">
				<Info size={20} class="mt-0.5 shrink-0 text-pink-600" />
				<div class="flex-1 text-sm">
					<p class="font-medium text-pink-900">Security Features</p>
					<ul class="mt-2 space-y-1 text-pink-800">
						<li>• Monitor active user sessions: view devices, locations, last activity</li>
						<li>• Force logout users for security incidents or policy violations</li>
						<li>• Track failed login attempts and detect brute force attacks</li>
						<li>• IP whitelist/blacklist management for access control</li>
						<li>• Security event monitoring: suspicious activity, unusual patterns</li>
						<li>• Session timeout configuration and enforcement</li>
						<li>• Two-factor authentication management and enforcement</li>
					</ul>
				</div>
			</div>
		</div>
	</div>

	<!-- Tabs -->
	<div class="border-b border-gray-200">
		<nav class="-mb-px flex space-x-6">
			<button onclick={() => activeTab = 'sessions'} class="border-b-2 px-1 py-3 text-sm font-medium transition-colors {activeTab === 'sessions' ? 'border-pink-600 text-pink-600' : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'}">
				Active Sessions
			</button>
			<button onclick={() => activeTab = 'failed-logins'} class="border-b-2 px-1 py-3 text-sm font-medium transition-colors {activeTab === 'failed-logins' ? 'border-pink-600 text-pink-600' : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'}">
				Failed Logins
			</button>
			<button onclick={() => activeTab = 'access-control'} class="border-b-2 px-1 py-3 text-sm font-medium transition-colors {activeTab === 'access-control' ? 'border-pink-600 text-pink-600' : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'}">
				Access Control
			</button>
		</nav>
	</div>

	<!-- Stats -->
	<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
		<div class="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
			<p class="text-sm font-medium text-gray-500">Active Sessions</p>
			<p class="mt-2 text-3xl font-bold text-emerald-600">{stats.activeSessions}</p>
		</div>
		<div class="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
			<p class="text-sm font-medium text-gray-500">Failed Logins (24h)</p>
			<p class="mt-2 text-3xl font-bold text-amber-600">{stats.failedLogins}</p>
		</div>
		<div class="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
			<p class="text-sm font-medium text-gray-500">Blocked IPs</p>
			<p class="mt-2 text-3xl font-bold text-red-600">{stats.blockedIPs}</p>
		</div>
		<div class="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
			<p class="text-sm font-medium text-gray-500">Security Alerts</p>
			<p class="mt-2 text-3xl font-bold text-pink-600">{stats.securityAlerts}</p>
		</div>
	</div>

	<!-- Search -->
	<div class="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
		<div class="relative">
			<Search size={18} class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
			<input type="text" bind:value={searchQuery} placeholder="Search security events..." class="w-full rounded-lg border border-gray-300 py-2 pl-10 pr-4 text-sm focus:border-pink-500 focus:outline-none focus:ring-2 focus:ring-pink-500/20" />
		</div>
	</div>

	<!-- Content -->
	<div class="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
		<p class="text-center text-gray-500">Security data will be displayed here</p>
	</div>
</div>
