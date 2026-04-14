<script lang="ts">
	import { Database, Download, Upload, RefreshCw, Trash2, HardDrive, Clock } from 'lucide-svelte';

	// Mock data
	let databases = $state([
		{ name: 'main_db', size: '2.4 GB', tables: 45, lastBackup: '2 hours ago', status: 'healthy' },
		{ name: 'analytics_db', size: '1.8 GB', tables: 23, lastBackup: '3 hours ago', status: 'healthy' },
		{ name: 'logs_db', size: '856 MB', tables: 12, lastBackup: '1 hour ago', status: 'healthy' }
	]);

	let backups = $state([
		{ id: 1, name: 'main_db_backup_2024-04-14_10-00.sql', size: '2.4 GB', date: '2024-04-14 10:00:00', type: 'automatic' },
		{ id: 2, name: 'main_db_backup_2024-04-13_10-00.sql', size: '2.3 GB', date: '2024-04-13 10:00:00', type: 'automatic' },
		{ id: 3, name: 'main_db_backup_2024-04-12_10-00.sql', size: '2.3 GB', date: '2024-04-12 10:00:00', type: 'automatic' },
		{ id: 4, name: 'manual_backup_2024-04-11.sql', size: '2.2 GB', date: '2024-04-11 15:30:00', type: 'manual' }
	]);

	function getStatusColor(status: string): string {
		return status === 'healthy' ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800';
	}

	function getBackupTypeColor(type: string): string {
		return type === 'automatic' ? 'bg-blue-100 text-blue-800' : 'bg-purple-100 text-purple-800';
	}
</script>

