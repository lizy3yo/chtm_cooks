<script lang="ts">
	import { page } from '$app/stores';
	import { user } from '$lib/stores/auth';

	let activeTab = $state<'inventory' | 'usage' | 'financial' | 'export'>('inventory');

	// Date range filters
	let dateRange = $state({
		start: new Date(new Date().setDate(new Date().getDate() - 30)).toISOString().split('T')[0],
		end: new Date().toISOString().split('T')[0]
	});

	// Sample data for inventory reports
	let inventoryReport = $state([
		{
			category: 'Cutlery',
			totalItems: 125,
			itemTypes: 8,
			totalValue: 45000,
			condition: { good: 110, needsRepair: 10, damaged: 5 },
			utilizationRate: 88
		},
		{
			category: 'Cookware',
			totalItems: 89,
			itemTypes: 12,
			totalValue: 67500,
			condition: { good: 78, needsRepair: 8, damaged: 3 },
			utilizationRate: 92
		},
		{
			category: 'Measuring Tools',
			totalItems: 45,
			itemTypes: 6,
			totalValue: 12000,
			condition: { good: 38, needsRepair: 5, damaged: 2 },
			utilizationRate: 76
		},
		{
			category: 'Equipment',
			totalItems: 28,
			itemTypes: 9,
			totalValue: 185000,
			condition: { good: 24, needsRepair: 3, damaged: 1 },
			utilizationRate: 85
		},
		{
			category: 'Utensils',
			totalItems: 156,
			itemTypes: 15,
			totalValue: 28000,
			condition: { good: 145, needsRepair: 8, damaged: 3 },
			utilizationRate: 94
		}
	]);

	// Sample data for usage statistics
	let usageStats = $state({
		topBorrowedItems: [
			{ name: 'Chef Knife Set', category: 'Cutlery', timesLoaned: 145, currentlyOut: 8, avgDuration: 3.2 },
			{ name: 'Mixing Bowl (Large)', category: 'Cookware', timesLoaned: 132, currentlyOut: 12, avgDuration: 2.8 },
			{ name: 'Whisk', category: 'Utensils', timesLoaned: 128, currentlyOut: 15, avgDuration: 2.5 },
			{ name: 'Measuring Cups', category: 'Measuring Tools', timesLoaned: 115, currentlyOut: 10, avgDuration: 3.0 },
			{ name: 'Food Processor', category: 'Equipment', timesLoaned: 98, currentlyOut: 3, avgDuration: 4.5 }
		],
		monthlyTrends: [
			{ month: 'Aug 2025', requests: 245, approved: 232, rejected: 13, avgProcessTime: 2.3 },
			{ month: 'Sep 2025', requests: 268, approved: 255, rejected: 13, avgProcessTime: 2.1 },
			{ month: 'Oct 2025', requests: 289, approved: 275, rejected: 14, avgProcessTime: 2.0 },
			{ month: 'Nov 2025', requests: 312, approved: 298, rejected: 14, avgProcessTime: 1.9 },
			{ month: 'Dec 2025', requests: 295, approved: 282, rejected: 13, avgProcessTime: 2.2 },
			{ month: 'Jan 2026', requests: 324, approved: 310, rejected: 14, avgProcessTime: 1.8 }
		],
		userActivity: [
			{ program: 'Culinary Arts', activeUsers: 45, totalRequests: 387, avgPerUser: 8.6 },
			{ program: 'Food & Beverage', activeUsers: 38, totalRequests: 312, avgPerUser: 8.2 },
			{ program: 'Baking & Pastry', activeUsers: 32, totalRequests: 278, avgPerUser: 8.7 },
			{ program: 'Hotel Management', activeUsers: 28, totalRequests: 198, avgPerUser: 7.1 }
		]
	});

	// Sample data for financial summary
	let financialSummary = $state({
		donations: [
			{ month: 'Aug 2025', cash: 35000, items: 8, totalValue: 47000 },
			{ month: 'Sep 2025', cash: 42000, items: 5, totalValue: 51000 },
			{ month: 'Oct 2025', cash: 28000, items: 12, totalValue: 45000 },
			{ month: 'Nov 2025', cash: 55000, items: 6, totalValue: 65000 },
			{ month: 'Dec 2025', cash: 68000, items: 15, totalValue: 89000 },
			{ month: 'Jan 2026', cash: 45000, items: 9, totalValue: 58000 }
		],
		replacementPayments: [
			{ month: 'Aug 2025', collected: 8500, outstanding: 2500, items: 12 },
			{ month: 'Sep 2025', collected: 6800, outstanding: 3200, items: 10 },
			{ month: 'Oct 2025', collected: 9200, outstanding: 1800, items: 14 },
			{ month: 'Nov 2025', collected: 7500, outstanding: 2800, items: 11 },
			{ month: 'Dec 2025', collected: 10200, outstanding: 3500, items: 16 },
			{ month: 'Jan 2026', collected: 8900, outstanding: 2100, items: 13 }
		],
		maintenanceCosts: [
			{ month: 'Aug 2025', preventive: 12000, corrective: 8500, total: 20500 },
			{ month: 'Sep 2025', preventive: 15000, corrective: 6200, total: 21200 },
			{ month: 'Oct 2025', preventive: 13500, corrective: 9800, total: 23300 },
			{ month: 'Nov 2025', preventive: 14000, corrective: 7500, total: 21500 },
			{ month: 'Dec 2025', preventive: 16500, corrective: 11200, total: 27700 },
			{ month: 'Jan 2026', preventive: 15000, corrective: 8200, total: 23200 }
		]
	});

	// Export options
	let exportOptions = $state({
		format: 'csv' as 'csv' | 'excel' | 'pdf',
		dataType: 'inventory' as 'inventory' | 'requests' | 'financial' | 'maintenance' | 'audit' | 'all',
		includeDetails: true,
		includeImages: false
	});

	// Stats
	const totalInventoryValue = $derived(
		inventoryReport.reduce((sum, cat) => sum + cat.totalValue, 0)
	);
	const totalItems = $derived(
		inventoryReport.reduce((sum, cat) => sum + cat.totalItems, 0)
	);
	const avgUtilization = $derived(
		Math.round(inventoryReport.reduce((sum, cat) => sum + cat.utilizationRate, 0) / inventoryReport.length)
	);
	const totalRequests = $derived(
		usageStats.monthlyTrends.reduce((sum, m) => sum + m.requests, 0)
	);
	const totalDonations = $derived(
		financialSummary.donations.reduce((sum, d) => sum + d.totalValue, 0)
	);
	const totalMaintenanceCost = $derived(
		financialSummary.maintenanceCosts.reduce((sum, m) => sum + m.total, 0)
	);

	function generateReport() {
		alert(`Generating ${activeTab} report for ${dateRange.start} to ${dateRange.end}...`);
	}

	function exportData() {
		if (!exportOptions.dataType) {
			alert('Please select data type to export');
			return;
		}
		alert(`Exporting ${exportOptions.dataType} data as ${exportOptions.format.toUpperCase()}...`);
	}

	function printReport() {
		alert('Printing current report...');
	}

	function scheduleReport() {
		alert('Schedule automated report generation...');
	}

	function getUtilizationColor(rate: number) {
		if (rate >= 90) return 'text-green-600';
		if (rate >= 75) return 'text-blue-600';
		if (rate >= 60) return 'text-yellow-600';
		return 'text-red-600';
	}

	function getUtilizationBg(rate: number) {
		if (rate >= 90) return 'bg-green-500';
		if (rate >= 75) return 'bg-blue-500';
		if (rate >= 60) return 'bg-yellow-500';
		return 'bg-red-500';
	}
