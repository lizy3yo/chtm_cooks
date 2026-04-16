<script lang="ts">
	import { Users, Database, Activity, AlertTriangle, TrendingUp, Server, HardDrive, Cpu } from 'lucide-svelte';

	// Mock data - replace with actual API calls
	let stats = $state({
		totalUsers: 1247,
		activeUsers: 892,
		totalRequests: 3456,
		systemHealth: 98.5,
		storageUsed: 67.3,
		cpuUsage: 42.1,
		memoryUsage: 58.9,
		activeConnections: 234
	});

	let recentActivity = $state([
		{ id: 1, action: 'User created', user: 'John Doe', timestamp: '2 minutes ago', type: 'success' },
		{ id: 2, action: 'System backup completed', user: 'System', timestamp: '15 minutes ago', type: 'info' },
		{ id: 3, action: 'Failed login attempt', user: 'Unknown', timestamp: '23 minutes ago', type: 'warning' },
		{ id: 4, action: 'Database optimized', user: 'Admin', timestamp: '1 hour ago', type: 'success' },
		{ id: 5, action: 'User role updated', user: 'Jane Smith', timestamp: '2 hours ago', type: 'info' }
	]);

	let systemAlerts = $state([
		{ id: 1, message: 'High memory usage detected on server 2', severity: 'warning', timestamp: '5 minutes ago' },
		{ id: 2, message: 'Scheduled maintenance in 24 hours', severity: 'info', timestamp: '1 hour ago' }
	]);

	function getActivityColor(type: string): string {
		const colors: Record<string, string> = {
			success: 'bg-emerald-100 text-emerald-800',
			info: 'bg-blue-100 text-blue-800',
			warning: 'bg-amber-100 text-amber-800',
			error: 'bg-red-100 text-red-800'
		};
		return colors[type] || 'bg-gray-100 text-gray-800';
	}

	function getAlertColor(severity: string): string {
		const colors: Record<string, string> = {
			info: 'border-blue-200 bg-blue-50',
			warning: 'border-amber-200 bg-amber-50',
			error: 'border-red-200 bg-red-50'
		};
		return colors[severity] || 'border-gray-200 bg-gray-50';
	}
</script>

