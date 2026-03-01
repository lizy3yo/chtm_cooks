<script lang="ts">
	import { page } from '$app/stores';
	import { user } from '$lib/stores/auth';

	let activeTab = $state<'donations' | 'replacements' | 'history'>('donations');

	// Sample data for donations
	let donations = $state([
		{
			id: 1,
			donorName: 'Maria Santos Foundation',
			type: 'cash',
			amount: 15000,
			item: null,
			date: '2024-01-15',
			purpose: 'Kitchen Equipment Fund',
			receiptNumber: 'DON-2024-001'
		},
		{
			id: 2,
			donorName: 'John Rodriguez',
			type: 'item',
			amount: null,
			item: 'Chef Knife Set (5 pcs)',
			date: '2024-01-18',
			purpose: 'Student Training',
			receiptNumber: 'DON-2024-002'
		},
		{
			id: 3,
			donorName: 'ABC Corporation',
			type: 'cash',
			amount: 25000,
			item: null,
			date: '2024-01-20',
			purpose: 'General Laboratory Support',
			receiptNumber: 'DON-2024-003'
		}
	]);

	// Sample data for replacement payments
	let replacementPayments = $state([
		{
			id: 1,
			studentName: 'Carlos Reyes',
			studentId: '2021-00145',
			item: 'Chef Knife',
			amountDue: 2500,
			amountPaid: 0,
			status: 'pending',
			dueDate: '2024-02-15',
			incidentDate: '2024-01-10',
			reason: 'Lost'
		},
		{
			id: 2,
			studentName: 'Lisa Tan',
			studentId: '2021-00289',
			item: 'Mixing Bowl Set',
			amountDue: 1500,
			amountPaid: 1500,
			status: 'paid',
			dueDate: '2024-02-01',
			incidentDate: '2024-01-05',
			reason: 'Damaged'
		},
		{
			id: 3,
			studentName: 'Mark Gonzales',
			studentId: '2021-00321',
			item: 'Digital Thermometer',
			amountDue: 800,
			amountPaid: 400,
			status: 'partial',
			dueDate: '2024-02-20',
			incidentDate: '2024-01-12',
			reason: 'Damaged'
		}
	]);

	// Sample data for payment history
	let paymentHistory = $state([
		{
			id: 1,
			name: 'Lisa Tan',
			type: 'replacement',
			amount: 1500,
			date: '2024-01-25',
			status: 'completed',
			paymentMethod: 'Cash',
			receiptNumber: 'REP-2024-002'
		},
		{
			id: 2,
			name: 'Maria Santos Foundation',
			type: 'donation',
			amount: 15000,
			date: '2024-01-15',
			status: 'completed',
			paymentMethod: 'Bank Transfer',
			receiptNumber: 'DON-2024-001'
		},
		{
			id: 3,
			name: 'Mark Gonzales',
			type: 'replacement',
			amount: 400,
			date: '2024-01-22',
			status: 'completed',
			paymentMethod: 'Cash',
			receiptNumber: 'REP-2024-003'
		},
		{
			id: 4,
			name: 'ABC Corporation',
			type: 'donation',
			amount: 25000,
			date: '2024-01-20',
			status: 'completed',
			paymentMethod: 'Check',
			receiptNumber: 'DON-2024-003'
		}
	]);

	// New donation form state
	let newDonation = $state({
		donorName: '',
		type: 'cash' as 'cash' | 'item',
		amount: 0,
		item: '',
		purpose: '',
		date: new Date().toISOString().split('T')[0]
	});

	// Stats
	const totalDonations = $derived(
		donations.reduce((sum, d) => sum + (d.amount || 0), 0)
	);
	const outstandingPayments = $derived(
		replacementPayments
			.filter(p => p.status !== 'paid')
			.reduce((sum, p) => sum + (p.amountDue - p.amountPaid), 0)
	);
	const totalCollected = $derived(
		paymentHistory.reduce((sum, p) => sum + p.amount, 0)
	);
	const recentActivityCount = $derived(
		paymentHistory.filter(p => {
			const paymentDate = new Date(p.date);
			const sevenDaysAgo = new Date();
			sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
			return paymentDate >= sevenDaysAgo;
		}).length
	);

	function handleAddDonation() {
		if (!newDonation.donorName) {
			alert('Please enter donor name');
			return;
		}
		if (newDonation.type === 'cash' && newDonation.amount <= 0) {
			alert('Please enter donation amount');
			return;
		}
		if (newDonation.type === 'item' && !newDonation.item) {
			alert('Please enter item description');
			return;
		}

		const receiptNumber = `DON-2024-${String(donations.length + 1).padStart(3, '0')}`;
		donations = [
			...donations,
			{
				id: donations.length + 1,
				donorName: newDonation.donorName,
				type: newDonation.type,
				amount: newDonation.type === 'cash' ? newDonation.amount : null,
				item: newDonation.type === 'item' ? newDonation.item : null,
				date: newDonation.date,
				purpose: newDonation.purpose,
				receiptNumber
			}
		];

		// Add to payment history if cash donation
		if (newDonation.type === 'cash') {
			paymentHistory = [
				{
					id: paymentHistory.length + 1,
					name: newDonation.donorName,
					type: 'donation',
					amount: newDonation.amount,
					date: newDonation.date,
					status: 'completed',
					paymentMethod: 'Cash',
					receiptNumber
				},
				...paymentHistory
			];
		}

		// Reset form
		newDonation = {
			donorName: '',
			type: 'cash',
			amount: 0,
			item: '',
			purpose: '',
			date: new Date().toISOString().split('T')[0]
		};

		alert('Donation recorded successfully!');
	}

	function processPayment(paymentId: number) {
		const payment = replacementPayments.find(p => p.id === paymentId);
		if (!payment) return;

		const amountToPayStr = prompt(`Enter payment amount (Balance: ₱${payment.amountDue - payment.amountPaid}):`);
		if (!amountToPayStr) return;

		const amountToPay = parseFloat(amountToPayStr);
		if (isNaN(amountToPay) || amountToPay <= 0) {
			alert('Invalid amount');
			return;
		}

		const remainingBalance = payment.amountDue - payment.amountPaid;
		if (amountToPay > remainingBalance) {
			alert(`Amount exceeds balance of ₱${remainingBalance}`);
			return;
		}

		payment.amountPaid += amountToPay;
		if (payment.amountPaid >= payment.amountDue) {
			payment.status = 'paid';
		} else if (payment.amountPaid > 0) {
			payment.status = 'partial';
		}

		// Add to payment history
		const receiptNumber = `REP-2024-${String(paymentHistory.filter(p => p.type === 'replacement').length + 1).padStart(3, '0')}`;
		paymentHistory = [
			{
				id: paymentHistory.length + 1,
				name: payment.studentName,
				type: 'replacement',
				amount: amountToPay,
				date: new Date().toISOString().split('T')[0],
				status: 'completed',
				paymentMethod: 'Cash',
				receiptNumber
			},
			...paymentHistory
		];

		alert(`Payment of ₱${amountToPay} recorded successfully!`);
	}

	function sendPaymentReminder(paymentId: number) {
		const payment = replacementPayments.find(p => p.id === paymentId);
		if (!payment) return;
		alert(`Payment reminder sent to ${payment.studentName}`);
	}

	function printReceipt(receiptNumber: string) {
		alert(`Printing receipt ${receiptNumber}...`);
	}

	function exportHistory() {
		alert('Exporting payment history to CSV...');
	}

	function getStatusColor(status: string) {
		switch (status) {
			case 'paid':
			case 'completed':
				return 'bg-pink-100 text-pink-800';
			case 'pending':
				return 'bg-yellow-100 text-yellow-800';
			case 'partial':
				return 'bg-blue-100 text-blue-800';
			default:
				return 'bg-gray-100 text-gray-800';
		}
	}
