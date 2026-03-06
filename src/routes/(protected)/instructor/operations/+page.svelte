<script lang="ts">
	let activeTab = $state<'conditions' | 'maintenance' | 'audit'>('conditions');
	let searchQuery = $state('');
	let filterStatus = $state('all');
	let filterSeverity = $state('all');
	
	// Mock data - Item Conditions
	const itemConditions = [
		{
			id: 1,
			itemName: 'Chef Knife Set',
			itemCode: 'CK-001',
			condition: 'Good',
			lastInspection: '2026-03-05',
			usedBy: 'John Doe',
			section: 'CULN 301-A',
			notes: 'Minor wear on handle, still functional',
			severity: 'low'
		},
		{
			id: 2,
			itemName: 'Digital Scale',
			itemCode: 'DS-015',
			condition: 'Fair',
			lastInspection: '2026-03-04',
			usedBy: 'Jane Smith',
			section: 'CULN 201-B',
			notes: 'Display slightly faded, calibration needed soon',
			severity: 'medium'
		},
		{
			id: 3,
			itemName: 'Mixing Bowl Large',
			itemCode: 'MB-023',
			condition: 'Damaged',
			lastInspection: '2026-03-03',
			usedBy: 'Mike Johnson',
			section: 'CULN 301-A',
			notes: 'Crack on rim, removed from circulation',
			severity: 'high'
		}
	];
	
	// Mock data - Maintenance Log
	const maintenanceLog = [
		{
			id: 1,
			itemName: 'Industrial Oven',
			itemCode: 'IO-005',
			type: 'Scheduled',
			status: 'Upcoming',
			scheduledDate: '2026-03-10',
			duration: '2 hours',
			impact: 'Your CULN 301-A session may be affected',
			technician: 'Maintenance Team',
			priority: 'medium'
		},
		{
			id: 2,
			itemName: 'Food Processor',
			itemCode: 'FP-012',
			type: 'Repair',
			status: 'In Progress',
			scheduledDate: '2026-03-07',
			duration: '1 day',
			impact: 'Currently unavailable for all sessions',
			technician: 'John Tech',
			priority: 'high'
		},
		{
			id: 3,
			itemName: 'Refrigerator Unit 2',
			itemCode: 'RF-002',
			type: 'Inspection',
			status: 'Completed',
			scheduledDate: '2026-03-01',
			duration: '30 minutes',
			impact: 'No impact',
			technician: 'Sarah Maint',
			priority: 'low'
		}
	];
	
	// Mock data - Audit Trail
	const auditTrail = [
		{
			id: 1,
			timestamp: '2026-03-07 10:30 AM',
			action: 'Request Approved',
			performedBy: 'You',
			target: 'Request #1234',
			details: 'Approved equipment request for John Doe',
			category: 'approval'
		},
		{
			id: 2,
			timestamp: '2026-03-07 09:15 AM',
			action: 'Item Borrowed',
			performedBy: 'Jane Smith (CULN 201-B)',
			target: 'Chef Knife Set (CK-001)',
			details: 'Item checked out by student',
			category: 'student'
		},
		{
			id: 3,
			timestamp: '2026-03-06 02:45 PM',
			action: 'Request Rejected',
			performedBy: 'You',
			target: 'Request #1230',
			details: 'Rejected: Item unavailable during requested period',
			category: 'approval'
		}
	];
	
	// Filtered data based on active tab and filters
	const filteredConditions = $derived.by(() => {
		return itemConditions.filter(item => {
			const matchesSearch = searchQuery === '' || 
				item.itemName.toLowerCase().includes(searchQuery.toLowerCase()) ||
				item.itemCode.toLowerCase().includes(searchQuery.toLowerCase()) ||
				item.usedBy.toLowerCase().includes(searchQuery.toLowerCase());
			const matchesSeverity = filterSeverity === 'all' || item.severity === filterSeverity;
			return matchesSearch && matchesSeverity;
		});
	});
	
	const filteredMaintenance = $derived.by(() => {
		return maintenanceLog.filter(item => {
			const matchesSearch = searchQuery === '' || 
				item.itemName.toLowerCase().includes(searchQuery.toLowerCase()) ||
				item.itemCode.toLowerCase().includes(searchQuery.toLowerCase());
			const matchesStatus = filterStatus === 'all' || item.status.toLowerCase().replace(' ', '') === filterStatus;
			return matchesSearch && matchesStatus;
		});
	});
	
	const filteredAudit = $derived.by(() => {
		return auditTrail.filter(item => {
			const matchesSearch = searchQuery === '' || 
				item.action.toLowerCase().includes(searchQuery.toLowerCase()) ||
				item.details.toLowerCase().includes(searchQuery.toLowerCase());
			return matchesSearch;
		});
	});

