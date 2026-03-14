<script lang="ts">
	import { onMount } from 'svelte';
	import {
		financialObligationsAPI,
		type FinancialObligation,
		type ObligationStatus,
		type ObligationType
	} from '$lib/api/financialObligations';

	let activeTab = $state<'overview' | 'students' | 'equipment' | 'issues'>('overview');
	let dateRange = $state('semester');
	let obligations = $state<FinancialObligation[]>([]);
	let issuesLoading = $state(true);
	let issuesError = $state<string | null>(null);
	
	// Mock data
	const approvalMetrics = {
		totalReviewed: 156,
		approvalRate: 92,
		avgApprovalTime: 4.2,
		pendingAging: 3,
		rejectedBreakdown: [
			{ reason: 'Item unavailable', count: 8 },
			{ reason: 'Duration too long', count: 4 },
			{ reason: 'Student inexperienced', count: 3 }
		]
	};
	
	const performanceIndicators = {
		approvalSpeed: 'Top 15%',
		satisfactionScore: 4.7,
		responseTimeTrend: '+12%'
	};
	
	const topBorrowers = [
		{ name: 'John Doe', section: 'CULN 301-A', requests: 24, returnRate: 100 },
		{ name: 'Jane Smith', section: 'CULN 201-B', requests: 18, returnRate: 100 },
		{ name: 'Mike Johnson', section: 'CULN 301-A', requests: 15, returnRate: 93 }
	];
	
	const topEquipment = [
		{ name: 'Chef Knife Set', requests: 45, availability: 89 },
		{ name: 'Mixing Bowls', requests: 38, availability: 95 },
		{ name: 'Digital Scale', requests: 32, availability: 78 }
	];

	function formatDate(value: string): string {
		const date = new Date(value);
		if (Number.isNaN(date.getTime())) return value;
		return date.toLocaleDateString();
	}

	function formatMoney(value: number): string {
		return `PHP ${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
	}

	function getTypeBadgeClass(type: ObligationType): string {
		return type === 'missing'
			? 'bg-red-100 text-red-800 ring-red-200'
			: 'bg-rose-100 text-rose-800 ring-rose-200';
	}

	function getStatusBadgeClass(status: ObligationStatus): string {
		switch (status) {
			case 'pending':
				return 'bg-amber-100 text-amber-800 ring-amber-200';
			case 'paid':
				return 'bg-emerald-100 text-emerald-800 ring-emerald-200';
			case 'replaced':
				return 'bg-cyan-100 text-cyan-800 ring-cyan-200';
			case 'waived':
				return 'bg-slate-100 text-slate-800 ring-slate-200';
		}
	}

	function toStatusLabel(status: ObligationStatus): string {
		switch (status) {
			case 'pending':
				return 'Pending';
			case 'paid':
				return 'Paid';
			case 'replaced':
				return 'Replaced';
			case 'waived':
				return 'Waived';
		}
	}

	async function loadIssueCases(): Promise<void> {
		issuesLoading = true;
		issuesError = null;
		try {
			const response = await financialObligationsAPI.getObligations({ limit: 200 });
			obligations = response.obligations;
		} catch (error) {
			issuesError = error instanceof Error ? error.message : 'Failed to load issue case analytics.';
			obligations = [];
		} finally {
			issuesLoading = false;
		}
	}

	const issueMetrics = $derived({
		total: obligations.length,
		pending: obligations.filter((obligation) => obligation.status === 'pending').length,
		missing: obligations.filter((obligation) => obligation.type === 'missing').length,
		damaged: obligations.filter((obligation) => obligation.type === 'damaged').length
	});

	const topIssueStudents = $derived.by(() => {
		const counts = new Map<string, { studentName: string; count: number }>();
		for (const obligation of obligations) {
			const key = obligation.studentId;
			const entry = counts.get(key) || { studentName: obligation.studentName || 'Student', count: 0 };
			entry.count += 1;
			counts.set(key, entry);
		}
		return [...counts.values()].sort((a, b) => b.count - a.count).slice(0, 5);
	});

	onMount(() => {
		void loadIssueCases();
	});
</script>

<svelte:head>
	<title>Reports & Analytics - Instructor Portal</title>
</svelte:head>

<div class="space-y-6">
	<!-- Page Header -->
	<div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
		<div>
			<h1 class="text-2xl font-bold text-gray-900 sm:text-3xl">Reports & Analytics</h1>
			<p class="mt-1 text-sm text-gray-500">Insights into equipment usage and student behavior</p>
		</div>
		<div class="flex gap-2">
			<select bind:value={dateRange} class="rounded-lg border border-gray-300 px-4 py-2 text-sm focus:border-pink-500 focus:ring-pink-500">
				<option value="week">This Week</option>
				<option value="month">This Month</option>
				<option value="semester">This Semester</option>
				<option value="year">This Year</option>
			</select>
			<button class="inline-flex items-center rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
				<svg class="mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
				</svg>
				Export Report
			</button>
		</div>
	</div>
	
	<!-- Tabs -->
	<div class="border-b border-gray-200">
		<nav class="-mb-px flex space-x-8">
			<button
				onclick={() => activeTab = 'overview'}
				class="border-b-2 px-1 py-4 text-sm font-medium {activeTab === 'overview' ? 'border-pink-500 text-pink-600' : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'}"
			>
				My Overview
			</button>
			<button
				onclick={() => activeTab = 'students'}
				class="border-b-2 px-1 py-4 text-sm font-medium {activeTab === 'students' ? 'border-pink-500 text-pink-600' : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'}"
			>
				Student Activity
			</button>
			<button
				onclick={() => activeTab = 'equipment'}
				class="border-b-2 px-1 py-4 text-sm font-medium {activeTab === 'equipment' ? 'border-pink-500 text-pink-600' : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'}"
			>
				Equipment Insights
			</button>
			<button
				onclick={() => activeTab = 'issues'}
				class="border-b-2 px-1 py-4 text-sm font-medium {activeTab === 'issues' ? 'border-pink-500 text-pink-600' : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'}"
			>
				Issue Cases
			</button>
		</nav>
	</div>
	
	<!-- My Overview Tab -->
	{#if activeTab === 'overview'}
		<div class="space-y-6">
			<!-- Approval Metrics -->
			<div>
				<h2 class="text-lg font-semibold text-gray-900 mb-4">Approval Metrics</h2>
				<div class="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
					<div class="rounded-lg bg-white px-4 py-5 shadow sm:p-6">
						<dt>
							<div class="absolute rounded-md bg-blue-500 p-3">
								<svg class="h-6 w-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
								</svg>
							</div>
							<p class="ml-16 truncate text-sm font-medium text-gray-500">Total Reviewed</p>
						</dt>
						<dd class="ml-16 flex items-baseline">
							<p class="text-2xl font-semibold text-gray-900">{approvalMetrics.totalReviewed}</p>
							<p class="ml-2 text-sm text-gray-600">this semester</p>
						</dd>
					</div>
					
					<div class="rounded-lg bg-white px-4 py-5 shadow sm:p-6">
						<dt>
							<div class="absolute rounded-md bg-green-500 p-3">
								<svg class="h-6 w-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
								</svg>
							</div>
							<p class="ml-16 truncate text-sm font-medium text-gray-500">Approval Rate</p>
						</dt>
						<dd class="ml-16 flex items-baseline">
							<p class="text-2xl font-semibold text-gray-900">{approvalMetrics.approvalRate}%</p>
						</dd>
					</div>
					
					<div class="rounded-lg bg-white px-4 py-5 shadow sm:p-6">
						<dt>
							<div class="absolute rounded-md bg-purple-500 p-3">
								<svg class="h-6 w-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
								</svg>
							</div>
							<p class="ml-16 truncate text-sm font-medium text-gray-500">Avg Approval Time</p>
						</dt>
						<dd class="ml-16 flex items-baseline">
							<p class="text-2xl font-semibold text-gray-900">{approvalMetrics.avgApprovalTime}</p>
							<p class="ml-2 text-sm text-gray-600">hours</p>
						</dd>
					</div>
					
					<div class="rounded-lg bg-white px-4 py-5 shadow sm:p-6">
						<dt>
							<div class="absolute rounded-md bg-yellow-500 p-3">
								<svg class="h-6 w-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
								</svg>
							</div>
							<p class="ml-16 truncate text-sm font-medium text-gray-500">Pending Aging</p>
						</dt>
						<dd class="ml-16 flex items-baseline">
							<p class="text-2xl font-semibold text-gray-900">{approvalMetrics.pendingAging}</p>
							<p class="ml-2 text-sm text-gray-600">> 24hrs</p>
						</dd>
					</div>
				</div>
			</div>
			
			<!-- Two Column Layout -->
			<div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
				<!-- Rejected Requests Breakdown -->
				<div class="rounded-lg bg-white p-6 shadow">
					<h3 class="text-base font-semibold text-gray-900 mb-4">Rejected Requests Breakdown</h3>
					<div class="space-y-3">
						{#each approvalMetrics.rejectedBreakdown as item}
							<div>
								<div class="flex items-center justify-between text-sm mb-1">
									<span class="text-gray-600">{item.reason}</span>
									<span class="font-semibold text-gray-900">{item.count}</span>
								</div>
								<div class="w-full bg-gray-200 rounded-full h-2">
									<div class="bg-red-600 h-2 rounded-full" style="width: {(item.count / 15) * 100}%"></div>
								</div>
							</div>
						{/each}
					</div>
				</div>
				
				<!-- Performance Indicators -->
				<div class="rounded-lg bg-white p-6 shadow">
					<h3 class="text-base font-semibold text-gray-900 mb-4">Performance Indicators</h3>
					<div class="space-y-4">
						<div class="flex items-center justify-between p-4 rounded-lg bg-blue-50">
							<div>
								<p class="text-sm font-medium text-gray-700">Approval Speed</p>
								<p class="text-xs text-gray-500">vs other instructors</p>
							</div>
							<span class="text-2xl font-bold text-blue-600">{performanceIndicators.approvalSpeed}</span>
						</div>
						<div class="flex items-center justify-between p-4 rounded-lg bg-green-50">
							<div>
								<p class="text-sm font-medium text-gray-700">Satisfaction Score</p>
								<p class="text-xs text-gray-500">student feedback</p>
							</div>
							<div class="flex items-center gap-1">
								<span class="text-2xl font-bold text-green-600">{performanceIndicators.satisfactionScore}</span>
								<svg class="h-5 w-5 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
									<path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/>
								</svg>
							</div>
						</div>
						<div class="flex items-center justify-between p-4 rounded-lg bg-purple-50">
							<div>
								<p class="text-sm font-medium text-gray-700">Response Time Trend</p>
								<p class="text-xs text-gray-500">vs last semester</p>
							</div>
							<span class="text-2xl font-bold text-purple-600">{performanceIndicators.responseTimeTrend}</span>
						</div>
					</div>
				</div>
			</div>
			
			<!-- Workload Calendar Placeholder -->
			<div class="rounded-lg bg-white p-6 shadow">
				<h3 class="text-base font-semibold text-gray-900 mb-4">Workload Calendar</h3>
				<div class="text-center py-12">
					<svg class="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
					</svg>
					<p class="mt-2 text-sm text-gray-500">Approval activity heatmap will be displayed here</p>
				</div>
			</div>
		</div>
	{/if}

	{#if activeTab === 'issues'}
		<div class="space-y-6">
			<div class="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
				<div class="rounded-lg bg-white px-4 py-5 shadow sm:p-6">
					<p class="text-sm font-medium text-gray-500">Total Cases</p>
					<p class="mt-2 text-2xl font-semibold text-gray-900">{issueMetrics.total}</p>
				</div>
				<div class="rounded-lg bg-white px-4 py-5 shadow sm:p-6">
					<p class="text-sm font-medium text-gray-500">Pending</p>
					<p class="mt-2 text-2xl font-semibold text-amber-600">{issueMetrics.pending}</p>
				</div>
				<div class="rounded-lg bg-white px-4 py-5 shadow sm:p-6">
					<p class="text-sm font-medium text-gray-500">Damaged</p>
					<p class="mt-2 text-2xl font-semibold text-rose-600">{issueMetrics.damaged}</p>
				</div>
				<div class="rounded-lg bg-white px-4 py-5 shadow sm:p-6">
					<p class="text-sm font-medium text-gray-500">Missing</p>
					<p class="mt-2 text-2xl font-semibold text-red-600">{issueMetrics.missing}</p>
				</div>
			</div>

			<div class="grid grid-cols-1 gap-6 lg:grid-cols-[1.2fr_0.8fr]">
				<div class="rounded-lg bg-white shadow">
					<div class="border-b border-gray-200 px-6 py-4">
						<h2 class="text-lg font-semibold text-gray-900">Recent Issue Cases</h2>
						<p class="mt-1 text-sm text-gray-500">Damage and missing incidents linked to student borrowing.</p>
					</div>
					{#if issuesLoading}
						<div class="px-6 py-8 text-sm text-gray-500">Loading issue analytics...</div>
					{:else if issuesError}
						<div class="px-6 py-8 text-sm text-red-700">{issuesError}</div>
					{:else if obligations.length === 0}
						<div class="px-6 py-8 text-sm text-gray-500">No issue cases recorded for the selected period.</div>
					{:else}
						<div class="overflow-x-auto">
							<table class="min-w-full divide-y divide-gray-200">
								<thead class="bg-gray-50">
									<tr>
										<th class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Student</th>
										<th class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Item</th>
										<th class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Type</th>
										<th class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Status</th>
										<th class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Balance</th>
									</tr>
								</thead>
								<tbody class="divide-y divide-gray-200 bg-white">
									{#each obligations.slice(0, 10) as obligation}
										<tr>
											<td class="whitespace-nowrap px-6 py-4">
												<div class="text-sm font-medium text-gray-900">{obligation.studentName || 'Student'}</div>
												<div class="text-xs text-gray-500">{formatDate(obligation.incidentDate)}</div>
											</td>
											<td class="px-6 py-4 text-sm text-gray-900">{obligation.itemName}</td>
											<td class="px-6 py-4">
												<span class="inline-flex rounded-full px-2 py-1 text-xs font-semibold ring-1 {getTypeBadgeClass(obligation.type)}">
													{obligation.type === 'missing' ? 'Missing' : 'Damaged'}
												</span>
											</td>
											<td class="px-6 py-4">
												<span class="inline-flex rounded-full px-2 py-1 text-xs font-semibold ring-1 {getStatusBadgeClass(obligation.status)}">
													{toStatusLabel(obligation.status)}
												</span>
											</td>
											<td class="px-6 py-4 text-sm text-gray-700">{formatMoney(obligation.balance)}</td>
										</tr>
									{/each}
								</tbody>
							</table>
						</div>
					{/if}
				</div>

				<div class="rounded-lg bg-white p-6 shadow">
					<h2 class="text-lg font-semibold text-gray-900">Issue Concentration</h2>
					<p class="mt-1 text-sm text-gray-500">Students with the highest number of recorded cases.</p>
					<div class="mt-4 space-y-3">
						{#if topIssueStudents.length === 0}
							<p class="text-sm text-gray-500">No issue concentrations to report.</p>
						{:else}
							{#each topIssueStudents as student}
								<div class="rounded-lg bg-gray-50 px-4 py-3">
									<div class="flex items-center justify-between">
										<p class="text-sm font-medium text-gray-900">{student.studentName}</p>
										<span class="text-sm font-semibold text-rose-700">{student.count}</span>
									</div>
									<p class="mt-1 text-xs text-gray-500">Recorded damage/missing cases</p>
								</div>
							{/each}
						{/if}
					</div>
				</div>
			</div>
		</div>
	{/if}
	
	<!-- Student Activity Tab -->
	{#if activeTab === 'students'}
		<div class="space-y-6">
			<!-- Top Borrowers -->
			<div class="rounded-lg bg-white shadow">
				<div class="border-b border-gray-200 px-6 py-4">
					<h2 class="text-lg font-semibold text-gray-900">Top Borrowers</h2>
					<p class="mt-1 text-sm text-gray-500">Most active students in your classes</p>
				</div>
				<div class="overflow-x-auto">
					<table class="min-w-full divide-y divide-gray-200">
						<thead class="bg-gray-50">
							<tr>
								<th class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Rank</th>
								<th class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Student</th>
								<th class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Section</th>
								<th class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Total Requests</th>
								<th class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Return Rate</th>
								<th class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Status</th>
							</tr>
						</thead>
						<tbody class="divide-y divide-gray-200 bg-white">
							{#each topBorrowers as student, index}
								<tr class="hover:bg-gray-50">
									<td class="whitespace-nowrap px-6 py-4">
										<div class="flex h-8 w-8 items-center justify-center rounded-full {index === 0 ? 'bg-yellow-100 text-yellow-800' : index === 1 ? 'bg-gray-100 text-gray-800' : 'bg-orange-100 text-orange-800'} font-semibold text-sm">
											{index + 1}
										</div>
									</td>
									<td class="whitespace-nowrap px-6 py-4">
										<div class="text-sm font-medium text-gray-900">{student.name}</div>
									</td>
									<td class="whitespace-nowrap px-6 py-4 text-sm text-gray-500">{student.section}</td>
									<td class="whitespace-nowrap px-6 py-4 text-sm text-gray-900">{student.requests}</td>
									<td class="whitespace-nowrap px-6 py-4">
										<div class="flex items-center">
											<span class="text-sm font-medium text-gray-900">{student.returnRate}%</span>
											<div class="ml-2 w-16 bg-gray-200 rounded-full h-2">
												<div class="bg-green-600 h-2 rounded-full" style="width: {student.returnRate}%"></div>
											</div>
										</div>
									</td>
									<td class="whitespace-nowrap px-6 py-4">
										<span class="inline-flex rounded-full px-2 py-1 text-xs font-semibold {student.returnRate === 100 ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}">
											{student.returnRate === 100 ? 'Excellent' : 'Good'}
										</span>
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			</div>
			
			<!-- Student Behavior Analysis -->
			<div class="grid grid-cols-1 gap-6 lg:grid-cols-3">
				<div class="rounded-lg bg-white p-6 shadow">
					<div class="flex items-center justify-between mb-4">
						<h3 class="text-base font-semibold text-gray-900">On-Time Returns</h3>
						<svg class="h-8 w-8 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
						</svg>
					</div>
					<p class="text-3xl font-bold text-gray-900">94%</p>
					<p class="mt-1 text-sm text-gray-500">Average across your classes</p>
				</div>
				
				<div class="rounded-lg bg-white p-6 shadow">
					<div class="flex items-center justify-between mb-4">
						<h3 class="text-base font-semibold text-gray-900">Damage Reports</h3>
						<svg class="h-8 w-8 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
						</svg>
					</div>
					<p class="text-3xl font-bold text-gray-900">2</p>
					<p class="mt-1 text-sm text-gray-500">This semester</p>
				</div>
				
				<div class="rounded-lg bg-white p-6 shadow">
					<div class="flex items-center justify-between mb-4">
						<h3 class="text-base font-semibold text-gray-900">At-Risk Students</h3>
						<svg class="h-8 w-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
						</svg>
					</div>
					<p class="text-3xl font-bold text-gray-900">1</p>
					<p class="mt-1 text-sm text-gray-500">Frequent overdue</p>
				</div>
			</div>
			
			<!-- Class Comparisons -->
			<div class="rounded-lg bg-white p-6 shadow">
				<h3 class="text-base font-semibold text-gray-900 mb-4">Class Comparisons</h3>
				<div class="text-center py-12">
					<svg class="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>
					</svg>
					<p class="mt-2 text-sm text-gray-500">Comparison charts will be displayed here</p>
				</div>
			</div>
		</div>
	{/if}
	
	<!-- Equipment Insights Tab -->
	{#if activeTab === 'equipment'}
		<div class="space-y-6">
			<!-- Most Requested Equipment -->
			<div class="rounded-lg bg-white shadow">
				<div class="border-b border-gray-200 px-6 py-4">
					<h2 class="text-lg font-semibold text-gray-900">Most Requested Equipment</h2>
					<p class="mt-1 text-sm text-gray-500">By your students this semester</p>
				</div>
				<div class="overflow-x-auto">
					<table class="min-w-full divide-y divide-gray-200">
						<thead class="bg-gray-50">
							<tr>
								<th class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Rank</th>
								<th class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Equipment</th>
								<th class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Total Requests</th>
								<th class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Availability</th>
								<th class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Status</th>
							</tr>
						</thead>
						<tbody class="divide-y divide-gray-200 bg-white">
							{#each topEquipment as equip, index}
								<tr class="hover:bg-gray-50">
									<td class="whitespace-nowrap px-6 py-4">
										<div class="flex h-8 w-8 items-center justify-center rounded-full {index === 0 ? 'bg-yellow-100 text-yellow-800' : index === 1 ? 'bg-gray-100 text-gray-800' : 'bg-orange-100 text-orange-800'} font-semibold text-sm">
											{index + 1}
										</div>
									</td>
									<td class="whitespace-nowrap px-6 py-4">
										<div class="text-sm font-medium text-gray-900">{equip.name}</div>
									</td>
									<td class="whitespace-nowrap px-6 py-4 text-sm text-gray-900">{equip.requests}</td>
									<td class="whitespace-nowrap px-6 py-4">
										<div class="flex items-center">
											<span class="text-sm font-medium text-gray-900">{equip.availability}%</span>
											<div class="ml-2 w-16 bg-gray-200 rounded-full h-2">
												<div class="h-2 rounded-full {equip.availability >= 90 ? 'bg-green-600' : equip.availability >= 75 ? 'bg-yellow-600' : 'bg-red-600'}" style="width: {equip.availability}%"></div>
											</div>
										</div>
									</td>
									<td class="whitespace-nowrap px-6 py-4">
										<span class="inline-flex rounded-full px-2 py-1 text-xs font-semibold {equip.availability >= 90 ? 'bg-green-100 text-green-800' : equip.availability >= 75 ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800'}">
											{equip.availability >= 90 ? 'Excellent' : equip.availability >= 75 ? 'Good' : 'Low'}
										</span>
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			</div>
			
			<!-- Usage Patterns -->
			<div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
				<div class="rounded-lg bg-white p-6 shadow">
					<h3 class="text-base font-semibold text-gray-900 mb-4">Peak Usage Times</h3>
					<div class="space-y-3">
						<div>
							<div class="flex items-center justify-between text-sm mb-1">
								<span class="text-gray-600">Morning (8AM - 12PM)</span>
								<span class="font-semibold text-gray-900">45%</span>
							</div>
							<div class="w-full bg-gray-200 rounded-full h-2">
								<div class="bg-blue-600 h-2 rounded-full" style="width: 45%"></div>
							</div>
						</div>
						<div>
							<div class="flex items-center justify-between text-sm mb-1">
								<span class="text-gray-600">Afternoon (12PM - 5PM)</span>
								<span class="font-semibold text-gray-900">38%</span>
							</div>
							<div class="w-full bg-gray-200 rounded-full h-2">
								<div class="bg-purple-600 h-2 rounded-full" style="width: 38%"></div>
							</div>
						</div>
						<div>
							<div class="flex items-center justify-between text-sm mb-1">
								<span class="text-gray-600">Evening (5PM - 8PM)</span>
								<span class="font-semibold text-gray-900">17%</span>
							</div>
							<div class="w-full bg-gray-200 rounded-full h-2">
								<div class="bg-pink-600 h-2 rounded-full" style="width: 17%"></div>
							</div>
						</div>
					</div>
				</div>
				
				<div class="rounded-lg bg-white p-6 shadow">
					<h3 class="text-base font-semibold text-gray-900 mb-4">Availability Impact</h3>
					<div class="space-y-4">
						<div class="flex items-center justify-between p-4 rounded-lg bg-green-50">
							<div>
								<p class="text-sm font-medium text-gray-700">Available When Needed</p>
								<p class="text-xs text-gray-500">Success rate</p>
							</div>
							<span class="text-2xl font-bold text-green-600">87%</span>
						</div>
						<div class="flex items-center justify-between p-4 rounded-lg bg-yellow-50">
							<div>
								<p class="text-sm font-medium text-gray-700">Conflict Frequency</p>
								<p class="text-xs text-gray-500">This semester</p>
							</div>
							<span class="text-2xl font-bold text-yellow-600">12</span>
						</div>
					</div>
				</div>
			</div>
			
			<!-- Comparison Charts Placeholder -->
			<div class="rounded-lg bg-white p-6 shadow">
				<h3 class="text-base font-semibold text-gray-900 mb-4">Usage Comparison</h3>
				<div class="text-center py-12">
					<svg class="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>
					</svg>
					<p class="mt-2 text-sm text-gray-500">Comparison charts (Your classes vs institution average) will be displayed here</p>
				</div>
			</div>
		</div>
	{/if}
</div>
