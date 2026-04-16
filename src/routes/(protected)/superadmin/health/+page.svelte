<script lang="ts">
	import { Activity, Server, Database, Wifi, Info } from 'lucide-svelte';

	let stats = $state({
		systemHealth: 98.5,
		uptime: '45 days',
		cpuUsage: 42.1,
		memoryUsage: 58.9,
		storageUsed: 67.3,
		activeConnections: 234,
		responseTime: '45ms'
	});
</script>

<div class="space-y-6">
	<div class="flex flex-col gap-4">
		<div class="flex-1">
			<h1 class="text-2xl font-bold text-gray-900">System Health</h1>
			<p class="mt-1 text-sm text-gray-500">Monitor system performance and resource utilization</p>
			
			<div class="mt-4 flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
				<Info size={20} class="mt-0.5 shrink-0 text-emerald-600" />
				<div class="flex-1 text-sm">
					<p class="font-medium text-emerald-900">All Systems Operational</p>
					<p class="mt-1 text-emerald-800">System health score: {stats.systemHealth}% • Uptime: {stats.uptime}</p>
				</div>
			</div>
		</div>
	</div>

	<!-- Health Score -->
	<div class="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
		<div class="flex items-center justify-between mb-4">
			<h2 class="text-lg font-semibold text-gray-900">Overall Health Score</h2>
			<span class="text-3xl font-bold text-emerald-600">{stats.systemHealth}%</span>
		</div>
		<div class="h-4 w-full overflow-hidden rounded-full bg-gray-200">
			<div class="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-600 transition-all duration-500" style="width: {stats.systemHealth}%"></div>
		</div>
	</div>

	<!-- Resource Usage -->
	<div class="grid gap-4 lg:grid-cols-3">
		<div class="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
			<div class="flex items-center justify-between mb-3">
				<div class="flex items-center gap-2">
					<Activity size={18} class="text-gray-600" />
					<p class="text-sm font-semibold text-gray-900">CPU Usage</p>
				</div>
				<span class="text-sm font-medium text-gray-900">{stats.cpuUsage}%</span>
			</div>
			<div class="h-2 w-full overflow-hidden rounded-full bg-gray-200">
				<div class="h-full rounded-full bg-emerald-600 transition-all duration-500" style="width: {stats.cpuUsage}%"></div>
			</div>
			<p class="mt-2 text-xs text-gray-500">Normal load</p>
		</div>

		<div class="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
			<div class="flex items-center justify-between mb-3">
				<div class="flex items-center gap-2">
					<Server size={18} class="text-gray-600" />
					<p class="text-sm font-semibold text-gray-900">Memory</p>
				</div>
				<span class="text-sm font-medium text-gray-900">{stats.memoryUsage}%</span>
			</div>
			<div class="h-2 w-full overflow-hidden rounded-full bg-gray-200">
				<div class="h-full rounded-full bg-blue-600 transition-all duration-500" style="width: {stats.memoryUsage}%"></div>
			</div>
			<p class="mt-2 text-xs text-gray-500">9.4 GB of 16 GB used</p>
		</div>

		<div class="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
			<div class="flex items-center justify-between mb-3">
				<div class="flex items-center gap-2">
					<Database size={18} class="text-gray-600" />
					<p class="text-sm font-semibold text-gray-900">Storage</p>
				</div>
				<span class="text-sm font-medium text-gray-900">{stats.storageUsed}%</span>
			</div>
			<div class="h-2 w-full overflow-hidden rounded-full bg-gray-200">
				<div class="h-full rounded-full bg-purple-600 transition-all duration-500" style="width: {stats.storageUsed}%"></div>
			</div>
			<p class="mt-2 text-xs text-gray-500">673 GB of 1 TB used</p>
		</div>
	</div>

	<!-- Additional Metrics -->
	<div class="grid gap-4 sm:grid-cols-2">
		<div class="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
			<div class="flex items-center gap-3">
				<div class="flex h-12 w-12 items-center justify-center rounded-lg bg-pink-100">
					<Wifi size={24} class="text-pink-600" />
				</div>
				<div>
					<p class="text-sm font-medium text-gray-500">Active Connections</p>
					<p class="text-2xl font-bold text-gray-900">{stats.activeConnections}</p>
				</div>
			</div>
		</div>

		<div class="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
			<div class="flex items-center gap-3">
				<div class="flex h-12 w-12 items-center justify-center rounded-lg bg-emerald-100">
					<Activity size={24} class="text-emerald-600" />
				</div>
				<div>
					<p class="text-sm font-medium text-gray-500">Avg Response Time</p>
					<p class="text-2xl font-bold text-gray-900">{stats.responseTime}</p>
				</div>
			</div>
		</div>
	</div>
</div>
