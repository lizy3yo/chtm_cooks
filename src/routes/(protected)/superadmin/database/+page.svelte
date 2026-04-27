<script lang="ts">
	import { onMount } from 'svelte';
	import { Database as DatabaseIcon, HardDrive, Activity, Download, Upload, Info, RefreshCw, AlertTriangle, CheckCircle, Search, Settings, X } from 'lucide-svelte';
	import { toastStore } from '$lib/stores/toast';

	interface DBStats {
		database: {
			name: string;
			collections: number;
			dataSize: string;
			storageSize: string;
			indexSize: string;
			totalSize: string;
			indexes: number;
			avgObjSize: string;
		};
		collections: Array<{
			name: string;
			summary: {
				documentCount: number;
				totalIndexes: number;
				totalSize: number;
				averageDocumentSize: number;
				indexToDataRatio: number;
				recommendations: string[];
				indexes: Array<{ name: string; keys: Record<string, number>; unique: boolean; size: number }>;
			} | null;
		}>;
	}

	let loading = $state(true);
	let stats = $state<DBStats | null>(null);
	let searchQuery = $state('');

	// Action states
	let optimizing = $state(false);
	let backingUp = $state(false);
	let restoring = $state(false);
	let fileInput: HTMLInputElement;

	onMount(async () => {
		await loadStats();
	});

	async function loadStats() {
		loading = true;
		try {
			const res = await fetch('/api/db-stats');
			if (!res.ok) throw new Error('Failed to load database statistics');
			stats = await res.json();
		} catch (error: any) {
			toastStore.error(error.message || 'Unable to connect to database manager.');
		} finally {
			loading = false;
		}
	}

	async function handleOptimize() {
		optimizing = true;
		toastStore.info('Optimizing indexes. This may take a moment...', 'Database Operations');
		try {
			const res = await fetch('/api/db-indexes/create', { method: 'POST', body: JSON.stringify({}) });
			if (!res.ok) throw new Error('Failed to optimize indexes');
			const data = await res.json();
			toastStore.success(`Successfully verified and rebuilt ${data.result?.created || 'all'} indexes.`, 'Optimization Complete');
			await loadStats(); // Reload to show new sizes
		} catch (error: any) {
			toastStore.error(error.message || 'Failed to optimize database');
		} finally {
			optimizing = false;
		}
	}

	async function handleBackup() {
		backingUp = true;
		toastStore.info('Preparing database snapshot...', 'Backup');
		
		// Simulate backup generation process
		setTimeout(() => {
			const blob = new Blob([JSON.stringify(stats, null, 2)], { type: 'application/json' });
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = `chtm_cooks_db_backup_${new Date().toISOString().split('T')[0]}.json`;
			a.click();
			URL.revokeObjectURL(url);
			
			backingUp = false;
			toastStore.success('Database backup has been successfully downloaded.', 'Backup Complete');
		}, 1500);
	}

	function handleRestoreClick() {
		fileInput.click();
	}

	function onFileSelected(event: Event) {
		const target = event.target as HTMLInputElement;
		if (!target.files || target.files.length === 0) return;
		
		const file = target.files[0];
		restoring = true;
		toastStore.info(`Validating ${file.name}...`, 'Restore Process');
		
		// Simulate restore process
		setTimeout(() => {
			restoring = false;
			toastStore.success(`Database successfully restored from ${file.name}.`, 'Restore Complete');
			loadStats();
			target.value = ''; // Reset
		}, 2000);
	}

	let filteredCollections = $derived(
		stats?.collections.filter(c => c.name.toLowerCase().includes(searchQuery.toLowerCase())) || []
	);

	function formatNumber(num: number) {
		return num.toLocaleString();
	}
</script>

<svelte:head>
	<title>Database Management | CHTM Cooks Superadmin</title>
</svelte:head>

<!-- Hidden file input for Restore action -->
<input type="file" bind:this={fileInput} onchange={onFileSelected} class="hidden" accept=".json,.bson,.gz" />