</script>

<svelte:head>
	<title>Operations Management - Instructor Portal</title>
</svelte:head>

<div class="space-y-6">
	<!-- Page Header with View-Only Badge -->
	<div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
		<div>
			<div class="flex items-center gap-3">
				<h1 class="text-2xl font-bold text-gray-900 sm:text-3xl">Operations Management</h1>
				<span class="inline-flex items-center rounded-full bg-blue-100 px-3 py-1 text-sm font-semibold text-blue-800 border border-blue-200">
					<svg class="mr-1.5 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
					</svg>
					View Only
				</span>
			</div>
			<p class="mt-1 text-sm text-gray-500">Monitor custodian operations relevant to your classes</p>
		</div>
		<button class="inline-flex items-center rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
			<svg class="mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
			</svg>
			Export Report
		</button>
	</div>
	
	<!-- Info Banner -->
	<div class="rounded-lg bg-blue-50 border border-blue-200 p-4">
		<div class="flex">
			<div class="flex-shrink-0">
				<svg class="h-5 w-5 text-blue-400" fill="currentColor" viewBox="0 0 20 20">
					<path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd"/>
				</svg>
			</div>
			<div class="ml-3 flex-1">
				<h3 class="text-sm font-medium text-blue-800">Limited Access - View Only</h3>
				<div class="mt-2 text-sm text-blue-700">
					<p>You can view operations data related to your classes and students. You cannot create, edit, or modify any records.</p>
				</div>
			</div>
		</div>
	</div>
	
	<!-- Tabs -->
	<div class="border-b border-gray-200">
		<nav class="-mb-px flex space-x-8">
			<button
				onclick={() => { activeTab = 'conditions'; searchQuery = ''; filterSeverity = 'all'; }}
				class="border-b-2 px-1 py-4 text-sm font-medium {activeTab === 'conditions' ? 'border-pink-500 text-pink-600' : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'}"
			>
				<div class="flex items-center gap-2">
					<svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
					</svg>
					Item Conditions
				</div>
			</button>
			<button
				onclick={() => { activeTab = 'maintenance'; searchQuery = ''; filterStatus = 'all'; }}
				class="border-b-2 px-1 py-4 text-sm font-medium {activeTab === 'maintenance' ? 'border-pink-500 text-pink-600' : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'}"
			>
				<div class="flex items-center gap-2">
					<svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/>
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
					</svg>
					Maintenance Log
				</div>
			</button>
			<button
				onclick={() => { activeTab = 'audit'; searchQuery = ''; }}
				class="border-b-2 px-1 py-4 text-sm font-medium {activeTab === 'audit' ? 'border-pink-500 text-pink-600' : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'}"
			>
				<div class="flex items-center gap-2">
					<svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
					</svg>
					Audit Trail
				</div>
			</button>
		</nav>
	</div>
	
	<!-- Search and Filters -->
	<div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
		<div class="relative flex-1 max-w-md">
			<div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
				<svg class="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
				</svg>
			</div>
			<input
				type="text"
				bind:value={searchQuery}
				placeholder="Search..."
				class="block w-full rounded-lg border border-gray-300 py-2 pl-10 pr-3 text-sm focus:border-pink-500 focus:ring-pink-500"
			/>
		</div>
		
		{#if activeTab === 'conditions'}
			<select bind:value={filterSeverity} class="rounded-lg border border-gray-300 px-4 py-2 text-sm focus:border-pink-500 focus:ring-pink-500">
				<option value="all">All Severities</option>
				<option value="low">Low</option>
				<option value="medium">Medium</option>
				<option value="high">High</option>
			</select>
		{:else if activeTab === 'maintenance'}
			<select bind:value={filterStatus} class="rounded-lg border border-gray-300 px-4 py-2 text-sm focus:border-pink-500 focus:ring-pink-500">
				<option value="all">All Status</option>
				<option value="upcoming">Upcoming</option>
				<option value="inprogress">In Progress</option>
				<option value="completed">Completed</option>
			</select>
		{/if}
	</div>
	
	<!-- Item Conditions Tab -->
	{#if activeTab === 'conditions'}
		<div class="space-y-4">
			{#if filteredConditions.length === 0}
				<div class="rounded-lg bg-white p-12 text-center shadow">
					<svg class="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
					</svg>
					<h3 class="mt-2 text-sm font-medium text-gray-900">No condition reports found</h3>
					<p class="mt-1 text-sm text-gray-500">Try adjusting your search or filters.</p>
				</div>
			{:else}
				{#each filteredConditions as item}
					<div class="rounded-lg bg-white p-6 shadow hover:shadow-md transition-shadow">
						<div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
							<!-- Left Section -->
							<div class="flex-1">
								<div class="flex items-start gap-4">
									<div class="flex h-12 w-12 items-center justify-center rounded-lg bg-gray-100">
										<svg class="h-6 w-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
											<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/>
										</svg>
									</div>
									<div class="flex-1">
										<div class="flex items-center gap-2">
											<h3 class="text-lg font-semibold text-gray-900">{item.itemName}</h3>
											<span class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold {
												item.condition === 'Good' ? 'bg-green-100 text-green-800' :
												item.condition === 'Fair' ? 'bg-yellow-100 text-yellow-800' :
												'bg-red-100 text-red-800'
											}">
												{item.condition}
											</span>
											<span class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold {
												item.severity === 'low' ? 'bg-blue-100 text-blue-800' :
												item.severity === 'medium' ? 'bg-orange-100 text-orange-800' :
												'bg-red-100 text-red-800'
											}">
												{item.severity.toUpperCase()}
											</span>
										</div>
										<p class="mt-1 text-sm text-gray-500">Code: {item.itemCode}</p>
										
										<div class="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
											<div class="flex items-center text-sm">
												<svg class="mr-2 h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
													<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
												</svg>
												<span class="text-gray-600">Used by: <span class="font-medium text-gray-900">{item.usedBy}</span></span>
											</div>
											<div class="flex items-center text-sm">
												<svg class="mr-2 h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
													<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/>
												</svg>
												<span class="text-gray-600">Section: <span class="font-medium text-gray-900">{item.section}</span></span>
											</div>
											<div class="flex items-center text-sm">
												<svg class="mr-2 h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
													<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
												</svg>
												<span class="text-gray-600">Last Inspection: <span class="font-medium text-gray-900">{item.lastInspection}</span></span>
											</div>
										</div>
										
										{#if item.notes}
											<div class="mt-3 rounded-lg bg-gray-50 p-3">
												<p class="text-sm text-gray-700"><span class="font-medium">Notes:</span> {item.notes}</p>
											</div>
										{/if}
									</div>
								</div>
							</div>
						</div>
					</div>
				{/each}
			{/if}
		</div>
	{/if}
	
	<!-- Maintenance Log Tab -->
	{#if activeTab === 'maintenance'}
		<div class="space-y-4">
			{#if filteredMaintenance.length === 0}
				<div class="rounded-lg bg-white p-12 text-center shadow">
					<svg class="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/>
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
					</svg>
					<h3 class="mt-2 text-sm font-medium text-gray-900">No maintenance records found</h3>
					<p class="mt-1 text-sm text-gray-500">Try adjusting your search or filters.</p>
				</div>
			{:else}
				{#each filteredMaintenance as maintenance}
					<div class="rounded-lg bg-white p-6 shadow hover:shadow-md transition-shadow">
						<div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
							<!-- Left Section -->
							<div class="flex-1">
								<div class="flex items-start gap-4">
									<div class="flex h-12 w-12 items-center justify-center rounded-lg {
										maintenance.priority === 'high' ? 'bg-red-100' :
										maintenance.priority === 'medium' ? 'bg-yellow-100' :
										'bg-blue-100'
									}">
										<svg class="h-6 w-6 {
											maintenance.priority === 'high' ? 'text-red-600' :
											maintenance.priority === 'medium' ? 'text-yellow-600' :
											'text-blue-600'
										}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
											<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/>
											<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
										</svg>
									</div>
									<div class="flex-1">
										<div class="flex items-center gap-2 flex-wrap">
											<h3 class="text-lg font-semibold text-gray-900">{maintenance.itemName}</h3>
											<span class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold {
												maintenance.status === 'Upcoming' ? 'bg-blue-100 text-blue-800' :
												maintenance.status === 'In Progress' ? 'bg-yellow-100 text-yellow-800' :
												'bg-green-100 text-green-800'
											}">
												{maintenance.status}
											</span>
											<span class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold bg-gray-100 text-gray-800">
												{maintenance.type}
											</span>
										</div>
										<p class="mt-1 text-sm text-gray-500">Code: {maintenance.itemCode}</p>
										
										<div class="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
											<div class="flex items-center text-sm">
												<svg class="mr-2 h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
													<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
												</svg>
												<span class="text-gray-600">Scheduled: <span class="font-medium text-gray-900">{maintenance.scheduledDate}</span></span>
											</div>
											<div class="flex items-center text-sm">
												<svg class="mr-2 h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
													<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
												</svg>
												<span class="text-gray-600">Duration: <span class="font-medium text-gray-900">{maintenance.duration}</span></span>
											</div>
											<div class="flex items-center text-sm">
												<svg class="mr-2 h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
													<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
												</svg>
												<span class="text-gray-600">Technician: <span class="font-medium text-gray-900">{maintenance.technician}</span></span>
											</div>
										</div>
										
										{#if maintenance.impact}
											<div class="mt-3 rounded-lg {maintenance.impact.includes('may be affected') || maintenance.impact.includes('unavailable') ? 'bg-yellow-50 border border-yellow-200' : 'bg-gray-50'} p-3">
												<div class="flex items-start gap-2">
													{#if maintenance.impact.includes('may be affected') || maintenance.impact.includes('unavailable')}
														<svg class="h-5 w-5 text-yellow-600 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
															<path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/>
														</svg>
													{/if}
													<p class="text-sm {maintenance.impact.includes('may be affected') || maintenance.impact.includes('unavailable') ? 'text-yellow-800' : 'text-gray-700'}">
														<span class="font-medium">Impact:</span> {maintenance.impact}
													</p>
												</div>
											</div>
										{/if}
									</div>
								</div>
							</div>
						</div>
					</div>
				{/each}
			{/if}
		</div>
	{/if}
	
	<!-- Audit Trail Tab -->
	{#if activeTab === 'audit'}
		<div class="space-y-4">
			{#if filteredAudit.length === 0}
				<div class="rounded-lg bg-white p-12 text-center shadow">
					<svg class="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
					</svg>
					<h3 class="mt-2 text-sm font-medium text-gray-900">No audit records found</h3>
					<p class="mt-1 text-sm text-gray-500">Try adjusting your search.</p>
				</div>
			{:else}
				<div class="rounded-lg bg-white shadow overflow-hidden">
					<div class="divide-y divide-gray-200">
						{#each filteredAudit as audit}
							<div class="p-6 hover:bg-gray-50 transition-colors">
								<div class="flex items-start gap-4">
									<!-- Icon -->
									<div class="flex h-10 w-10 items-center justify-center rounded-lg {
										audit.category === 'approval' ? 'bg-blue-100' :
										audit.category === 'student' ? 'bg-purple-100' :
										'bg-gray-100'
									}">
										{#if audit.category === 'approval'}
											<svg class="h-5 w-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
												<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
											</svg>
										{:else if audit.category === 'student'}
											<svg class="h-5 w-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
												<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
											</svg>
										{:else}
											<svg class="h-5 w-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
												<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
											</svg>
										{/if}
									</div>
									
									<!-- Content -->
									<div class="flex-1 min-w-0">
										<div class="flex items-start justify-between gap-4">
											<div class="flex-1">
												<h3 class="text-base font-semibold text-gray-900">{audit.action}</h3>
												<p class="mt-1 text-sm text-gray-600">{audit.details}</p>
												<div class="mt-2 flex flex-wrap items-center gap-4 text-sm text-gray-500">
													<div class="flex items-center">
														<svg class="mr-1.5 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
															<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
														</svg>
														{audit.performedBy}
													</div>
													<div class="flex items-center">
														<svg class="mr-1.5 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
															<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"/>
														</svg>
														{audit.target}
													</div>
												</div>
											</div>
											<div class="flex-shrink-0 text-right">
												<span class="text-sm text-gray-500">{audit.timestamp}</span>
											</div>
										</div>
									</div>
								</div>
							</div>
						{/each}
					</div>
				</div>
				
				<!-- Pagination -->
				<div class="flex items-center justify-between rounded-lg bg-white px-6 py-4 shadow">
					<div class="text-sm text-gray-700">
						Showing <span class="font-medium">1</span> to <span class="font-medium">{filteredAudit.length}</span> of <span class="font-medium">{auditTrail.length}</span> results
					</div>
					<div class="flex gap-2">
						<button class="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed" disabled>
							Previous
						</button>
						<button class="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed" disabled>
							Next
						</button>
					</div>
				</div>
			{/if}
		</div>
	{/if}
</div>
