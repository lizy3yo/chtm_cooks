<script lang="ts">
	import { Server, Database, HardDrive, Cpu, Activity, Wifi, CheckCircle2, AlertTriangle, XCircle } from 'lucide-svelte';

	// Mock data
	let systemStatus = $state({
		overall: 'healthy',
		lastChecked: new Date().toLocaleString()
	});

	let services = $state([
		{ name: 'Web Server', status: 'healthy', uptime: '99.9%', responseTime: '45ms' },
		{ name: 'Database', status: 'healthy', uptime: '99.8%', responseTime: '12ms' },
		{ name: 'API Gateway', status: 'healthy', uptime: '99.9%', responseTime: '23ms' },
		{ name: 'File Storage', status: 'warning', uptime: '98.5%', responseTime: '156ms' },
		{ name: 'Email Service', status: 'healthy', uptime: '99.7%', responseTime: '89ms' },
		{ name: 'Cache Server', status: 'healthy', uptime: '99.9%', responseTime: '8ms' }
	]);

	let resources = $state({
		cpu: { usage: 42.1, status: 'healthy' },
		memory: { usage: 58.9, status: 'healthy' },
		disk: { usage: 67.3, status: 'warning' },
		network: { usage: 23.4, status: 'healthy' }
	});

	function getStatusIcon(status: string) {
		switch (status) {
			case 'healthy': return CheckCircle2;
			case 'warning': return AlertTriangle;
			case 'error': return XCircle;
			default: return CheckCircle2;
		}
	}

	function getStatusColor(status: string) {
		switch (status) {
			case 'healthy': return 'text-emerald-600';
			case 'warning': return 'text-amber-600';
			case 'error': return 'text-red-600';
			default: return 'text-gray-600';
		}
	}

	function getStatusBadgeColor(status: string) {
		switch (status) {
			case 'healthy': return 'bg-emerald-100 text-emerald-800';
			case 'warning': return 'bg-amber-100 text-amber-800';
			case 'error': return 'bg-red-100 text-red-800';
			default: return 'bg-gray-100 text-gray-800';
		}
	}

	function getResourceColor(usage: number) {
		if (usage < 60) return 'bg-emerald-600';
		if (usage < 80) return 'bg-amber-600';
		return 'bg-red-600';
	}
</script>