<div class="space-y-6">
	<!-- Header -->
	<div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
		<div>
			<h1 class="text-2xl font-bold text-gray-900">Database Management</h1>
			<p class="mt-1 text-sm text-gray-500">Manage databases, backups, and maintenance</p>
		</div>
		<div class="flex gap-2">
			<button class="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50">
				<RefreshCw size={18} />
				Optimize
			</button>
			<button class="inline-flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-purple-700">
				<Download size={18} />
				Create Backup
			</button>
		</div>
	</div>

	<!-- Database Stats -->
	<div class="grid gap-4 sm:grid-cols-4">
		<div class="rounded-lg border border-gray-200 bg-white p-4">
			<div class="flex items-center gap-2 mb-2">
				<Database size={18} class="text-purple-600" />
				<p class="text-sm text-gray-500">Total Databases</p>
			</div>
			<p class="text-2xl font-bold text-gray-900">3</p>
		</div>
		<div class="rounded-lg border border-gray-200 bg-white p-4">
			<div class="flex items-center gap-2 mb-2">
				<HardDrive size={18} class="text-blue-600" />
				<p class="text-sm text-gray-500">Total Size</p>
			</div>
			<p class="text-2xl font-bold text-gray-900">5.1 GB</p>
		</div>
		<div class="rounded-lg border border-gray-200 bg-white p-4">
			<div class="flex items-center gap-2 mb-2">
				<Download size={18} class="text-emerald-600" />
				<p class="text-sm text-gray-500">Backups</p>
			</div>
			<p class="text-2xl font-bold text-gray-900">24</p>
		</div>
		<div class="rounded-lg border border-gray-200 bg-white p-4">
			<div class="flex items-center gap-2 mb-2">
				<Clock size={18} class="text-indigo-600" />
				<p class="text-sm text-gray-500">Last Backup</p>
			</div>
			<p class="text-2xl font-bold text-gray-900">1h ago</p>
		</div>
	</div>

	<!-- Databases -->
	<div class="rounded-xl border border-gray-200 bg-white shadow-sm">
		<div class="border-b border-gray-200 px-6 py-4">
			<h2 class="text-lg font-semibold text-gray-900">Databases</h2>
		</div>
		<div class="overflow-x-auto">
			<table class="w-full">
				<thead class="border-b border-gray-200 bg-gray-50">
					<tr>
						<th class="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">Database</th>
						<th class="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">Size</th>
						<th class="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">Tables</th>
						<th class="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">Last Backup</th>
						<th class="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">Status</th>
						<th class="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-600">Actions</th>
					</tr>
				</thead>
				<tbody class="divide-y divide-gray-200">
					{#each databases as db}
						<tr class="transition-colors hover:bg-gray-50">
							<td class="px-6 py-4">
								<div class="flex items-center gap-2">
									<Database size={18} class="text-purple-600" />
									<span class="font-medium text-gray-900">{db.name}</span>
								</div>
							</td>
							<td class="px-6 py-4 text-sm text-gray-900">{db.size}</td>
							<td class="px-6 py-4 text-sm text-gray-900">{db.tables}</td>
							<td class="px-6 py-4 text-sm text-gray-500">{db.lastBackup}</td>
							<td class="px-6 py-4">
								<span class="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold {getStatusColor(db.status)}">
									{db.status}
								</span>
							</td>
							<td class="px-6 py-4">
								<div class="flex items-center justify-end gap-2">
									<button class="rounded-lg p-2 text-gray-600 transition-colors hover:bg-purple-50 hover:text-purple-600" title="Backup">
										<Download size={16} />
									</button>
									<button class="rounded-lg p-2 text-gray-600 transition-colors hover:bg-blue-50 hover:text-blue-600" title="Optimize">
										<RefreshCw size={16} />
									</button>
								</div>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</div>

	<!-- Backups -->
	<div class="rounded-xl border border-gray-200 bg-white shadow-sm">
		<div class="border-b border-gray-200 px-6 py-4">
			<h2 class="text-lg font-semibold text-gray-900">Recent Backups</h2>
		</div>
		<div class="overflow-x-auto">
			<table class="w-full">
				<thead class="border-b border-gray-200 bg-gray-50">
					<tr>
						<th class="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">Backup Name</th>
						<th class="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">Size</th>
						<th class="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">Date</th>
						<th class="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">Type</th>
						<th class="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-600">Actions</th>
					</tr>
				</thead>
				<tbody class="divide-y divide-gray-200">
					{#each backups as backup}
						<tr class="transition-colors hover:bg-gray-50">
							<td class="px-6 py-4 text-sm font-medium text-gray-900">{backup.name}</td>
							<td class="px-6 py-4 text-sm text-gray-900">{backup.size}</td>
							<td class="px-6 py-4 text-sm text-gray-500">{backup.date}</td>
							<td class="px-6 py-4">
								<span class="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold {getBackupTypeColor(backup.type)}">
									{backup.type}
								</span>
							</td>
							<td class="px-6 py-4">
								<div class="flex items-center justify-end gap-2">
									<button class="rounded-lg p-2 text-gray-600 transition-colors hover:bg-emerald-50 hover:text-emerald-600" title="Download">
										<Download size={16} />
									</button>
									<button class="rounded-lg p-2 text-gray-600 transition-colors hover:bg-blue-50 hover:text-blue-600" title="Restore">
										<Upload size={16} />
									</button>
									<button class="rounded-lg p-2 text-gray-600 transition-colors hover:bg-red-50 hover:text-red-600" title="Delete">
										<Trash2 size={16} />
									</button>
								</div>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</div>

	<!-- Backup Schedule -->
	<div class="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
		<h3 class="text-lg font-semibold text-gray-900">Backup Schedule</h3>
		<p class="mt-1 text-sm text-gray-500">Configure automatic backup settings</p>
		<div class="mt-4 space-y-4">
			<div>
				<label for="frequency" class="block text-sm font-medium text-gray-700">Backup Frequency</label>
				<select
					id="frequency"
					class="mt-1 w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
				>
					<option value="hourly">Hourly</option>
					<option value="daily" selected>Daily</option>
					<option value="weekly">Weekly</option>
					<option value="monthly">Monthly</option>
				</select>
			</div>
			<div>
				<label for="retention" class="block text-sm font-medium text-gray-700">Retention Period (days)</label>
				<input
					id="retention"
					type="number"
					value="30"
					class="mt-1 w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
				/>
			</div>
			<button class="rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-purple-700">
				Save Schedule
			</button>
		</div>
	</div>
</div>