<div class="space-y-6">
	<!-- Header with Info -->
	<div class="flex flex-col gap-4">
		<div class="flex-1">
			<h1 class="text-2xl font-bold text-gray-900">System Dashboard</h1>
			<p class="mt-1 text-sm text-gray-500">Comprehensive overview of system health, user activity, and key metrics</p>
			
			<!-- Info Banner -->
			<div class="mt-4 flex items-start gap-3 rounded-lg border border-pink-200 bg-pink-50 p-4">
				<svg class="mt-0.5 h-5 w-5 shrink-0 text-pink-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
				</svg>
				<div class="flex-1 text-sm">
					<p class="font-medium text-pink-900">Superadmin Dashboard Overview</p>
					<ul class="mt-2 space-y-1 text-pink-800">
						<li>• Real-time system health monitoring: CPU, memory, storage, and active connections</li>
						<li>• User activity tracking: total users, active sessions, new registrations</li>
						<li>• Request volume metrics: pending approvals, active loans, completion rates</li>
						<li>• Recent activity feed: user actions, system events, security alerts</li>
						<li>• Quick access to critical management functions and reports</li>
					</ul>
				</div>
			</div>
		</div>
	</div>

	<!-- System Alerts -->
	{#if systemAlerts.length > 0}
		<div class="space-y-2">
			{#each systemAlerts as alert}
				<div class="flex items-start gap-3 rounded-lg border p-4 {getAlertColor(alert.severity)}">
					<AlertTriangle size={20} class="mt-0.5 shrink-0 {alert.severity === 'warning' ? 'text-amber-600' : 'text-blue-600'}" />
					<div class="flex-1">
						<p class="text-sm font-medium text-gray-900">{alert.message}</p>
						<p class="mt-0.5 text-xs text-gray-500">{alert.timestamp}</p>
					</div>
				</div>
			{/each}
		</div>
	{/if}

	<!-- Stats Grid -->
	<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
		<!-- Total Users -->
		<div class="rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md">
			<div class="flex items-center justify-between">
				<div>
					<p class="text-sm font-medium text-gray-500">Total Users</p>
					<p class="mt-2 text-3xl font-bold text-gray-900">{stats.totalUsers.toLocaleString()}</p>
					<p class="mt-1 flex items-center text-xs text-emerald-600">
						<TrendingUp size={14} class="mr-1" />
						+12% from last month
					</p>
				</div>
				<div class="flex h-12 w-12 items-center justify-center rounded-full bg-pink-100">
					<Users size={24} class="text-pink-600" />
				</div>
			</div>
		</div>

		<!-- Active Users -->
		<div class="rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md">
			<div class="flex items-center justify-between">
				<div>
					<p class="text-sm font-medium text-gray-500">Active Users</p>
					<p class="mt-2 text-3xl font-bold text-gray-900">{stats.activeUsers.toLocaleString()}</p>
					<p class="mt-1 text-xs text-gray-500">Currently online</p>
				</div>
				<div class="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100">
					<Activity size={24} class="text-emerald-600" />
				</div>
			</div>
		</div>

		<!-- Total Requests -->
		<div class="rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md">
			<div class="flex items-center justify-between">
				<div>
					<p class="text-sm font-medium text-gray-500">Total Requests</p>
					<p class="mt-2 text-3xl font-bold text-gray-900">{stats.totalRequests.toLocaleString()}</p>
					<p class="mt-1 text-xs text-gray-500">This month</p>
				</div>
				<div class="flex h-12 w-12 items-center justify-center rounded-full bg-blue-100">
					<Database size={24} class="text-blue-600" />
				</div>
			</div>
		</div>

		<!-- System Health -->
		<div class="rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md">
			<div class="flex items-center justify-between">
				<div>
					<p class="text-sm font-medium text-gray-500">System Health</p>
					<p class="mt-2 text-3xl font-bold text-gray-900">{stats.systemHealth}%</p>
					<p class="mt-1 text-xs text-emerald-600">All systems operational</p>
				</div>
				<div class="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100">
					<Server size={24} class="text-emerald-600" />
				</div>
			</div>
		</div>
	</div>

	<!-- System Resources -->
	<div class="grid gap-4 lg:grid-cols-3">
		<!-- Storage -->
		<div class="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
			<div class="flex items-center justify-between mb-3">
				<div class="flex items-center gap-2">
					<HardDrive size={18} class="text-gray-600" />
					<p class="text-sm font-semibold text-gray-900">Storage</p>
				</div>
				<span class="text-sm font-medium text-gray-900">{stats.storageUsed}%</span>
			</div>
			<div class="h-2 w-full overflow-hidden rounded-full bg-gray-200">
				<div class="h-full rounded-full bg-pink-600 transition-all duration-500" style="width: {stats.storageUsed}%"></div>
			</div>
			<p class="mt-2 text-xs text-gray-500">673 GB of 1 TB used</p>
		</div>

		<!-- CPU Usage -->
		<div class="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
			<div class="flex items-center justify-between mb-3">
				<div class="flex items-center gap-2">
					<Cpu size={18} class="text-gray-600" />
					<p class="text-sm font-semibold text-gray-900">CPU Usage</p>
				</div>
				<span class="text-sm font-medium text-gray-900">{stats.cpuUsage}%</span>
			</div>
			<div class="h-2 w-full overflow-hidden rounded-full bg-gray-200">
				<div class="h-full rounded-full bg-emerald-600 transition-all duration-500" style="width: {stats.cpuUsage}%"></div>
			</div>
			<p class="mt-2 text-xs text-gray-500">Normal load</p>
		</div>

		<!-- Memory Usage -->
		<div class="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
			<div class="flex items-center justify-between mb-3">
				<div class="flex items-center gap-2">
					<Activity size={18} class="text-gray-600" />
					<p class="text-sm font-semibold text-gray-900">Memory</p>
				</div>
				<span class="text-sm font-medium text-gray-900">{stats.memoryUsage}%</span>
			</div>
			<div class="h-2 w-full overflow-hidden rounded-full bg-gray-200">
				<div class="h-full rounded-full bg-blue-600 transition-all duration-500" style="width: {stats.memoryUsage}%"></div>
			</div>
			<p class="mt-2 text-xs text-gray-500">9.4 GB of 16 GB used</p>
		</div>
	</div>

	<!-- Recent Activity -->
	<div class="rounded-xl border border-gray-200 bg-white shadow-sm">
		<div class="border-b border-gray-200 px-6 py-4">
			<h2 class="text-lg font-semibold text-gray-900">Recent Activity</h2>
		</div>
		<div class="divide-y divide-gray-200">
			{#each recentActivity as activity}
				<div class="flex items-center justify-between px-6 py-4 hover:bg-gray-50 transition-colors">
					<div class="flex items-center gap-4">
						<span class="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold {getActivityColor(activity.type)}">
							{activity.type}
						</span>
						<div>
							<p class="text-sm font-medium text-gray-900">{activity.action}</p>
							<p class="text-xs text-gray-500">{activity.user}</p>
						</div>
					</div>
					<span class="text-xs text-gray-400">{activity.timestamp}</span>
				</div>
			{/each}
		</div>
		<div class="border-t border-gray-200 px-6 py-3">
			<a href="/superadmin/audit" class="text-sm font-medium text-pink-600 hover:text-pink-700">
				View all activity →
			</a>
		</div>
	</div>

	<!-- Quick Actions -->
	<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
		<a href="/superadmin/users" class="group rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-all hover:border-pink-300 hover:shadow-md">
			<Users size={24} class="mb-3 text-pink-600" />
			<h3 class="font-semibold text-gray-900 group-hover:text-pink-600">Manage Users</h3>
			<p class="mt-1 text-sm text-gray-500">Add, edit, or remove users</p>
		</a>

		<a href="/superadmin/class-codes" class="group rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-all hover:border-pink-300 hover:shadow-md">
			<svg class="mb-3 h-6 w-6 text-pink-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
			</svg>
			<h3 class="font-semibold text-gray-900 group-hover:text-pink-600">Class Codes</h3>
			<p class="mt-1 text-sm text-gray-500">Organize students by class</p>
		</a>

		<a href="/superadmin/requests" class="group rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-all hover:border-pink-300 hover:shadow-md">
			<svg class="mb-3 h-6 w-6 text-pink-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
			</svg>
			<h3 class="font-semibold text-gray-900 group-hover:text-pink-600">All Requests</h3>
			<p class="mt-1 text-sm text-gray-500">System-wide request oversight</p>
		</a>

		<a href="/superadmin/analytics" class="group rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-all hover:border-pink-300 hover:shadow-md">
			<svg class="mb-3 h-6 w-6 text-pink-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
			</svg>
			<h3 class="font-semibold text-gray-900 group-hover:text-pink-600">Analytics</h3>
			<p class="mt-1 text-sm text-gray-500">View detailed reports</p>
		</a>
	</div>
</div>
