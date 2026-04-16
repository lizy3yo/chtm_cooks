<script lang="ts">
	import { Database as DatabaseIcon, HardDrive, Activity, Download, Upload, Info } from 'lucide-svelte';

	let stats = $state({
		totalCollections: 12,
		totalDocuments: 15234,
		databaseSize: '2.4 GB',
		indexCount: 45,
		lastBackup: '2 hours ago'
	});
</script>

<div class="space-y-6">
	<div class="flex flex-col gap-4">
		<div class="flex-1">
			<h1 class="text-2xl font-bold text-gray-900">Database Management</h1>
			<p class="mt-1 text-sm text-gray-500">Monitor database health and perform maintenance operations</p>
			
			<div class="mt-4 flex items-start gap-3 rounded-lg border border-pink-200 bg-pink-50 p-4">
				<Info size={20} class="mt-0.5 shrink-0 text-pink-600" />
				<div class="flex-1 text-sm">
					<p class="font-medium text-pink-900">Database Management Features</p>
					<ul class="mt-2 space-y-1 text-pink-800">
						<li>• Monitor database health: collection sizes, document counts, index performance</li>
						<li>• View query performance metrics and slow query logs</li>
						<li>• Manage database backups: schedule, restore, verify integrity</li>
						<li>• Index management: create, rebuild, analyze performance</li>
						<li>• Data export/import tools for migrations and backups</li>
						<li>• Database cleanup utilities for archived and deleted data</li>
						<li>• Connection pool monitoring and optimization</li>
					</ul>
				</div>
			</div>
		</div>
	</div>

	<!-- Stats -->
	<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
		<div class="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
			<p class="text-sm font-medium text-gray-500">Collections</p>
			<p class="mt-2 text-3xl font-bold text-gray-900">{stats.totalCollections}</p>
		</div>
		<div class="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
			<p class="text-sm font-medium text-gray-500">Documents</p>
			<p class="mt-2 text-3xl font-bold text-pink-600">{stats.totalDocuments.toLocaleString()}</p>
		</div>
		<div class="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
			<p class="text-sm font-medium text-gray-500">Database Size</p>
			<p class="mt-2 text-3xl font-bold text-purple-600">{stats.databaseSize}</p>
		</div>
		<div class="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
			<p class="text-sm font-medium text-gray-500">Indexes</p>
			<p class="mt-2 text-3xl font-bold text-blue-600">{stats.indexCount}</p>
		</div>
		<div class="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
			<p class="text-sm font-medium text-gray-500">Last Backup</p>
			<p class="mt-2 text-lg font-bold text-emerald-600">{stats.lastBackup}</p>
		</div>
	</div>

	<!-- Actions -->
	<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
		<button class="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-all hover:border-pink-300 hover:shadow-md">
			<div class="flex h-12 w-12 items-center justify-center rounded-lg bg-pink-100">
				<Download size={24} class="text-pink-600" />
			</div>
			<div class="text-left">
				<h3 class="font-semibold text-gray-900">Backup Database</h3>
				<p class="text-sm text-gray-500">Create manual backup</p>
			</div>
		</button>

		<button class="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-all hover:border-pink-300 hover:shadow-md">
			<div class="flex h-12 w-12 items-center justify-center rounded-lg bg-blue-100">
				<Activity size={24} class="text-blue-600" />
			</div>
			<div class="text-left">
				<h3 class="font-semibold text-gray-900">Optimize Database</h3>
				<p class="text-sm text-gray-500">Run optimization tasks</p>
			</div>
		</button>

		<button class="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-all hover:border-pink-300 hover:shadow-md">
			<div class="flex h-12 w-12 items-center justify-center rounded-lg bg-purple-100">
				<HardDrive size={24} class="text-purple-600" />
			</div>
			<div class="text-left">
				<h3 class="font-semibold text-gray-900">View Collections</h3>
				<p class="text-sm text-gray-500">Browse database structure</p>
			</div>
		</button>
	</div>
</div>