</script>

<div class="p-6">
	<!-- Header -->
	<div class="mb-6">
		<div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
			<div>
				<h1 class="text-3xl font-bold text-gray-900">Reports & Analytics</h1>
				<p class="text-gray-600 mt-1">Comprehensive insights and data analysis for informed decision-making</p>
			</div>
			<div class="flex flex-col sm:flex-row gap-2">
				<button
					onclick={printReport}
					class="bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 font-medium py-2 px-4 rounded-md transition-colors text-sm"
				>
					<svg class="w-4 h-4 inline mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"></path>
					</svg>
					Print
				</button>
				<button
					onclick={scheduleReport}
					class="bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 font-medium py-2 px-4 rounded-md transition-colors text-sm"
				>
					<svg class="w-4 h-4 inline mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
					</svg>
					Schedule
				</button>
				<button
					onclick={generateReport}
					class="bg-emerald-600 hover:bg-emerald-700 text-white font-medium py-2 px-4 rounded-md transition-colors text-sm"
				>
					<svg class="w-4 h-4 inline mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path>
					</svg>
					Generate Report
				</button>
			</div>
		</div>
	</div>

	<!-- Date Range Filter -->
	<div class="bg-white rounded-lg shadow p-4 mb-6">
		<div class="flex flex-col sm:flex-row items-start sm:items-center gap-4">
			<label class="text-sm font-medium text-gray-700">Report Period:</label>
			<div class="flex items-center gap-2">
				<input
					type="date"
					bind:value={dateRange.start}
					class="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
				/>
				<span class="text-gray-500">to</span>
				<input
					type="date"
					bind:value={dateRange.end}
					class="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
				/>
			</div>
		</div>
	</div>

	<!-- Stats Overview -->
	<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
		<div class="bg-white rounded-lg shadow p-6">
			<div class="flex items-center justify-between">
				<div>
					<p class="text-sm font-medium text-gray-600">Total Inventory Value</p>
					<p class="text-2xl font-bold text-emerald-600">₱{totalInventoryValue.toLocaleString()}</p>
					<p class="text-xs text-gray-500 mt-1">{totalItems} items</p>
				</div>
				<div class="bg-emerald-100 p-3 rounded-full">
					<svg class="w-6 h-6 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"></path>
					</svg>
				</div>
			</div>
		</div>

		<div class="bg-white rounded-lg shadow p-6">
			<div class="flex items-center justify-between">
				<div>
					<p class="text-sm font-medium text-gray-600">Avg Utilization Rate</p>
					<p class="text-2xl font-bold text-blue-600">{avgUtilization}%</p>
					<p class="text-xs text-gray-500 mt-1">Across all categories</p>
				</div>
				<div class="bg-blue-100 p-3 rounded-full">
					<svg class="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"></path>
					</svg>
				</div>
			</div>
		</div>

		<div class="bg-white rounded-lg shadow p-6">
			<div class="flex items-center justify-between">
				<div>
					<p class="text-sm font-medium text-gray-600">Total Requests (6mo)</p>
					<p class="text-2xl font-bold text-purple-600">{totalRequests.toLocaleString()}</p>
					<p class="text-xs text-gray-500 mt-1">Aug 2025 - Jan 2026</p>
				</div>
				<div class="bg-purple-100 p-3 rounded-full">
					<svg class="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"></path>
					</svg>
				</div>
			</div>
		</div>

		<div class="bg-white rounded-lg shadow p-6">
			<div class="flex items-center justify-between">
				<div>
					<p class="text-sm font-medium text-gray-600">Total Donations (6mo)</p>
					<p class="text-2xl font-bold text-green-600">₱{totalDonations.toLocaleString()}</p>
					<p class="text-xs text-gray-500 mt-1">Cash & items</p>
				</div>
				<div class="bg-green-100 p-3 rounded-full">
					<svg class="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
					</svg>
				</div>
			</div>
		</div>
	</div>

	<!-- Tabs Navigation -->
	<div class="bg-white rounded-lg shadow mb-6">
		<div class="border-b border-gray-200">
			<nav class="flex -mb-px overflow-x-auto" aria-label="Tabs">
				<button
					onclick={() => (activeTab = 'inventory')}
					class="whitespace-nowrap py-4 px-6 border-b-2 font-medium text-sm {activeTab === 'inventory'
						? 'border-emerald-500 text-emerald-600'
						: 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}"
				>
					Inventory Reports
				</button>
				<button
					onclick={() => (activeTab = 'usage')}
					class="whitespace-nowrap py-4 px-6 border-b-2 font-medium text-sm {activeTab === 'usage'
						? 'border-emerald-500 text-emerald-600'
						: 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}"
				>
					Usage Statistics
				</button>
				<button
					onclick={() => (activeTab = 'financial')}
					class="whitespace-nowrap py-4 px-6 border-b-2 font-medium text-sm {activeTab === 'financial'
						? 'border-emerald-500 text-emerald-600'
						: 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}"
				>
					Financial Summary
				</button>
				<button
					onclick={() => (activeTab = 'export')}
					class="whitespace-nowrap py-4 px-6 border-b-2 font-medium text-sm {activeTab === 'export'
						? 'border-emerald-500 text-emerald-600'
						: 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}"
				>
					Export Data
				</button>
			</nav>
		</div>

		<div class="p-6">
			<!-- Inventory Reports Tab -->
			{#if activeTab === 'inventory'}
				<div class="space-y-6">
					<div>
						<h3 class="text-lg font-semibold text-gray-900 mb-4">Inventory Summary by Category</h3>
						<div class="overflow-x-auto">
							<table class="min-w-full divide-y divide-gray-200">
								<thead class="bg-gray-50">
									<tr>
										<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Category</th>
										<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total Items</th>
										<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Item Types</th>
										<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total Value</th>
										<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Good</th>
										<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Needs Repair</th>
										<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Damaged</th>
										<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Utilization</th>
									</tr>
								</thead>
								<tbody class="bg-white divide-y divide-gray-200">
									{#each inventoryReport as category}
										<tr class="hover:bg-gray-50">
											<td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{category.category}</td>
											<td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{category.totalItems}</td>
											<td class="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{category.itemTypes}</td>
											<td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">₱{category.totalValue.toLocaleString()}</td>
											<td class="px-6 py-4 whitespace-nowrap text-sm text-green-600">{category.condition.good}</td>
											<td class="px-6 py-4 whitespace-nowrap text-sm text-yellow-600">{category.condition.needsRepair}</td>
											<td class="px-6 py-4 whitespace-nowrap text-sm text-red-600">{category.condition.damaged}</td>
											<td class="px-6 py-4 whitespace-nowrap text-sm">
												<div class="flex items-center">
													<div class="flex-1 bg-gray-200 rounded-full h-2 mr-2">
														<div class="{getUtilizationBg(category.utilizationRate)} h-2 rounded-full" style="width: {category.utilizationRate}%"></div>
													</div>
													<span class="font-medium {getUtilizationColor(category.utilizationRate)}">{category.utilizationRate}%</span>
												</div>
											</td>
										</tr>
									{/each}
									<tr class="bg-gray-50 font-bold">
										<td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">TOTAL</td>
										<td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{totalItems}</td>
										<td class="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{inventoryReport.reduce((sum, cat) => sum + cat.itemTypes, 0)}</td>
										<td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">₱{totalInventoryValue.toLocaleString()}</td>
										<td class="px-6 py-4 whitespace-nowrap text-sm text-green-600">{inventoryReport.reduce((sum, cat) => sum + cat.condition.good, 0)}</td>
										<td class="px-6 py-4 whitespace-nowrap text-sm text-yellow-600">{inventoryReport.reduce((sum, cat) => sum + cat.condition.needsRepair, 0)}</td>
										<td class="px-6 py-4 whitespace-nowrap text-sm text-red-600">{inventoryReport.reduce((sum, cat) => sum + cat.condition.damaged, 0)}</td>
										<td class="px-6 py-4 whitespace-nowrap text-sm text-blue-600">{avgUtilization}%</td>
									</tr>
								</tbody>
							</table>
						</div>
					</div>

					<!-- Insights -->
					<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
						<div class="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
							<div class="flex items-start">
								<svg class="w-5 h-5 text-yellow-600 mt-0.5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path>
								</svg>
								<div>
									<p class="text-sm font-medium text-yellow-900">Attention Needed</p>
									<p class="text-sm text-yellow-700 mt-1">{inventoryReport.reduce((sum, cat) => sum + cat.condition.needsRepair, 0)} items need repair across all categories</p>
								</div>
							</div>
						</div>
						<div class="bg-green-50 border border-green-200 rounded-lg p-4">
							<div class="flex items-start">
								<svg class="w-5 h-5 text-green-600 mt-0.5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
								</svg>
								<div>
									<p class="text-sm font-medium text-green-900">High Performance</p>
									<p class="text-sm text-green-700 mt-1">Utensils category shows highest utilization at 94%</p>
								</div>
							</div>
						</div>
					</div>
				</div>
			{/if}

			<!-- Usage Statistics Tab -->
			{#if activeTab === 'usage'}
				<div class="space-y-6">
					<!-- Top Borrowed Items -->
					<div>
						<h3 class="text-lg font-semibold text-gray-900 mb-4">Most Frequently Borrowed Items</h3>
						<div class="overflow-x-auto">
							<table class="min-w-full divide-y divide-gray-200">
								<thead class="bg-gray-50">
									<tr>
										<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Rank</th>
										<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Item</th>
										<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Category</th>
										<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Times Loaned</th>
										<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Currently Out</th>
										<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Avg Duration (days)</th>
									</tr>
								</thead>
								<tbody class="bg-white divide-y divide-gray-200">
									{#each usageStats.topBorrowedItems as item, index}
										<tr class="hover:bg-gray-50">
											<td class="px-6 py-4 whitespace-nowrap text-sm">
												{#if index === 0}
													<span class="inline-flex items-center justify-center w-8 h-8 rounded-full bg-yellow-100 text-yellow-800 font-bold">🥇</span>
												{:else if index === 1}
													<span class="inline-flex items-center justify-center w-8 h-8 rounded-full bg-gray-200 text-gray-700 font-bold">🥈</span>
												{:else if index === 2}
													<span class="inline-flex items-center justify-center w-8 h-8 rounded-full bg-orange-100 text-orange-700 font-bold">🥉</span>
												{:else}
													<span class="text-gray-500 font-medium">#{index + 1}</span>
												{/if}
											</td>
											<td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{item.name}</td>
											<td class="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{item.category}</td>
											<td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-medium">{item.timesLoaned}</td>
											<td class="px-6 py-4 whitespace-nowrap text-sm text-blue-600">{item.currentlyOut}</td>
											<td class="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{item.avgDuration}</td>
										</tr>
									{/each}
								</tbody>
							</table>
						</div>
					</div>

					<!-- Monthly Trends -->
					<div>
						<h3 class="text-lg font-semibold text-gray-900 mb-4">6-Month Request Trends</h3>
						<div class="overflow-x-auto">
							<table class="min-w-full divide-y divide-gray-200">
								<thead class="bg-gray-50">
									<tr>
										<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Month</th>
										<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total Requests</th>
										<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Approved</th>
										<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Rejected</th>
										<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Approval Rate</th>
										<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Avg Process Time (days)</th>
									</tr>
								</thead>
								<tbody class="bg-white divide-y divide-gray-200">
									{#each usageStats.monthlyTrends as month}
										<tr class="hover:bg-gray-50">
											<td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{month.month}</td>
											<td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{month.requests}</td>
											<td class="px-6 py-4 whitespace-nowrap text-sm text-green-600">{month.approved}</td>
											<td class="px-6 py-4 whitespace-nowrap text-sm text-red-600">{month.rejected}</td>
											<td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-blue-600">{Math.round((month.approved / month.requests) * 100)}%</td>
											<td class="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{month.avgProcessTime}</td>
										</tr>
									{/each}
								</tbody>
							</table>
						</div>
					</div>

					<!-- User Activity by Program -->
					<div>
						<h3 class="text-lg font-semibold text-gray-900 mb-4">Usage by Program</h3>
						<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
							{#each usageStats.userActivity as program}
								<div class="bg-white border border-gray-200 rounded-lg p-4">
									<div class="flex justify-between items-start mb-3">
										<div>
											<h4 class="font-medium text-gray-900">{program.program}</h4>
											<p class="text-sm text-gray-500">{program.activeUsers} active users</p>
										</div>
										<span class="bg-emerald-100 text-emerald-800 text-xs font-medium px-2.5 py-1 rounded">
											{program.avgPerUser} avg/user
										</span>
									</div>
									<div class="flex items-baseline gap-2">
										<span class="text-2xl font-bold text-gray-900">{program.totalRequests}</span>
										<span class="text-sm text-gray-500">total requests</span>
									</div>
								</div>
							{/each}
						</div>
					</div>
				</div>
			{/if}

			<!-- Financial Summary Tab -->
			{#if activeTab === 'financial'}
				<div class="space-y-6">
					<!-- Donations Trend -->
					<div>
						<h3 class="text-lg font-semibold text-gray-900 mb-4">Donations Overview (6 Months)</h3>
						<div class="overflow-x-auto">
							<table class="min-w-full divide-y divide-gray-200">
								<thead class="bg-gray-50">
									<tr>
										<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Month</th>
										<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Cash Donations</th>
										<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Item Donations</th>
										<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total Value</th>
									</tr>
								</thead>
								<tbody class="bg-white divide-y divide-gray-200">
									{#each financialSummary.donations as donation}
										<tr class="hover:bg-gray-50">
											<td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{donation.month}</td>
											<td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">₱{donation.cash.toLocaleString()}</td>
											<td class="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{donation.items} items</td>
											<td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-emerald-600">₱{donation.totalValue.toLocaleString()}</td>
										</tr>
									{/each}
									<tr class="bg-gray-50 font-bold">
										<td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">TOTAL</td>
										<td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">₱{financialSummary.donations.reduce((sum, d) => sum + d.cash, 0).toLocaleString()}</td>
										<td class="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{financialSummary.donations.reduce((sum, d) => sum + d.items, 0)} items</td>
										<td class="px-6 py-4 whitespace-nowrap text-sm text-emerald-600">₱{totalDonations.toLocaleString()}</td>
									</tr>
								</tbody>
							</table>
						</div>
					</div>

					<!-- Replacement Payments -->
					<div>
						<h3 class="text-lg font-semibold text-gray-900 mb-4">Replacement Payment Collections</h3>
						<div class="overflow-x-auto">
							<table class="min-w-full divide-y divide-gray-200">
								<thead class="bg-gray-50">
									<tr>
										<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Month</th>
										<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Collected</th>
										<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Outstanding</th>
										<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Items Involved</th>
										<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Collection Rate</th>
									</tr>
								</thead>
								<tbody class="bg-white divide-y divide-gray-200">
									{#each financialSummary.replacementPayments as payment}
										<tr class="hover:bg-gray-50">
											<td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{payment.month}</td>
											<td class="px-6 py-4 whitespace-nowrap text-sm text-green-600">₱{payment.collected.toLocaleString()}</td>
											<td class="px-6 py-4 whitespace-nowrap text-sm text-orange-600">₱{payment.outstanding.toLocaleString()}</td>
											<td class="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{payment.items}</td>
											<td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-blue-600">
												{Math.round((payment.collected / (payment.collected + payment.outstanding)) * 100)}%
											</td>
										</tr>
									{/each}
									<tr class="bg-gray-50 font-bold">
										<td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">TOTAL</td>
										<td class="px-6 py-4 whitespace-nowrap text-sm text-green-600">₱{financialSummary.replacementPayments.reduce((sum, p) => sum + p.collected, 0).toLocaleString()}</td>
										<td class="px-6 py-4 whitespace-nowrap text-sm text-orange-600">₱{financialSummary.replacementPayments.reduce((sum, p) => sum + p.outstanding, 0).toLocaleString()}</td>
										<td class="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{financialSummary.replacementPayments.reduce((sum, p) => sum + p.items, 0)}</td>
										<td class="px-6 py-4 whitespace-nowrap text-sm text-blue-600">-</td>
									</tr>
								</tbody>
							</table>
						</div>
					</div>

					<!-- Maintenance Costs -->
					<div>
						<h3 class="text-lg font-semibold text-gray-900 mb-4">Maintenance Cost Analysis</h3>
						<div class="overflow-x-auto">
							<table class="min-w-full divide-y divide-gray-200">
								<thead class="bg-gray-50">
									<tr>
										<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Month</th>
										<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Preventive</th>
										<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Corrective</th>
										<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total Cost</th>
										<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Preventive %</th>
									</tr>
								</thead>
								<tbody class="bg-white divide-y divide-gray-200">
									{#each financialSummary.maintenanceCosts as cost}
										<tr class="hover:bg-gray-50">
											<td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{cost.month}</td>
											<td class="px-6 py-4 whitespace-nowrap text-sm text-blue-600">₱{cost.preventive.toLocaleString()}</td>
											<td class="px-6 py-4 whitespace-nowrap text-sm text-orange-600">₱{cost.corrective.toLocaleString()}</td>
											<td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">₱{cost.total.toLocaleString()}</td>
											<td class="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
												{Math.round((cost.preventive / cost.total) * 100)}%
											</td>
										</tr>
									{/each}
									<tr class="bg-gray-50 font-bold">
										<td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">TOTAL</td>
										<td class="px-6 py-4 whitespace-nowrap text-sm text-blue-600">₱{financialSummary.maintenanceCosts.reduce((sum, c) => sum + c.preventive, 0).toLocaleString()}</td>
										<td class="px-6 py-4 whitespace-nowrap text-sm text-orange-600">₱{financialSummary.maintenanceCosts.reduce((sum, c) => sum + c.corrective, 0).toLocaleString()}</td>
										<td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">₱{totalMaintenanceCost.toLocaleString()}</td>
										<td class="px-6 py-4 whitespace-nowrap text-sm text-gray-600">-</td>
									</tr>
								</tbody>
							</table>
						</div>
					</div>

					<!-- Financial Insights -->
					<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
						<div class="bg-blue-50 border border-blue-200 rounded-lg p-4">
							<div class="flex items-start">
								<svg class="w-5 h-5 text-blue-600 mt-0.5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
								</svg>
								<div>
									<p class="text-sm font-medium text-blue-900">Maintenance Strategy</p>
									<p class="text-sm text-blue-700 mt-1">65% of maintenance costs are preventive, indicating good proactive management</p>
								</div>
							</div>
						</div>
						<div class="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
							<div class="flex items-start">
								<svg class="w-5 h-5 text-emerald-600 mt-0.5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"></path>
								</svg>
								<div>
									<p class="text-sm font-medium text-emerald-900">Positive Trend</p>
									<p class="text-sm text-emerald-700 mt-1">Donations increased by 45% from August to December 2025</p>
								</div>
							</div>
						</div>
					</div>
				</div>
			{/if}

			<!-- Export Data Tab -->
			{#if activeTab === 'export'}
				<div class="space-y-6">
					<div class="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
						<div class="flex items-start">
							<svg class="w-5 h-5 text-blue-600 mt-0.5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
							</svg>
							<div>
								<p class="text-sm font-medium text-blue-900">Export Information</p>
								<p class="text-sm text-blue-700 mt-1">Select your preferred format and data type to export. Exported data will include records within the selected date range.</p>
							</div>
						</div>
					</div>

					<div class="bg-white border border-gray-200 rounded-lg p-6">
						<h3 class="text-lg font-semibold text-gray-900 mb-6">Export Configuration</h3>

						<div class="space-y-6">
							<!-- Data Type Selection -->
							<div>
								<label class="block text-sm font-medium text-gray-700 mb-3">Select Data Type to Export</label>
								<div class="grid grid-cols-1 md:grid-cols-2 gap-3">
									<label class="flex items-center p-4 border-2 rounded-lg cursor-pointer transition-colors {exportOptions.dataType === 'inventory' ? 'border-emerald-500 bg-emerald-50' : 'border-gray-200 hover:border-gray-300'}">
										<input
											type="radio"
											bind:group={exportOptions.dataType}
											value="inventory"
											class="text-emerald-600 focus:ring-emerald-500"
										/>
										<div class="ml-3">
											<p class="font-medium text-gray-900">Inventory Data</p>
											<p class="text-sm text-gray-500">All items, categories, and stock levels</p>
										</div>
									</label>

									<label class="flex items-center p-4 border-2 rounded-lg cursor-pointer transition-colors {exportOptions.dataType === 'requests' ? 'border-emerald-500 bg-emerald-50' : 'border-gray-200 hover:border-gray-300'}">
										<input
											type="radio"
											bind:group={exportOptions.dataType}
											value="requests"
											class="text-emerald-600 focus:ring-emerald-500"
										/>
										<div class="ml-3">
											<p class="font-medium text-gray-900">Requests & Loans</p>
											<p class="text-sm text-gray-500">Borrowing history and active loans</p>
										</div>
									</label>

									<label class="flex items-center p-4 border-2 rounded-lg cursor-pointer transition-colors {exportOptions.dataType === 'financial' ? 'border-emerald-500 bg-emerald-50' : 'border-gray-200 hover:border-gray-300'}">
										<input
											type="radio"
											bind:group={exportOptions.dataType}
											value="financial"
											class="text-emerald-600 focus:ring-emerald-500"
										/>
										<div class="ml-3">
											<p class="font-medium text-gray-900">Financial Records</p>
											<p class="text-sm text-gray-500">Donations and payment history</p>
										</div>
									</label>

									<label class="flex items-center p-4 border-2 rounded-lg cursor-pointer transition-colors {exportOptions.dataType === 'maintenance' ? 'border-emerald-500 bg-emerald-50' : 'border-gray-200 hover:border-gray-300'}">
										<input
											type="radio"
											bind:group={exportOptions.dataType}
											value="maintenance"
											class="text-emerald-600 focus:ring-emerald-500"
										/>
										<div class="ml-3">
											<p class="font-medium text-gray-900">Maintenance Log</p>
											<p class="text-sm text-gray-500">All maintenance activities and costs</p>
										</div>
									</label>

									<label class="flex items-center p-4 border-2 rounded-lg cursor-pointer transition-colors {exportOptions.dataType === 'audit' ? 'border-emerald-500 bg-emerald-50' : 'border-gray-200 hover:border-gray-300'}">
										<input
											type="radio"
											bind:group={exportOptions.dataType}
											value="audit"
											class="text-emerald-600 focus:ring-emerald-500"
										/>
										<div class="ml-3">
											<p class="font-medium text-gray-900">Audit Trail</p>
											<p class="text-sm text-gray-500">System activity logs</p>
										</div>
									</label>

									<label class="flex items-center p-4 border-2 rounded-lg cursor-pointer transition-colors {exportOptions.dataType === 'all' ? 'border-emerald-500 bg-emerald-50' : 'border-gray-200 hover:border-gray-300'}">
										<input
											type="radio"
											bind:group={exportOptions.dataType}
											value="all"
											class="text-emerald-600 focus:ring-emerald-500"
										/>
										<div class="ml-3">
											<p class="font-medium text-gray-900">Complete Export</p>
											<p class="text-sm text-gray-500">All data in separate files</p>
										</div>
									</label>
								</div>
							</div>

							<!-- Format Selection -->
							<div>
								<label class="block text-sm font-medium text-gray-700 mb-3">Export Format</label>
								<div class="flex gap-3">
									<label class="flex items-center px-4 py-3 border-2 rounded-lg cursor-pointer transition-colors {exportOptions.format === 'csv' ? 'border-emerald-500 bg-emerald-50' : 'border-gray-200 hover:border-gray-300'}">
										<input
											type="radio"
											bind:group={exportOptions.format}
											value="csv"
											class="text-emerald-600 focus:ring-emerald-500"
										/>
										<span class="ml-2 font-medium text-gray-900">CSV</span>
									</label>

									<label class="flex items-center px-4 py-3 border-2 rounded-lg cursor-pointer transition-colors {exportOptions.format === 'excel' ? 'border-emerald-500 bg-emerald-50' : 'border-gray-200 hover:border-gray-300'}">
										<input
											type="radio"
											bind:group={exportOptions.format}
											value="excel"
											class="text-emerald-600 focus:ring-emerald-500"
										/>
										<span class="ml-2 font-medium text-gray-900">Excel (.xlsx)</span>
									</label>

									<label class="flex items-center px-4 py-3 border-2 rounded-lg cursor-pointer transition-colors {exportOptions.format === 'pdf' ? 'border-emerald-500 bg-emerald-50' : 'border-gray-200 hover:border-gray-300'}">
										<input
											type="radio"
											bind:group={exportOptions.format}
											value="pdf"
											class="text-emerald-600 focus:ring-emerald-500"
										/>
										<span class="ml-2 font-medium text-gray-900">PDF</span>
									</label>
								</div>
							</div>

							<!-- Additional Options -->
							<div>
								<label class="block text-sm font-medium text-gray-700 mb-3">Additional Options</label>
								<div class="space-y-2">
									<label class="flex items-center">
										<input
											type="checkbox"
											bind:checked={exportOptions.includeDetails}
											class="rounded text-emerald-600 focus:ring-emerald-500"
										/>
										<span class="ml-2 text-sm text-gray-700">Include detailed descriptions and notes</span>
									</label>
									<label class="flex items-center">
										<input
											type="checkbox"
											bind:checked={exportOptions.includeImages}
											class="rounded text-emerald-600 focus:ring-emerald-500"
										/>
										<span class="ml-2 text-sm text-gray-700">Include item images (increases file size)</span>
									</label>
								</div>
							</div>

							<!-- Export Summary -->
							<div class="bg-gray-50 border border-gray-200 rounded-lg p-4">
								<h4 class="font-medium text-gray-900 mb-2">Export Summary</h4>
								<div class="space-y-1 text-sm text-gray-600">
									<p><span class="font-medium">Data Type:</span> {exportOptions.dataType === 'all' ? 'All Data' : exportOptions.dataType.charAt(0).toUpperCase() + exportOptions.dataType.slice(1)}</p>
									<p><span class="font-medium">Format:</span> {exportOptions.format.toUpperCase()}</p>
									<p><span class="font-medium">Date Range:</span> {dateRange.start} to {dateRange.end}</p>
									<p><span class="font-medium">Options:</span> 
										{exportOptions.includeDetails ? 'Detailed' : 'Summary'}
										{exportOptions.includeImages ? ', With Images' : ''}
									</p>
								</div>
							</div>

							<!-- Export Button -->
							<div class="flex justify-end gap-3">
								<button
									onclick={() => {
										exportOptions = {
											format: 'csv',
											dataType: 'inventory',
											includeDetails: true,
											includeImages: false
										};
									}}
									class="px-6 py-2 border border-gray-300 rounded-md text-gray-700 font-medium hover:bg-gray-50 transition-colors"
								>
									Reset
								</button>
								<button
									onclick={exportData}
									class="bg-emerald-600 hover:bg-emerald-700 text-white font-medium py-2 px-8 rounded-md transition-colors flex items-center gap-2"
								>
									<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path>
									</svg>
									Export Data
								</button>
							</div>
						</div>
					</div>

					<!-- Quick Export Presets -->
					<div>
						<h3 class="text-lg font-semibold text-gray-900 mb-4">Quick Export Presets</h3>
						<div class="grid grid-cols-1 md:grid-cols-3 gap-4">
							<button
								onclick={() => {
									exportOptions.dataType = 'inventory';
									exportOptions.format = 'excel';
									exportData();
								}}
								class="p-4 border-2 border-gray-200 rounded-lg hover:border-emerald-500 hover:bg-emerald-50 transition-colors text-left"
							>
								<div class="flex items-center justify-between mb-2">
									<svg class="w-8 h-8 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"></path>
									</svg>
								</div>
								<p class="font-medium text-gray-900">Current Inventory</p>
								<p class="text-sm text-gray-500 mt-1">Excel format with all items</p>
							</button>

							<button
								onclick={() => {
									exportOptions.dataType = 'financial';
									exportOptions.format = 'pdf';
									exportData();
								}}
								class="p-4 border-2 border-gray-200 rounded-lg hover:border-emerald-500 hover:bg-emerald-50 transition-colors text-left"
							>
								<div class="flex items-center justify-between mb-2">
									<svg class="w-8 h-8 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
									</svg>
								</div>
								<p class="font-medium text-gray-900">Financial Report</p>
								<p class="text-sm text-gray-500 mt-1">PDF summary for records</p>
							</button>

							<button
								onclick={() => {
									exportOptions.dataType = 'all';
									exportOptions.format = 'csv';
									exportData();
								}}
								class="p-4 border-2 border-gray-200 rounded-lg hover:border-emerald-500 hover:bg-emerald-50 transition-colors text-left"
							>
								<div class="flex items-center justify-between mb-2">
									<svg class="w-8 h-8 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4"></path>
									</svg>
								</div>
								<p class="font-medium text-gray-900">Complete Backup</p>
								<p class="text-sm text-gray-500 mt-1">All data in CSV format</p>
							</button>
						</div>
					</div>
				</div>
			{/if}
		</div>
	</div>
</div>
