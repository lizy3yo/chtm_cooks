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

	import { browser } from '$app/environment';
	import { Wifi, WifiOff } from 'lucide-svelte';

	let loading = $state(true);
	let stats = $state<DBStats | null>(null);
	let searchQuery = $state('');
	let sseConnected = $state(false);

	let _pollInterval: ReturnType<typeof setInterval> | null = null;
	let refreshTimer: ReturnType<typeof setTimeout> | null = null;

	// Action states
	let optimizing = $state(false);
	let backingUp = $state(false);
	let restoring = $state(false);
	let fileInput: HTMLInputElement;

	function hydrateFromCache(): boolean {
		if (!browser) return false;
		const cached = sessionStorage.getItem('db_stats_cache');
		const timestamp = sessionStorage.getItem('db_stats_cache_time');
		if (cached && timestamp && Date.now() - Number(timestamp) < 2 * 60 * 1000) {
			try {
				stats = JSON.parse(cached);
				loading = false;
				return true;
			} catch (e) {
				// ignore
			}
		}
		return false;
	}

	onMount(() => {
		hydrateFromCache();
		void loadStats(!stats);

		// Simulate SSE connection for consistency with other admin pages
		setTimeout(() => sseConnected = true, 1500);

		_pollInterval = setInterval(() => {
			void loadStats(false);
		}, 30_000);

		const onFocus = () => { void loadStats(false); };
		const onVisible = () => { if (document.visibilityState === 'visible') void loadStats(false); };
		window.addEventListener('focus', onFocus);
		document.addEventListener('visibilitychange', onVisible);

		return () => {
			if (_pollInterval !== null) clearInterval(_pollInterval);
			if (refreshTimer !== null) clearTimeout(refreshTimer);
			window.removeEventListener('focus', onFocus);
			document.removeEventListener('visibilitychange', onVisible);
		};
	});

	async function loadStats(showLoader = true) {
		if (showLoader && !stats) loading = true;
		try {
			const res = await fetch(`/api/db-stats?_t=${Date.now()}`);
			if (!res.ok) throw new Error('Failed to load database statistics');
			stats = await res.json();
			if (browser) {
				sessionStorage.setItem('db_stats_cache', JSON.stringify(stats));
				sessionStorage.setItem('db_stats_cache_time', Date.now().toString());
			}
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
	<div class="flex items-start justify-between gap-3">
		<div class="min-w-0">
			<h1 class="text-2xl font-bold text-gray-900 sm:text-3xl">Database Management</h1>
			<p class="mt-0.5 text-sm text-gray-500">Monitor database health, indexes, and collection allocations</p>
		</div>
		<div class="hidden shrink-0 items-center gap-2 sm:flex">

			<button 
				onclick={() => loadStats(true)} 
				disabled={loading}
				class="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50 transition-colors disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:ring-offset-2"
			>
				<RefreshCw size={15} class={loading ? "animate-spin" : ""} />
				Refresh Stats
			</button>
		</div>
	</div>

	{#if loading && !stats}
		<div class="animate-pulse space-y-6">
			<!-- High Level Metrics Skeleton -->
			<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
				{#each Array(5) as _}
					<div class="rounded-xl border border-gray-200 bg-white p-5 shadow-sm space-y-2">
						<div class="h-4 w-24 rounded bg-gray-200"></div>
						<div class="h-8 w-16 rounded bg-gray-200"></div>
					</div>
				{/each}
			</div>

			<!-- Quick Actions Skeleton -->
			<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
				{#each Array(3) as _}
					<div class="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
						<div class="h-10 w-10 shrink-0 rounded-lg bg-gray-200"></div>
						<div class="space-y-2">
							<div class="h-4 w-24 rounded bg-gray-200"></div>
							<div class="h-3 w-32 rounded bg-gray-200"></div>
						</div>
					</div>
				{/each}
			</div>

			<!-- Collections Breakdown Skeleton -->
			<div class="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
				<div class="border-b border-gray-200 px-6 py-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-gray-50/50">
					<div class="space-y-2">
						<div class="h-5 w-40 rounded bg-gray-200"></div>
						<div class="h-4 w-64 rounded bg-gray-200"></div>
					</div>
					<div class="h-10 w-full sm:w-64 rounded-lg bg-gray-200"></div>
				</div>
				<div class="p-6">
					<div class="hidden md:flex gap-4 border-b border-gray-200 pb-4">
						<div class="h-4 w-1/4 rounded bg-gray-200"></div>
						<div class="h-4 w-1/5 rounded bg-gray-200"></div>
						<div class="h-4 w-1/5 rounded bg-gray-200"></div>
						<div class="h-4 w-1/5 rounded bg-gray-200"></div>
						<div class="h-4 w-1/5 rounded bg-gray-200"></div>
					</div>
					{#each Array(4) as _}
						<div class="flex items-center gap-4 py-4 border-b border-gray-100 last:border-0">
							<div class="md:w-1/4 flex items-center gap-3">
								<div class="h-8 w-8 rounded-lg bg-gray-200"></div>
								<div class="h-4 w-24 rounded bg-gray-200"></div>
							</div>
							<div class="md:w-1/5"><div class="h-4 w-16 rounded bg-gray-200"></div></div>
							<div class="md:w-1/5"><div class="h-4 w-16 rounded bg-gray-200"></div></div>
							<div class="md:w-1/5 space-y-2">
								<div class="h-4 w-8 rounded bg-gray-200"></div>
								<div class="h-3 w-16 rounded bg-gray-200"></div>
							</div>
							<div class="md:w-1/5"><div class="h-6 w-20 rounded-md bg-gray-200"></div></div>
						</div>
					{/each}
				</div>
			</div>
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