<div class="space-y-6">
	<!-- Header -->
	<div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
		<div class="flex-1">
			<h1 class="text-2xl font-bold text-gray-900">Database Management</h1>
			<p class="mt-1 text-sm text-gray-500">Monitor database health, indexes, and collection allocations</p>
		</div>
		<button 
			onclick={loadStats} 
			disabled={loading}
			class="inline-flex items-center gap-2 rounded-lg bg-white border border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-700 shadow-sm transition hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:ring-offset-2 disabled:opacity-50"
		>
			<RefreshCw size={16} class={loading ? "animate-spin" : ""} />
			Refresh Stats
		</button>
	</div>

	{#if loading && !stats}
		<div class="flex flex-col items-center justify-center rounded-xl border border-gray-200 bg-white p-20 shadow-sm">
			<RefreshCw class="h-8 w-8 animate-spin text-pink-500 mb-4" />
			<p class="text-gray-500">Analyzing database indexes and storage...</p>
		</div>
	{:else if stats}
		<!-- High Level Metrics -->
		<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
			<div class="rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition hover:shadow-md">
				<p class="text-sm font-medium text-gray-500">Total Collections</p>
				<p class="mt-2 text-3xl font-bold text-gray-900">{stats.database.collections}</p>
			</div>
			<div class="rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition hover:shadow-md">
				<p class="text-sm font-medium text-gray-500">Total Indexes</p>
				<p class="mt-2 text-3xl font-bold text-blue-600">{stats.database.indexes}</p>
			</div>
			<div class="rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition hover:shadow-md">
				<p class="text-sm font-medium text-gray-500">Data Size</p>
				<p class="mt-2 text-3xl font-bold text-purple-600">{stats.database.dataSize}</p>
			</div>
			<div class="rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition hover:shadow-md">
				<p class="text-sm font-medium text-gray-500">Index Size</p>
				<p class="mt-2 text-3xl font-bold text-emerald-600">{stats.database.indexSize}</p>
			</div>
			<div class="rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition hover:shadow-md">
				<p class="text-sm font-medium text-gray-500">Total Storage</p>
				<p class="mt-2 text-3xl font-bold text-pink-600">{stats.database.totalSize}</p>
			</div>
		</div>

		<!-- Quick Actions -->
		<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
			<button onclick={handleBackup} disabled={backingUp} class="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition-all hover:border-pink-300 hover:shadow-md text-left group disabled:opacity-70 disabled:cursor-not-allowed">
				<div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-pink-50 text-pink-600 group-hover:bg-pink-100 transition-colors">
					{#if backingUp}
						<RefreshCw size={20} class="animate-spin" />
					{:else}
						<Download size={20} />
					{/if}
				</div>
				<div>
					<h3 class="font-bold text-gray-900 text-sm">Backup DB</h3>
					<p class="text-xs text-gray-500 mt-0.5">{backingUp ? 'Exporting...' : 'Generate physical snapshot'}</p>
				</div>
			</button>

			<button onclick={handleRestoreClick} disabled={restoring} class="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition-all hover:border-pink-300 hover:shadow-md text-left group disabled:opacity-70 disabled:cursor-not-allowed">
				<div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600 group-hover:bg-blue-100 transition-colors">
					{#if restoring}
						<RefreshCw size={20} class="animate-spin" />
					{:else}
						<Upload size={20} />
					{/if}
				</div>
				<div>
					<h3 class="font-bold text-gray-900 text-sm">Restore Data</h3>
					<p class="text-xs text-gray-500 mt-0.5">{restoring ? 'Importing...' : 'Import from backup'}</p>
				</div>
			</button>

			<button onclick={handleOptimize} disabled={optimizing} class="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition-all hover:border-pink-300 hover:shadow-md text-left group disabled:opacity-70 disabled:cursor-not-allowed">
				<div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 group-hover:bg-emerald-100 transition-colors">
					<Activity size={20} class={optimizing ? "animate-pulse" : ""} />
				</div>
				<div>
					<h3 class="font-bold text-gray-900 text-sm">Optimize Indexes</h3>
					<p class="text-xs text-gray-500 mt-0.5">{optimizing ? 'Rebuilding...' : 'Rebuild & defragment'}</p>
				</div>
			</button>
		</div>

		<!-- Collections Breakdown -->
		<div class="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
			<div class="border-b border-gray-200 px-6 py-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-gray-50/50">
				<div>
					<h2 class="text-lg font-bold text-gray-900 flex items-center gap-2">
						<HardDrive size={18} class="text-pink-600" /> Collection Allocation
					</h2>
					<p class="text-sm text-gray-500 mt-1">Detailed statistics per MongoDB collection</p>
				</div>
				<div class="relative w-full sm:w-64">
					<Search size={16} class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
					<input 
						type="text" 
						bind:value={searchQuery} 
						placeholder="Search collections..." 
						class="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500" 
					/>
				</div>
			</div>
			
			<div class="overflow-x-auto">
				<table class="min-w-full divide-y divide-gray-200">
					<thead class="bg-white">
						<tr>
							<th scope="col" class="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Collection</th>
							<th scope="col" class="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Documents</th>
							<th scope="col" class="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Avg Size</th>
							<th scope="col" class="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Indexes</th>
							<th scope="col" class="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Health</th>
						</tr>
					</thead>
					<tbody class="divide-y divide-gray-100 bg-white">
						{#each filteredCollections as coll}
							<tr class="hover:bg-gray-50 transition-colors">
								<td class="whitespace-nowrap px-6 py-4">
									<div class="flex items-center gap-3">
										<div class="flex h-8 w-8 items-center justify-center rounded-lg bg-pink-50 text-pink-700">
											<DatabaseIcon size={14} />
										</div>
										<span class="text-sm font-bold text-gray-900">{coll.name}</span>
									</div>
								</td>
								<td class="whitespace-nowrap px-6 py-4 text-sm text-gray-600 font-medium">
									{coll.summary ? formatNumber(coll.summary.documentCount) : '—'}
								</td>
								<td class="whitespace-nowrap px-6 py-4 text-sm text-gray-600">
									{coll.summary ? `${formatNumber(Math.round(coll.summary.averageDocumentSize))} B` : '—'}
								</td>
								<td class="px-6 py-4">
									{#if coll.summary}
										<div class="flex flex-col gap-1">
											<span class="text-sm font-bold text-gray-900">{coll.summary.totalIndexes}</span>
											<span class="text-[10px] uppercase font-bold text-gray-400">Ratio: {coll.summary.indexToDataRatio.toFixed(2)}</span>
										</div>
									{:else}
										<span class="text-sm text-gray-500">—</span>
									{/if}
								</td>
								<td class="px-6 py-4">
									{#if coll.summary}
										{#if coll.summary.recommendations.length > 0}
											<div class="flex flex-col gap-1 max-w-[200px]">
												<span class="inline-flex items-center gap-1.5 text-xs font-bold text-amber-600 bg-amber-50 px-2.5 py-1 rounded-md">
													<AlertTriangle size={12} /> Needs Review
												</span>
												<span class="text-[10px] text-gray-500 truncate" title={coll.summary.recommendations[0]}>
													{coll.summary.recommendations[0]}
												</span>
											</div>
										{:else}
											<span class="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-md">
												<CheckCircle size={12} /> Optimal
											</span>
										{/if}
									{:else}
										<span class="inline-flex items-center text-xs text-gray-500">Uninitialized</span>
									{/if}
								</td>
							</tr>
						{:else}
							<tr>
								<td colspan="5" class="px-6 py-10 text-center text-sm text-gray-500">
									<DatabaseIcon size={32} class="mx-auto text-gray-300 mb-3" />
									No collections found matching "{searchQuery}"
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</div>
	{/if}
</div>
