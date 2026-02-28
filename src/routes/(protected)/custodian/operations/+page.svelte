<script lang="ts">
	import { page } from '$app/stores';
	import { user } from '$lib/stores/auth';

	let activeTab = $state<'conditions' | 'maintenance' | 'audit'>('conditions');

	// Sample data for item conditions
	let items = $state([
		{
			id: 1,
			name: 'Chef Knife Set',
			category: 'Cutlery',
			quantity: 25,
			condition: 'good',
			lastInspection: '2024-02-20',
			location: 'Storage Room A',
			assignedTo: null
		},
		{
			id: 2,
			name: 'Mixing Bowl (Large)',
			category: 'Cookware',
			quantity: 15,
			condition: 'good',
			lastInspection: '2024-02-18',
			location: 'Storage Room B',
			assignedTo: null
		},
		{
			id: 3,
			name: 'Digital Thermometer',
			category: 'Measuring Tools',
			quantity: 8,
			condition: 'needs-repair',
			lastInspection: '2024-02-15',
			location: 'Maintenance Area',
			assignedTo: null,
			issue: 'Battery compartment loose'
		},
		{
			id: 4,
			name: 'Food Processor',
			category: 'Equipment',
			quantity: 3,
			condition: 'damaged',
			lastInspection: '2024-02-10',
			location: 'Maintenance Area',
			assignedTo: null,
			issue: 'Motor not working'
		},
		{
			id: 5,
			name: 'Whisk',
			category: 'Utensils',
			quantity: 20,
			condition: 'good',
			lastInspection: '2024-02-22',
			location: 'Storage Room A',
			assignedTo: null
		}
	]);

	// Sample data for maintenance log
	let maintenanceRecords = $state([
		{
			id: 1,
			item: 'Industrial Oven',
			type: 'preventive',
			description: 'Regular cleaning and calibration',
			performedBy: 'Maintenance Team',
			date: '2024-02-25',
			status: 'completed',
			cost: 1500,
			nextScheduled: '2024-03-25'
		},
		{
			id: 2,
			item: 'Digital Thermometer',
			type: 'corrective',
			description: 'Battery compartment repair',
			performedBy: 'Tech Support',
			date: '2024-02-24',
			status: 'in-progress',
			cost: 200,
			nextScheduled: null
		},
		{
			id: 3,
			item: 'Refrigerator Unit 2',
			type: 'preventive',
			description: 'Coolant check and temperature calibration',
			performedBy: 'Maintenance Team',
			date: '2024-02-20',
			status: 'completed',
			cost: 2000,
			nextScheduled: '2024-05-20'
		},
		{
			id: 4,
			item: 'Food Processor',
			type: 'corrective',
			description: 'Motor replacement',
			performedBy: 'Tech Support',
			date: '2024-02-26',
			status: 'pending',
			cost: 3500,
			nextScheduled: null
		}
	]);

	// Sample data for audit trail
	let auditLog = $state([
		{
			id: 1,
			action: 'Item Added',
			entity: 'Chef Knife Set',
			entityType: 'Inventory',
			performedBy: 'John Custodian',
			timestamp: '2024-02-27 10:30:15',
			details: 'Added 5 new chef knife sets to inventory',
			ipAddress: '192.168.1.100',
			changes: { quantity: { from: 20, to: 25 } }
		},
		{
			id: 2,
			action: 'Status Changed',
			entity: 'Digital Thermometer',
			entityType: 'Item Condition',
			performedBy: 'John Custodian',
			timestamp: '2024-02-27 09:15:42',
			details: 'Changed condition from Good to Needs Repair',
			ipAddress: '192.168.1.100',
			changes: { condition: { from: 'good', to: 'needs-repair' } }
		},
		{
			id: 3,
			action: 'Loan Approved',
			entity: 'Request #145',
			entityType: 'Request',
			performedBy: 'John Custodian',
			timestamp: '2024-02-26 16:45:20',
			details: 'Approved loan request for Maria Santos',
			ipAddress: '192.168.1.100',
			changes: { status: { from: 'pending', to: 'approved' } }
		},
		{
			id: 4,
			action: 'Maintenance Scheduled',
			entity: 'Industrial Oven',
			entityType: 'Maintenance',
			performedBy: 'John Custodian',
			timestamp: '2024-02-26 14:20:10',
			details: 'Scheduled preventive maintenance for next month',
			ipAddress: '192.168.1.100',
			changes: { nextScheduled: { from: null, to: '2024-03-25' } }
		},
		{
			id: 5,
			action: 'User Updated',
			entity: 'Carlos Reyes',
			entityType: 'User',
			performedBy: 'John Custodian',
			timestamp: '2024-02-25 11:30:00',
			details: 'Updated student contact information',
			ipAddress: '192.168.1.100',
			changes: { email: { from: 'old@email.com', to: 'new@email.com' } }
		}
	]);

	// New maintenance record form
	let newMaintenance = $state({
		item: '',
		type: 'preventive' as 'preventive' | 'corrective',
		description: '',
		performedBy: '',
		date: new Date().toISOString().split('T')[0],
		cost: 0
	});

	// Stats
	const goodItems = $derived(items.filter(i => i.condition === 'good').length);
	const needsRepairItems = $derived(items.filter(i => i.condition === 'needs-repair').length);
	const damagedItems = $derived(items.filter(i => i.condition === 'damaged').length);
	const totalMaintenanceCost = $derived(
		maintenanceRecords
			.filter(m => m.status === 'completed')
			.reduce((sum, m) => sum + m.cost, 0)
	);
	const pendingMaintenance = $derived(
		maintenanceRecords.filter(m => m.status === 'pending' || m.status === 'in-progress').length
	);

	function updateItemCondition(itemId: number, newCondition: string) {
		const item = items.find(i => i.id === itemId);
		if (!item) return;

		const oldCondition = item.condition;
		item.condition = newCondition;

		// Add to audit log
		auditLog = [
			{
				id: auditLog.length + 1,
				action: 'Status Changed',
				entity: item.name,
				entityType: 'Item Condition',
				performedBy: $user?.firstName ? `${$user.firstName} ${$user.lastName}` : 'Unknown User',
				timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
				details: `Changed condition from ${oldCondition} to ${newCondition}`,
				ipAddress: '192.168.1.100',
				changes: { condition: { from: oldCondition, to: newCondition } }
			},
			...auditLog
		];

		alert(`Item condition updated to ${newCondition}`);
	}

	function scheduleInspection(itemId: number) {
		const item = items.find(i => i.id === itemId);
		if (!item) return;
		alert(`Inspection scheduled for ${item.name}`);
	}

	function handleAddMaintenance() {
		if (!newMaintenance.item || !newMaintenance.description || !newMaintenance.performedBy) {
			alert('Please fill in all required fields');
			return;
		}

		maintenanceRecords = [
			{
				id: maintenanceRecords.length + 1,
				item: newMaintenance.item,
				type: newMaintenance.type,
				description: newMaintenance.description,
				performedBy: newMaintenance.performedBy,
				date: newMaintenance.date,
				status: 'pending',
				cost: newMaintenance.cost,
				nextScheduled: null
			},
			...maintenanceRecords
		];

		// Add to audit log
		auditLog = [
			{
				id: auditLog.length + 1,
				action: 'Maintenance Scheduled',
				entity: newMaintenance.item,
				entityType: 'Maintenance',
				performedBy: $user?.firstName ? `${$user.firstName} ${$user.lastName}` : 'Unknown User',
				timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
				details: `Scheduled ${newMaintenance.type} maintenance`,
				ipAddress: '192.168.1.100',
				changes: { status: { from: null, to: 'pending' } }
			},
			...auditLog
		];

		// Reset form
		newMaintenance = {
			item: '',
			type: 'preventive',
			description: '',
			performedBy: '',
			date: new Date().toISOString().split('T')[0],
			cost: 0
		};

		alert('Maintenance record added successfully!');
	}

	function updateMaintenanceStatus(maintenanceId: number, newStatus: string) {
		const maintenance = maintenanceRecords.find(m => m.id === maintenanceId);
		if (!maintenance) return;

		const oldStatus = maintenance.status;
		maintenance.status = newStatus;

		// Add to audit log
		auditLog = [
			{
				id: auditLog.length + 1,
				action: 'Maintenance Updated',
				entity: maintenance.item,
				entityType: 'Maintenance',
				performedBy: $user?.firstName ? `${$user.firstName} ${$user.lastName}` : 'Unknown User',
				timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
				details: `Changed status from ${oldStatus} to ${newStatus}`,
				ipAddress: '192.168.1.100',
				changes: { status: { from: oldStatus, to: newStatus } }
			},
			...auditLog
		];

		alert(`Maintenance status updated to ${newStatus}`);
	}

	function exportAuditLog() {
		alert('Exporting audit log to CSV...');
	}

	function viewAuditDetails(auditId: number) {
		const audit = auditLog.find(a => a.id === auditId);
		if (!audit) return;
		alert(`Audit Details:\n${JSON.stringify(audit, null, 2)}`);
	}

	function getConditionColor(condition: string) {
		switch (condition) {
			case 'good':
				return 'bg-green-100 text-green-800';
			case 'needs-repair':
				return 'bg-yellow-100 text-yellow-800';
			case 'damaged':
				return 'bg-red-100 text-red-800';
			case 'lost':
				return 'bg-gray-100 text-gray-800';
			default:
				return 'bg-gray-100 text-gray-800';
		}
	}

	function getStatusColor(status: string) {
		switch (status) {
			case 'completed':
				return 'bg-green-100 text-green-800';
			case 'in-progress':
				return 'bg-blue-100 text-blue-800';
			case 'pending':
				return 'bg-yellow-100 text-yellow-800';
			default:
				return 'bg-gray-100 text-gray-800';
		}
	}

	function getActionColor(action: string) {
		switch (action) {
			case 'Item Added':
			case 'Loan Approved':
				return 'bg-green-100 text-green-800';
			case 'Status Changed':
			case 'User Updated':
				return 'bg-blue-100 text-blue-800';
			case 'Maintenance Scheduled':
			case 'Maintenance Updated':
				return 'bg-purple-100 text-purple-800';
			default:
				return 'bg-gray-100 text-gray-800';
		}
	}