</script>

<div class="p-6">
	<!-- Header -->
	<div class="mb-6">
		<h1 class="text-3xl font-bold text-gray-900">Financial Management</h1>
		<p class="text-gray-600 mt-1">Track donations, replacement payments, and financial transactions</p>
	</div>

	<!-- Stats Overview -->
	<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
		<div class="bg-white rounded-lg shadow p-6">
			<div class="flex items-center justify-between">
				<div>
					<p class="text-sm font-medium text-gray-600">Total Donations</p>
					<p class="text-2xl font-bold text-pink-600">₱{totalDonations.toLocaleString()}</p>
				</div>
				<div class="bg-pink-100 p-3 rounded-full">
					<svg class="w-6 h-6 text-pink-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
					</svg>
				</div>
			</div>
		</div>

		<div class="bg-white rounded-lg shadow p-6">
			<div class="flex items-center justify-between">
				<div>
					<p class="text-sm font-medium text-gray-600">Outstanding Payments</p>
					<p class="text-2xl font-bold text-orange-600">₱{outstandingPayments.toLocaleString()}</p>
				</div>
				<div class="bg-orange-100 p-3 rounded-full">
					<svg class="w-6 h-6 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
					</svg>
				</div>
			</div>
		</div>

		<div class="bg-white rounded-lg shadow p-6">
			<div class="flex items-center justify-between">
				<div>
					<p class="text-sm font-medium text-gray-600">Total Collected</p>
						<p class="text-2xl font-bold text-pink-600">₱{totalCollected.toLocaleString()}</p>
				</div>
					<div class="bg-pink-100 p-3 rounded-full">
						<svg class="w-6 h-6 text-pink-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
					</svg>
				</div>
			</div>
		</div>

		<div class="bg-white rounded-lg shadow p-6">
			<div class="flex items-center justify-between">
				<div>
					<p class="text-sm font-medium text-gray-600">Recent Activity</p>
					<p class="text-2xl font-bold text-blue-600">{recentActivityCount}</p>
					<p class="text-xs text-gray-500 mt-1">Last 7 days</p>
				</div>
				<div class="bg-blue-100 p-3 rounded-full">
					<svg class="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"></path>
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
					onclick={() => (activeTab = 'donations')}
					class="whitespace-nowrap py-4 px-6 border-b-2 font-medium text-sm {activeTab === 'donations'
						? 'border-pink-500 text-pink-600'
						: 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}"
				>
					Donations Tracking
				</button>
				<button
					onclick={() => (activeTab = 'replacements')}
					class="whitespace-nowrap py-4 px-6 border-b-2 font-medium text-sm {activeTab === 'replacements'
						? 'border-pink-500 text-pink-600'
						: 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}"
				>
					Replacement Payments
				</button>
				<button
					onclick={() => (activeTab = 'history')}
					class="whitespace-nowrap py-4 px-6 border-b-2 font-medium text-sm {activeTab === 'history'
						? 'border-pink-500 text-pink-600'
						: 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}"
				>
					Payment History
				</button>
			</nav>
		</div>

		<div class="p-6">
			<!-- Donations Tracking Tab -->
			{#if activeTab === 'donations'}
				<div class="space-y-6">
					<!-- Add Donation Section -->
					<div class="bg-gray-50 border border-gray-200 rounded-lg p-6">
						<h3 class="text-lg font-semibold text-gray-900 mb-4">Record New Donation</h3>
						<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
							<div>
								<label class="block text-sm font-medium text-gray-700 mb-1">Donor Name</label>
								<input
									type="text"
									bind:value={newDonation.donorName}
									class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500"
									placeholder="Enter donor name"
								/>
							</div>
							<div>
								<label class="block text-sm font-medium text-gray-700 mb-1">Donation Type</label>
								<select
									bind:value={newDonation.type}
									class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500"
								>
									<option value="cash">Cash</option>
									<option value="item">Item</option>
								</select>
							</div>
							{#if newDonation.type === 'cash'}
								<div>
									<label class="block text-sm font-medium text-gray-700 mb-1">Amount (₱)</label>
									<input
										type="number"
										bind:value={newDonation.amount}
										class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500"
										placeholder="0.00"
										min="0"
										step="0.01"
									/>
								</div>
							{:else}
								<div>
									<label class="block text-sm font-medium text-gray-700 mb-1">Item Description</label>
									<input
										type="text"
										bind:value={newDonation.item}
										class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500"
										placeholder="Describe the donated item"
									/>
								</div>
							{/if}
							<div>
								<label class="block text-sm font-medium text-gray-700 mb-1">Date</label>
								<input
									type="date"
									bind:value={newDonation.date}
									class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500"
								/>
							</div>
							<div class="md:col-span-2">
								<label class="block text-sm font-medium text-gray-700 mb-1">Purpose</label>
								<input
									type="text"
									bind:value={newDonation.purpose}
									class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500"
									placeholder="Purpose of donation"
								/>
							</div>
						</div>
						<div class="mt-4">
							<button
								onclick={handleAddDonation}
								class="bg-emerald-600 hover:bg-emerald-700 text-white font-medium py-2 px-6 rounded-md transition-colors"
							>
								Record Donation
							</button>
						</div>
					</div>

					<!-- Donations List -->
					<div>
						<h3 class="text-lg font-semibold text-gray-900 mb-4">Recent Donations</h3>
						{#if donations.length === 0}
							<div class="text-center py-12 bg-gray-50 rounded-lg">
								<svg class="w-12 h-12 text-gray-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
								</svg>
								<p class="text-gray-500">No donations recorded yet</p>
							</div>
						{:else}
							<div class="overflow-x-auto">
								<table class="min-w-full divide-y divide-gray-200">
									<thead class="bg-gray-50">
										<tr>
											<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Receipt #</th>
											<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Donor</th>
											<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
											<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Amount/Item</th>
											<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Purpose</th>
											<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
											<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
										</tr>
									</thead>
									<tbody class="bg-white divide-y divide-gray-200">
										{#each donations as donation}
											<tr class="hover:bg-gray-50">
												<td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{donation.receiptNumber}</td>
												<td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{donation.donorName}</td>
												<td class="px-6 py-4 whitespace-nowrap">
													<span class="px-2 py-1 text-xs font-medium rounded-full {donation.type === 'cash' ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'}">
														{donation.type === 'cash' ? 'Cash' : 'Item'}
													</span>
												</td>
												<td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
													{#if donation.type === 'cash'}
														₱{donation.amount?.toLocaleString()}
													{:else}
														{donation.item}
													{/if}
												</td>
												<td class="px-6 py-4 text-sm text-gray-900">{donation.purpose}</td>
												<td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{donation.date}</td>
												<td class="px-6 py-4 whitespace-nowrap text-sm">
													<button
														onclick={() => printReceipt(donation.receiptNumber)}
														class="text-emerald-600 hover:text-emerald-900 font-medium"
													>
														Print Receipt
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

			<!-- Replacement Payments Tab -->
			{#if activeTab === 'replacements'}
				<div class="space-y-6">
					<div class="flex justify-between items-center">
						<h3 class="text-lg font-semibold text-gray-900">Replacement Payment Tracking</h3>
						<span class="text-sm text-gray-600">
							Outstanding: <span class="font-bold text-orange-600">₱{outstandingPayments.toLocaleString()}</span>
						</span>
					</div>

					{#if replacementPayments.length === 0}
						<div class="text-center py-12 bg-gray-50 rounded-lg">
							<svg class="w-12 h-12 text-gray-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
							</svg>
							<p class="text-gray-500">No replacement payments pending</p>
						</div>
					{:else}
						<div class="overflow-x-auto">
							<table class="min-w-full divide-y divide-gray-200">
								<thead class="bg-gray-50">
									<tr>
										<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Student</th>
										<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Item</th>
										<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Reason</th>
										<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Amount Due</th>
										<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Amount Paid</th>
										<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Balance</th>
										<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
										<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Due Date</th>
										<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
									</tr>
								</thead>
								<tbody class="bg-white divide-y divide-gray-200">
									{#each replacementPayments as payment}
										<tr class="hover:bg-gray-50">
											<td class="px-6 py-4 whitespace-nowrap">
												<div class="text-sm font-medium text-gray-900">{payment.studentName}</div>
												<div class="text-sm text-gray-500">{payment.studentId}</div>
											</td>
											<td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{payment.item}</td>
											<td class="px-6 py-4 whitespace-nowrap">
												<span class="px-2 py-1 text-xs font-medium rounded-full {payment.reason === 'Lost' ? 'bg-red-100 text-red-800' : 'bg-orange-100 text-orange-800'}">
													{payment.reason}
												</span>
											</td>
											<td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">₱{payment.amountDue.toLocaleString()}</td>
											<td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">₱{payment.amountPaid.toLocaleString()}</td>
											<td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-orange-600">₱{(payment.amountDue - payment.amountPaid).toLocaleString()}</td>
											<td class="px-6 py-4 whitespace-nowrap">
												<span class="px-2 py-1 text-xs font-medium rounded-full {getStatusColor(payment.status)}">
													{payment.status.charAt(0).toUpperCase() + payment.status.slice(1)}
												</span>
											</td>
											<td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{payment.dueDate}</td>
											<td class="px-6 py-4 whitespace-nowrap text-sm space-x-2">
												{#if payment.status !== 'paid'}
													<button
														onclick={() => processPayment(payment.id)}
														class="text-emerald-600 hover:text-emerald-900 font-medium"
													>
														Process Payment
													</button>
													<button
														onclick={() => sendPaymentReminder(payment.id)}
														class="text-blue-600 hover:text-blue-900 font-medium"
													>
														Send Reminder
													</button>
												{:else}
													<span class="text-green-600 font-medium">Paid</span>
												{/if}
											</td>
										</tr>
									{/each}
								</tbody>
							</table>
						</div>
					{/if}
				</div>
			{/if}

			<!-- Payment History Tab -->
			{#if activeTab === 'history'}
				<div class="space-y-6">
					<div class="flex justify-between items-center">
						<h3 class="text-lg font-semibold text-gray-900">Payment History</h3>
						<button
							onclick={exportHistory}
							class="bg-emerald-600 hover:bg-emerald-700 text-white font-medium py-2 px-4 rounded-md transition-colors text-sm"
						>
							Export to CSV
						</button>
					</div>

					{#if paymentHistory.length === 0}
						<div class="text-center py-12 bg-gray-50 rounded-lg">
							<svg class="w-12 h-12 text-gray-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"></path>
							</svg>
							<p class="text-gray-500">No payment history available</p>
						</div>
					{:else}
						<div class="overflow-x-auto">
							<table class="min-w-full divide-y divide-gray-200">
								<thead class="bg-gray-50">
									<tr>
										<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Receipt #</th>
										<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
										<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Transaction Type</th>
										<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
										<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Payment Method</th>
										<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
										<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
										<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
									</tr>
								</thead>
								<tbody class="bg-white divide-y divide-gray-200">
									{#each paymentHistory as transaction}
										<tr class="hover:bg-gray-50">
											<td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{transaction.receiptNumber}</td>
											<td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{transaction.name}</td>
											<td class="px-6 py-4 whitespace-nowrap">
												<span class="px-2 py-1 text-xs font-medium rounded-full {transaction.type === 'donation' ? 'bg-emerald-100 text-emerald-800' : 'bg-purple-100 text-purple-800'}">
													{transaction.type === 'donation' ? 'Donation' : 'Replacement'}
												</span>
											</td>
											<td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">₱{transaction.amount.toLocaleString()}</td>
											<td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{transaction.paymentMethod}</td>
											<td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{transaction.date}</td>
											<td class="px-6 py-4 whitespace-nowrap">
												<span class="px-2 py-1 text-xs font-medium rounded-full {getStatusColor(transaction.status)}">
													{transaction.status.charAt(0).toUpperCase() + transaction.status.slice(1)}
												</span>
											</td>
											<td class="px-6 py-4 whitespace-nowrap text-sm">
												<button
													onclick={() => printReceipt(transaction.receiptNumber)}
													class="text-emerald-600 hover:text-emerald-900 font-medium"
												>
													View Receipt
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