<div class="space-y-6">
	<!-- Header -->
	<div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
		<div>
			<h1 class="text-2xl font-bold text-gray-900">System Health</h1>
			<p class="mt-1 text-sm text-gray-500">Monitor system status and performance</p>
		</div>
		<button class="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50">
			<Activity size={18} />
			Refresh Status
		</button>
	</div>

	<!-- Overall Status -->
	<div class="rounded-xl border-2 {systemStatus.overall === 'healthy' ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'} p-6">
		<div class="flex items-center gap-4">
			<div class="flex h-16 w-16 items-center justify-center rounded-full {systemStatus.overall === 'healthy' ? 'bg-emerald-100' : 'bg-amber-100'}">
				<svelte:component this={getStatusIcon(systemStatus.overall)} size={32} class={getStatusColor(systemStatus.overall)} />
			</div>
			<div>
				<h2 class="text-2xl font-bold text-gray-900">
					{systemStatus.overall === 'healthy' ? 'All Systems Operational' : 'System Warning'}
				</h2>
				<p class="mt-1 text-sm text-gray-600">Last checked: {systemStatus.lastChecked}</p>
			</div>
		</div>
	</div>

	<!-- Services Status -->
	<div class="rounded-xl border border-gray-200 bg-white shadow-sm">
		<div class="border-b border-gray-200 px-6 py-4">
			<h3 class="text-lg font-semibold text-gray-900">Services Status</h3>
		</div>
		<div class="divide-y divide-gray-200">
			{#each services as service}
				<div class="flex items-center justify-between px-6 py-4 hover:bg-gray-50 transition-colors">
					<div class="flex items-center gap-4">
						<svelte:component this={getStatusIcon(service.status)} size={20} class={getStatusColor(service.status)} />
						<div>
							<p class="font-medium text-gray-900">{service.name}</p>
							<p class="text-sm text-gray-500">Response time: {service.responseTime}</p>
						</div>
					</div>
					<div class="flex items-center gap-4">
						<div class="text-right">
							<p class="text-sm font-medium text-gray-900">Uptime: {service.uptime}</p>
						</div>
						<span class="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold {getStatusBadgeColor(service.status)}">
							{service.status}
						</span>
					</div>
				</div>
			{/each}
		</div>
	</div>

	<!-- Resource Usage -->
	<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
		<!-- CPU -->
		<div class="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
			<div class="flex items-center justify-between mb-3">
				<div class="flex items-center gap-2">
					<Cpu size={20} class="text-purple-600" />
					<p class="font-semibold text-gray-900">CPU</p>
				</div>
				<span class="text-sm font-medium text-gray-900">{resources.cpu.usage}%</span>
			</div>
			<div class="h-2 w-full overflow-hidden rounded-full bg-gray-200">
				<div class="h-full rounded-full transition-all duration-500 {getResourceColor(resources.cpu.usage)}" style="width: {resources.cpu.usage}%"></div>
			</div>
			<p class="mt-2 text-xs text-gray-500">Status: {resources.cpu.status}</p>
		</div>

		<!-- Memory -->
		<div class="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
			<div class="flex items-center justify-between mb-3">
				<div class="flex items-center gap-2">
					<Activity size={20} class="text-blue-600" />
					<p class="font-semibold text-gray-900">Memory</p>
				</div>
				<span class="text-sm font-medium text-gray-900">{resources.memory.usage}%</span>
			</div>
			<div class="h-2 w-full overflow-hidden rounded-full bg-gray-200">
				<div class="h-full rounded-full transition-all duration-500 {getResourceColor(resources.memory.usage)}" style="width: {resources.memory.usage}%"></div>
			</div>
			<p class="mt-2 text-xs text-gray-500">9.4 GB of 16 GB</p>
		</div>

		<!-- Disk -->
		<div class="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
			<div class="flex items-center justify-between mb-3">
				<div class="flex items-center gap-2">
					<HardDrive size={20} class="text-emerald-600" />
					<p class="font-semibold text-gray-900">Disk</p>
				</div>
				<span class="text-sm font-medium text-gray-900">{resources.disk.usage}%</span>
			</div>
			<div class="h-2 w-full overflow-hidden rounded-full bg-gray-200">
				<div class="h-full rounded-full transition-all duration-500 {getResourceColor(resources.disk.usage)}" style="width: {resources.disk.usage}%"></div>
			</div>
			<p class="mt-2 text-xs text-gray-500">673 GB of 1 TB</p>
		</div>

		<!-- Network -->
		<div class="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
			<div class="flex items-center justify-between mb-3">
				<div class="flex items-center gap-2">
					<Wifi size={20} class="text-indigo-600" />
					<p class="font-semibold text-gray-900">Network</p>
				</div>
				<span class="text-sm font-medium text-gray-900">{resources.network.usage}%</span>
			</div>
			<div class="h-2 w-full overflow-hidden rounded-full bg-gray-200">
				<div class="h-full rounded-full transition-all duration-500 {getResourceColor(resources.network.usage)}" style="width: {resources.network.usage}%"></div>
			</div>
			<p class="mt-2 text-xs text-gray-500">234 Mbps</p>
		</div>
	</div>

	<!-- Recent Incidents -->
	<div class="rounded-xl border border-gray-200 bg-white shadow-sm">
		<div class="border-b border-gray-200 px-6 py-4">
			<h3 class="text-lg font-semibold text-gray-900">Recent Incidents</h3>
		</div>
		<div class="p-6">
			<div class="text-center py-8">
				<CheckCircle2 size={48} class="mx-auto mb-3 text-emerald-600" />
				<p class="text-sm font-medium text-gray-900">No incidents in the last 30 days</p>
				<p class="mt-1 text-sm text-gray-500">System has been running smoothly</p>
			</div>
		</div>
	</div>
</div>