</script>

<div class="p-6">
	<!-- Header -->
	<div class="mb-6">
		<h1 class="text-3xl font-bold text-gray-900">Operations Management</h1>
		<p class="text-gray-600 mt-1">Monitor item conditions, maintenance activities, and system audit trail</p>
	</div>

	<!-- Stats Overview -->
	<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
		<div class="bg-white rounded-lg shadow p-6">
			<div class="flex items-center justify-between">
				<div>
					<p class="text-sm font-medium text-gray-600">Good Condition</p>
					<p class="text-2xl font-bold text-green-600">{goodItems}</p>
					<p class="text-xs text-gray-500 mt-1">Items ready to use</p>
				</div>
				<div class="bg-green-100 p-3 rounded-full">
					<svg class="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
					</svg>
				</div>
			</div>
		</div>

		<div class="bg-white rounded-lg shadow p-6">
			<div class="flex items-center justify-between">
				<div>
					<p class="text-sm font-medium text-gray-600">Needs Repair</p>
					<p class="text-2xl font-bold text-yellow-600">{needsRepairItems}</p>
					<p class="text-xs text-gray-500 mt-1">Requires attention</p>
				</div>
				<div class="bg-yellow-100 p-3 rounded-full">
					<svg class="w-6 h-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path>
					</svg>
				</div>
			</div>
		</div>

		<div class="bg-white rounded-lg shadow p-6">
			<div class="flex items-center justify-between">
				<div>
					<p class="text-sm font-medium text-gray-600">Damaged Items</p>
					<p class="text-2xl font-bold text-red-600">{damagedItems}</p>
					<p class="text-xs text-gray-500 mt-1">Out of service</p>
				</div>
				<div class="bg-red-100 p-3 rounded-full">
					<svg class="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
					</svg>
				</div>
			</div>
		</div>

		<div class="bg-white rounded-lg shadow p-6">
			<div class="flex items-center justify-between">
				<div>
					<p class="text-sm font-medium text-gray-600">Pending Maintenance</p>
					<p class="text-2xl font-bold text-blue-600">{pendingMaintenance}</p>
					<p class="text-xs text-gray-500 mt-1">Active tasks</p>
				</div>
				<div class="bg-blue-100 p-3 rounded-full">
					<svg class="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path>
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
					onclick={() => (activeTab = 'conditions')}
					class="whitespace-nowrap py-4 px-6 border-b-2 font-medium text-sm {activeTab === 'conditions'
						? 'border-emerald-500 text-emerald-600'
						: 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}"
				>
					Item Conditions
				</button>
				<button
					onclick={() => (activeTab = 'maintenance')}
					class="whitespace-nowrap py-4 px-6 border-b-2 font-medium text-sm {activeTab === 'maintenance'
						? 'border-emerald-500 text-emerald-600'
						: 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}"
				>
					Maintenance Log
				</button>
				<button
					onclick={() => (activeTab = 'audit')}
					class="whitespace-nowrap py-4 px-6 border-b-2 font-medium text-sm {activeTab === 'audit'
						? 'border-emerald-500 text-emerald-600'
						: 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}"
				>
					Audit Trail
				</button>
			</nav>
		</div>

		<div class="p-6">
			<!-- Item Conditions Tab -->
			{#if activeTab === 'conditions'}
				<div class="space-y-6">
					<div class="flex justify-between items-center">
						<h3 class="text-lg font-semibold text-gray-900">Item Condition Tracking</h3>
						<div class="flex gap-2 text-sm">
							<span class="px-3 py-1 bg-green-100 text-green-800 rounded-full font-medium">{goodItems} Good</span>
							<span class="px-3 py-1 bg-yellow-100 text-yellow-800 rounded-full font-medium">{needsRepairItems} Needs Repair</span>
							<span class="px-3 py-1 bg-red-100 text-red-800 rounded-full font-medium">{damagedItems} Damaged</span>
						</div>
					</div>

					{#if items.length === 0}
						<div class="text-center py-12 bg-gray-50 rounded-lg">
							<svg class="w-12 h-12 text-gray-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"></path>
							</svg>
							<p class="text-gray-500">No items to display</p>
						</div>
					{:else}
						<div class="overflow-x-auto">
							<table class="min-w-full divide-y divide-gray-200">
								<thead class="bg-gray-50">
									<tr>
										<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Item</th>
										<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Category</th>
										<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Quantity</th>
										<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Condition</th>
										<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Location</th>
										<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Last Inspection</th>
										<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Issue</th>
										<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
									</tr>
								</thead>
								<tbody class="bg-white divide-y divide-gray-200">
									{#each items as item}
										<tr class="hover:bg-gray-50">
											<td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{item.name}</td>
											<td class="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{item.category}</td>
											<td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{item.quantity}</td>
											<td class="px-6 py-4 whitespace-nowrap">
												<select
													value={item.condition}
													onchange={(e) => updateItemCondition(item.id, e.target.value)}
													class="text-xs font-medium rounded-full px-3 py-1 border-0 {getConditionColor(item.condition)} cursor-pointer focus:outline-none focus:ring-2 focus:ring-emerald-500"
												>
													<option value="good">Good</option>
													<option value="needs-repair">Needs Repair</option>
													<option value="damaged">Damaged</option>
													<option value="lost">Lost</option>
												</select>
											</td>
											<td class="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{item.location}</td>
											<td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{item.lastInspection}</td>
											<td class="px-6 py-4 text-sm text-gray-600">{item.issue || '-'}</td>
											<td class="px-6 py-4 whitespace-nowrap text-sm">
												<button
													onclick={() => scheduleInspection(item.id)}
													class="text-emerald-600 hover:text-emerald-900 font-medium"
												>
													Schedule Inspection
												</button>
											</td>
										</tr>
									{/each}
								</tbody>
							</table>
						</div>
					{/if}
				</div>
			{/if}

			<!-- Maintenance Log Tab -->
			{#if activeTab === 'maintenance'}
				<div class="space-y-6">
					<!-- Add Maintenance Record -->
					<div class="bg-gray-50 border border-gray-200 rounded-lg p-6">
						<h3 class="text-lg font-semibold text-gray-900 mb-4">Log Maintenance Activity</h3>
						<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
							<div>
								<label class="block text-sm font-medium text-gray-700 mb-1">Item Name</label>
								<input
									type="text"
									bind:value={newMaintenance.item}
									class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500"
									placeholder="Enter item name"
								/>
							</div>
							<div>
								<label class="block text-sm font-medium text-gray-700 mb-1">Maintenance Type</label>
								<select
									bind:value={newMaintenance.type}
									class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500"
								>
									<option value="preventive">Preventive</option>
									<option value="corrective">Corrective</option>
								</select>
							</div>
							<div>
								<label class="block text-sm font-medium text-gray-700 mb-1">Performed By</label>
								<input
									type="text"
									bind:value={newMaintenance.performedBy}
									class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500"
									placeholder="Technician name"
								/>
							</div>
							<div>
								<label class="block text-sm font-medium text-gray-700 mb-1">Date</label>
								<input
									type="date"
									bind:value={newMaintenance.date}
									class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500"
								/>
							</div>
							<div>
								<label class="block text-sm font-medium text-gray-700 mb-1">Cost (₱)</label>
								<input
									type="number"
									bind:value={newMaintenance.cost}
									class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500"
									placeholder="0.00"
									min="0"
									step="0.01"
								/>
							</div>
							<div class="md:col-span-2 lg:col-span-1">
								<label class="block text-sm font-medium text-gray-700 mb-1">Description</label>
								<input
									type="text"
									bind:value={newMaintenance.description}
									class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500"
									placeholder="Describe the work performed"
								/>
							</div>
						</div>
						<div class="mt-4">
							<button
								onclick={handleAddMaintenance}
								class="bg-emerald-600 hover:bg-emerald-700 text-white font-medium py-2 px-6 rounded-md transition-colors"
							>
								Log Maintenance
							</button>
						</div>
					</div>

					<!-- Maintenance Records List -->
					<div>
						<div class="flex justify-between items-center mb-4">
							<h3 class="text-lg font-semibold text-gray-900">Maintenance History</h3>
							<span class="text-sm text-gray-600">
								Total Cost: <span class="font-bold text-emerald-600">₱{totalMaintenanceCost.toLocaleString()}</span>
							</span>
						</div>

						{#if maintenanceRecords.length === 0}
							<div class="text-center py-12 bg-gray-50 rounded-lg">
								<svg class="w-12 h-12 text-gray-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path>
								</svg>
								<p class="text-gray-500">No maintenance records yet</p>
							</div>
						{:else}
							<div class="overflow-x-auto">
								<table class="min-w-full divide-y divide-gray-200">
									<thead class="bg-gray-50">
										<tr>
											<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Item</th>
											<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
											<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Description</th>
											<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Performed By</th>
											<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
											<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Cost</th>
											<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
											<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Next Scheduled</th>
											<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
										</tr>
									</thead>
									<tbody class="bg-white divide-y divide-gray-200">
										{#each maintenanceRecords as record}
											<tr class="hover:bg-gray-50">
												<td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{record.item}</td>
												<td class="px-6 py-4 whitespace-nowrap">
													<span class="px-2 py-1 text-xs font-medium rounded-full {record.type === 'preventive' ? 'bg-blue-100 text-blue-800' : 'bg-orange-100 text-orange-800'}">
														{record.type === 'preventive' ? 'Preventive' : 'Corrective'}
													</span>
												</td>
												<td class="px-6 py-4 text-sm text-gray-900">{record.description}</td>
												<td class="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{record.performedBy}</td>
												<td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{record.date}</td>
												<td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">₱{record.cost.toLocaleString()}</td>
												<td class="px-6 py-4 whitespace-nowrap">
													<select
														value={record.status}
														onchange={(e) => updateMaintenanceStatus(record.id, e.target.value)}
														class="text-xs font-medium rounded-full px-3 py-1 border-0 {getStatusColor(record.status)} cursor-pointer focus:outline-none focus:ring-2 focus:ring-emerald-500"
													>
														<option value="pending">Pending</option>
														<option value="in-progress">In Progress</option>
														<option value="completed">Completed</option>
													</select>
												</td>
												<td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{record.nextScheduled || '-'}</td>
												<td class="px-6 py-4 whitespace-nowrap text-sm">
													<button class="text-emerald-600 hover:text-emerald-900 font-medium">
														View Details
													</button>
												</td>
											</tr>
										{/each}
									</tbody>
								</table>
							</div>
						{/if}
					</div>
				</div>
			{/if}

			<!-- Audit Trail Tab -->
			{#if activeTab === 'audit'}
				<div class="space-y-6">
					<div class="flex justify-between items-center">
						<h3 class="text-lg font-semibold text-gray-900">System Audit Trail</h3>
						<button
							onclick={exportAuditLog}
							class="bg-emerald-600 hover:bg-emerald-700 text-white font-medium py-2 px-4 rounded-md transition-colors text-sm"
						>
							Export Audit Log
						</button>
					</div>

					<div class="bg-blue-50 border border-blue-200 rounded-lg p-4">
						<div class="flex items-start">
							<svg class="w-5 h-5 text-blue-600 mt-0.5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
							</svg>
							<div>
								<p class="text-sm font-medium text-blue-900">Audit Trail Information</p>
								<p class="text-sm text-blue-700 mt-1">All system activities are automatically logged for security and compliance purposes. Logs are retained for 90 days.</p>
							</div>
						</div>
					</div>

					{#if auditLog.length === 0}
						<div class="text-center py-12 bg-gray-50 rounded-lg">
							<svg class="w-12 h-12 text-gray-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"></path>
							</svg>
							<p class="text-gray-500">No audit records available</p>
						</div>
					{:else}
						<div class="overflow-x-auto">
							<table class="min-w-full divide-y divide-gray-200">
								<thead class="bg-gray-50">
									<tr>
										<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Timestamp</th>
										<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Action</th>
										<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Entity</th>
										<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
										<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Performed By</th>
										<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Details</th>
										<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">IP Address</th>
										<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
									</tr>
								</thead>
								<tbody class="bg-white divide-y divide-gray-200">
									{#each auditLog as audit}
										<tr class="hover:bg-gray-50">
											<td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{audit.timestamp}</td>
											<td class="px-6 py-4 whitespace-nowrap">
												<span class="px-2 py-1 text-xs font-medium rounded-full {getActionColor(audit.action)}">
													{audit.action}
												</span>
											</td>
											<td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{audit.entity}</td>
											<td class="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{audit.entityType}</td>
											<td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{audit.performedBy}</td>
											<td class="px-6 py-4 text-sm text-gray-600">{audit.details}</td>
											<td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 font-mono">{audit.ipAddress}</td>
											<td class="px-6 py-4 whitespace-nowrap text-sm">
												<button
													onclick={() => viewAuditDetails(audit.id)}
													class="text-emerald-600 hover:text-emerald-900 font-medium"
												>
													View Changes
												</button>
											</td>
										</tr>
									{/each}
								</tbody>
							</table>
						</div>
					{/if}
				</div>
			{/if}
		</div>
	</div>
</div>
