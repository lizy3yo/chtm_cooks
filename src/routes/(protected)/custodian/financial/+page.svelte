<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { user } from '$lib/stores/auth';
	import { financialObligationsAPI, type FinancialObligation } from '$lib/api/financialObligations';

	let activeTab = $state<'donations' | 'replacements' | 'history'>('replacements');
	let replacementsFilter = $state<'all' | 'pending' | 'paid' | 'replaced'>('all');
	let replacementsView = $state<'by-request' | 'by-item'>('by-item');
	let obligations = $state<FinancialObligation[]>([]);
	let isLoading = $state(true);
	let error = $state<string | null>(null);
	let selectedObligation = $state<FinancialObligation | null>(null);
	let selectedSummary = $state<{ borrowRequestId: string; requestCode: string; studentName: string; studentEmail: string; studentProfilePhotoUrl: string | null; items: number; missingCount: number; damagedCount: number; amount: number; amountPaid: number; balance: number; latestDueDate: string; statuses: Set<string> } | null>(null);
	let selectedSummaryItemIndex = $state(0);

	const selectedSummaryItems = $derived(
		selectedSummary
			? obligations.filter(o => o.borrowRequestId === selectedSummary!.borrowRequestId)
			: []
	);
	const selectedSummaryItem = $derived(selectedSummaryItems[selectedSummaryItemIndex] ?? null);

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
		obligations
			.filter((o) => o.status === 'pending')
			.reduce((sum, o) => sum + o.balance, 0)
	);

	const obligationCounts = $derived({
		all: obligations.length,
		pending: obligations.filter((o) => o.status === 'pending').length,
		paid: obligations.filter((o) => o.status === 'paid').length,
		replaced: obligations.filter((o) => o.status === 'replaced').length
	});

	const filteredObligations = $derived(
		replacementsFilter === 'all' ? obligations : obligations.filter((o) => o.status === replacementsFilter)
	);

	const requestSummaries = $derived.by(() => {
		const grouped = new Map<
			string,
			{
				borrowRequestId: string;
				requestCode: string;
				studentName: string;
				studentEmail: string;
				studentProfilePhotoUrl: string | null;
				items: number;
				missingCount: number;
				damagedCount: number;
				amount: number;
				amountPaid: number;
				balance: number;
				latestDueDate: string;
				statuses: Set<string>;
			}
		>();

		for (const obligation of filteredObligations) {
			const existing = grouped.get(obligation.borrowRequestId);
			const dueDate = obligation.dueDate;

			if (existing) {
				existing.items += 1;
				existing.missingCount += obligation.type === 'missing' ? 1 : 0;
				existing.damagedCount += obligation.type === 'damaged' ? 1 : 0;
				existing.amount += obligation.amount;
				existing.amountPaid += obligation.amountPaid;
				existing.balance += obligation.balance;
				existing.statuses.add(obligation.status);
				if (new Date(dueDate).getTime() > new Date(existing.latestDueDate).getTime()) {
					existing.latestDueDate = dueDate;
				}
				continue;
			}

			grouped.set(obligation.borrowRequestId, {
				borrowRequestId: obligation.borrowRequestId,
				requestCode: `REQ-${obligation.borrowRequestId.slice(-6).toUpperCase()}`,
				studentName: obligation.studentName || 'Unknown Student',
				studentEmail: obligation.studentEmail || 'N/A',
				studentProfilePhotoUrl: obligation.studentProfilePhotoUrl || null,
				items: 1,
				missingCount: obligation.type === 'missing' ? 1 : 0,
				damagedCount: obligation.type === 'damaged' ? 1 : 0,
				amount: obligation.amount,
				amountPaid: obligation.amountPaid,
				balance: obligation.balance,
				latestDueDate: dueDate,
				statuses: new Set([obligation.status])
			});
		}

		return [...grouped.values()].sort(
			(a, b) => new Date(a.latestDueDate).getTime() - new Date(b.latestDueDate).getTime()
		);
	});
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

	onMount(async () => {
		await loadObligations();
	});

	async function loadObligations(): Promise<void> {
		isLoading = true;
		error = null;
		try {
			const response = await financialObligationsAPI.getObligations({ limit: 500 });
			obligations = response.obligations;
		} catch (err) {
			console.error('Failed to load obligations', err);
			error = err instanceof Error ? err.message : 'Failed to load obligations';
		} finally {
			isLoading = false;
		}
	}

	async function handleResolveObligation(
		id: string,
		resolutionType: 'payment' | 'replacement' | 'waiver',
		amount?: number
	): Promise<void> {
		try {
			await financialObligationsAPI.resolveObligation(id, {
				resolutionType,
				amountPaid: amount,
				resolutionNotes: `Resolved via ${resolutionType}`
			});
			await loadObligations();
			alert('Obligation resolved successfully');
		} catch (err) {
			console.error('Failed to resolve obligation', err);
			alert(err instanceof Error ? err.message : 'Failed to resolve obligation');
		}
	}

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

	function getObligationStatusClass(status: string): string {
		switch (status) {
			case 'pending':
				return 'bg-amber-100 text-amber-800 ring-amber-200';
			case 'paid':
				return 'bg-emerald-100 text-emerald-800 ring-emerald-200';
			case 'replaced':
				return 'bg-cyan-100 text-cyan-800 ring-cyan-200';
			case 'waived':
				return 'bg-slate-100 text-slate-700 ring-slate-200';
			default:
				return 'bg-gray-100 text-gray-700 ring-gray-200';
		}
	}

	function getRequestSummaryStatusClass(statuses: Set<string>): string {
		if (statuses.size === 1) {
			const [status] = [...statuses];
			return getObligationStatusClass(status);
		}

		if (statuses.has('pending')) {
			return 'bg-amber-100 text-amber-800 ring-amber-200';
		}

		return 'bg-slate-100 text-slate-700 ring-slate-200';
	}

	function getRequestSummaryStatusLabel(statuses: Set<string>): string {
		if (statuses.size === 1) {
			const [status] = [...statuses];
			return status.charAt(0).toUpperCase() + status.slice(1);
		}

		if (statuses.has('pending')) {
			return 'Mixed';
		}

		return 'Resolved';
	}

	function getInitials(name?: string): string {
		if (!name) return '??';
		const parts = name.trim().split(/\s+/).filter(Boolean);
		if (parts.length === 0) return '??';
		if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
		return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
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
					onclick={() => (activeTab = 'replacements')}
					class="whitespace-nowrap py-4 px-6 border-b-2 font-medium text-sm {activeTab === 'replacements'
						? 'border-pink-500 text-pink-600'
						: 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}"
				>
					Replacement Payments
					{#if obligationCounts.pending > 0}
						<span class="ml-1.5 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">{obligationCounts.pending}</span>
					{/if}
				</button>
				<button
					onclick={() => (activeTab = 'donations')}
					class="whitespace-nowrap py-4 px-6 border-b-2 font-medium text-sm {activeTab === 'donations'
						? 'border-pink-500 text-pink-600'
						: 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}"
				>
					Donations Tracking
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
							<div class="py-12 text-center">
								<svg class="mx-auto h-24 w-24 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
								</svg>
								<h3 class="mt-4 text-lg font-medium text-gray-900">No donations yet</h3>
								<p class="mt-2 text-sm text-gray-500">Donations from individuals or organizations will be recorded and tracked here.</p>
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
					<!-- Sub-tab header -->
					<div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
						<div>
							<h3 class="text-lg font-semibold text-gray-900">Replacement & Damage Payment Tracking</h3>
							<p class="mt-0.5 text-sm text-gray-500">Manage outstanding financial obligations from damage and missing incidents.</p>
						</div>
						<span class="shrink-0 text-sm text-gray-600">
							Outstanding: <span class="font-bold text-amber-600">PHP {outstandingPayments.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
						</span>
					</div>

					<!-- Inner filter tabs -->
					<div class="border-b border-gray-200">
						<nav class="-mb-px flex gap-6 overflow-x-auto">
							{#each [
								{ key: 'all', label: 'All', count: obligationCounts.all },
								{ key: 'pending', label: 'Pending', count: obligationCounts.pending },
								{ key: 'paid', label: 'Paid', count: obligationCounts.paid },
								{ key: 'replaced', label: 'Replaced', count: obligationCounts.replaced }
							] as tab}
								<button
									onclick={() => (replacementsFilter = tab.key as typeof replacementsFilter)}
									class="whitespace-nowrap border-b-2 px-1 py-3 text-sm font-medium transition-colors {replacementsFilter === tab.key ? 'border-pink-500 text-pink-600' : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'}"
								>
									{tab.label}
									<span class="ml-1.5 rounded-full px-2 py-0.5 text-xs {replacementsFilter === tab.key ? 'bg-pink-100 text-pink-600' : 'bg-gray-100 text-gray-600'}">
										{tab.count}
									</span>
								</button>
							{/each}
						</nav>
					</div>

					<div class="inline-flex w-fit items-center rounded-xl border border-gray-200 bg-gray-50 p-1">
						<button
							onclick={() => (replacementsView = 'by-request')}
							class="rounded-lg px-4 py-2 text-sm font-medium transition-colors {replacementsView === 'by-request' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}"
						>
							By Request
						</button>
						<button
							onclick={() => (replacementsView = 'by-item')}
							class="rounded-lg px-4 py-2 text-sm font-medium transition-colors {replacementsView === 'by-item' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}"
						>
							By Item
						</button>
					</div>

					{#if isLoading}
						<div class="text-center py-12 bg-gray-50 rounded-lg">
							<svg class="w-8 h-8 text-gray-400 mx-auto mb-4 animate-spin" fill="none" viewBox="0 0 24 24">
								<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
								<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
							</svg>
							<p class="text-gray-500">Loading obligations...</p>
						</div>
					{:else if error}
						<div class="text-center py-12 bg-red-50 rounded-lg border border-red-200">
							<svg class="w-12 h-12 text-red-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
							</svg>
							<p class="text-red-600">{error}</p>
						</div>
					{:else if filteredObligations.length === 0}
						<div class="rounded-lg border-2 border-dashed border-gray-200 py-14 text-center">
							<svg class="mx-auto h-12 w-12 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
							</svg>
							<p class="mt-3 text-sm font-medium text-gray-700">{replacementsFilter === 'all' ? 'No obligations recorded.' : `No ${replacementsFilter} obligations.`}</p>
							<p class="mt-1 text-xs text-gray-500">Obligations from damage and missing incidents will appear here.</p>
						</div>
					{:else if replacementsView === 'by-request'}
						<div class="overflow-x-auto rounded-lg border border-gray-200">
							<table class="min-w-full divide-y divide-gray-200">
								<thead class="bg-gray-50">
									<tr>
										<th class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Request</th>
										<th class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Student</th>
										<th class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Issue Mix</th>
										<th class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Status</th>
										<th class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Balance</th>
										<th class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500"></th>
									</tr>
								</thead>
								<tbody class="divide-y divide-gray-200 bg-white">
									{#each requestSummaries as summary}
										<tr class="hover:bg-gray-50">
											<td class="whitespace-nowrap px-6 py-4">
												<div class="text-sm font-semibold text-gray-900">{summary.requestCode}</div>
											</td>
											<td class="px-6 py-4">
												<div class="flex items-center gap-3">
													<div class="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-pink-100 text-xs font-semibold text-pink-700">
														{#if summary.studentProfilePhotoUrl}
															<img src={summary.studentProfilePhotoUrl} alt={summary.studentName} class="h-full w-full object-cover" loading="lazy" />
														{:else}
															{getInitials(summary.studentName)}
														{/if}
													</div>
													<div>
														<div class="text-sm font-medium text-gray-900">{summary.studentName}</div>
														<div class="text-xs text-gray-500">{summary.studentEmail}</div>
													</div>
												</div>
											</td>
											<td class="px-6 py-4">
												<div class="flex flex-wrap gap-1.5">
													{#if summary.missingCount > 0}
														<span class="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-800 ring-1 ring-red-200">
															<span class="h-1.5 w-1.5 rounded-full bg-current"></span>
															{summary.missingCount} Missing
														</span>
													{/if}
													{#if summary.damagedCount > 0}
														<span class="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-semibold text-rose-800 ring-1 ring-rose-200">
															<span class="h-1.5 w-1.5 rounded-full bg-current"></span>
															{summary.damagedCount} Damaged
														</span>
													{/if}
												</div>
											</td>
											<td class="whitespace-nowrap px-6 py-4">
												<span class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 {getRequestSummaryStatusClass(summary.statuses)}">
													{getRequestSummaryStatusLabel(summary.statuses)}
												</span>
											</td>
											<td class="whitespace-nowrap px-6 py-4 text-sm font-semibold {summary.balance > 0 ? 'text-amber-600' : 'text-emerald-600'}">
												PHP {summary.balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
											</td>
											<td class="whitespace-nowrap px-6 py-4 text-right">
												<button
													onclick={() => { selectedSummary = summary; selectedSummaryItemIndex = 0; }}
													class="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:ring-offset-1 transition-colors"
												>
													View Details
												</button>
											</td>
										</tr>
									{/each}
								</tbody>
							</table>
						</div>
					{:else}
						<div class="overflow-x-auto rounded-lg border border-gray-200">
							<table class="min-w-full divide-y divide-gray-200">
								<thead class="bg-gray-50">
									<tr>
										<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Student</th>
										<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Item</th>
										<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
										<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
										<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Balance</th>
										<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"></th>
									</tr>
								</thead>
								<tbody class="bg-white divide-y divide-gray-200">
									{#each filteredObligations as obligation}
										<tr class="hover:bg-gray-50">
											<td class="px-6 py-4 whitespace-nowrap">
												<div class="flex items-center gap-3">
													<div class="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-pink-100 text-xs font-semibold text-pink-700">
														{#if obligation.studentProfilePhotoUrl}
															<img src={obligation.studentProfilePhotoUrl} alt={obligation.studentName || 'Student'} class="h-full w-full object-cover" loading="lazy" />
														{:else}
															{getInitials(obligation.studentName || 'Unknown Student')}
														{/if}
													</div>
													<div>
														<div class="text-sm font-medium text-gray-900">{obligation.studentName || 'Unknown Student'}</div>
														<div class="text-xs text-gray-500">{obligation.studentEmail || 'N/A'}</div>
													</div>
												</div>
											</td>
											<td class="px-6 py-4 whitespace-nowrap">
												<div class="text-sm text-gray-900">{obligation.itemName}</div>
												<div class="text-xs text-gray-500">Qty: {obligation.quantity}</div>
											</td>
											<td class="px-6 py-4 whitespace-nowrap">
												<span class="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 {obligation.type === 'missing' ? 'bg-red-100 text-red-800 ring-red-200' : 'bg-rose-100 text-rose-800 ring-rose-200'}">
													<span class="h-1.5 w-1.5 rounded-full bg-current"></span>
													{obligation.type === 'missing' ? 'Missing' : 'Damaged'}
												</span>
											</td>
											<td class="px-6 py-4 whitespace-nowrap">
												<span class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 {getObligationStatusClass(obligation.status)}">
													{obligation.status.charAt(0).toUpperCase() + obligation.status.slice(1)}
												</span>
											</td>
											<td class="px-6 py-4 whitespace-nowrap text-sm font-semibold {obligation.balance > 0 ? 'text-amber-600' : 'text-emerald-600'}">
												PHP {obligation.balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
											</td>
											<td class="px-6 py-4 whitespace-nowrap text-right">
												<button
													onclick={() => selectedObligation = obligation}
													class="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:ring-offset-1 transition-colors"
												>
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
						<div class="py-12 text-center">
							<svg class="mx-auto h-24 w-24 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"></path>
							</svg>
							<h3 class="mt-4 text-lg font-medium text-gray-900">No payment history</h3>
							<p class="mt-2 text-sm text-gray-500">Completed payments and transactions will appear here for your records.</p>
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

<!-- Request Summary Detail Modal -->
{#if selectedSummary}
	<div class="fixed inset-0 z-50 overflow-y-auto" role="dialog" aria-modal="true" aria-labelledby="summary-modal-title">
		<div class="fixed inset-0 bg-black/40 transition-opacity" onclick={() => selectedSummary = null}></div>
		<div class="flex min-h-full items-center justify-center p-4">
			<div class="relative z-50 w-full max-w-lg rounded-xl bg-white shadow-2xl">

				<!-- Header -->
				<div class="flex items-center justify-between border-b border-gray-200 px-6 py-4">
					<div>
						<h2 id="summary-modal-title" class="text-base font-semibold text-gray-900">{selectedSummary.requestCode}</h2>
						<p class="mt-0.5 text-xs text-gray-500">{selectedSummary.studentName} · {selectedSummary.items} item{selectedSummary.items !== 1 ? 's' : ''}</p>
					</div>
					<button
						onclick={() => selectedSummary = null}
						class="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
						aria-label="Close"
					>
						<svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
						</svg>
					</button>
				</div>

				<!-- Body -->
				<div class="px-6 py-5 space-y-5">

					<!-- Student -->
					<div class="flex items-center gap-3">
						<div class="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-pink-100 text-sm font-semibold text-pink-700">
							{#if selectedSummary.studentProfilePhotoUrl}
								<img src={selectedSummary.studentProfilePhotoUrl} alt={selectedSummary.studentName} class="h-full w-full object-cover" />
							{:else}
								{getInitials(selectedSummary.studentName)}
							{/if}
						</div>
						<div>
							<p class="text-sm font-medium text-gray-900">{selectedSummary.studentName}</p>
							<p class="text-xs text-gray-500">{selectedSummary.studentEmail}</p>
						</div>
						<div class="ml-auto">
							<span class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 {getRequestSummaryStatusClass(selectedSummary.statuses)}">
								{getRequestSummaryStatusLabel(selectedSummary.statuses)}
							</span>
						</div>
					</div>

					<!-- Item selector dropdown -->
					{#if selectedSummaryItems.length > 0}
						<div>
							<label for="summary-item-select" class="block text-xs font-medium text-gray-500 mb-1.5">Item</label>
							<select
								id="summary-item-select"
								bind:value={selectedSummaryItemIndex}
								class="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500"
							>
								{#each selectedSummaryItems as item, i}
									<option value={i}>
										{item.itemName} — {item.type === 'missing' ? 'Missing' : 'Damaged'} · Qty {item.quantity}
									</option>
								{/each}
							</select>
						</div>
					{/if}

					<!-- Selected item detail -->
					{#if selectedSummaryItem}
						<div class="rounded-lg bg-gray-50 p-4 space-y-3 text-sm">
							<div class="flex items-center justify-between">
								<span class="text-xs text-gray-500">Type</span>
								<span class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ring-1 {selectedSummaryItem.type === 'missing' ? 'bg-red-100 text-red-800 ring-red-200' : 'bg-rose-100 text-rose-800 ring-rose-200'}">
									<span class="h-1.5 w-1.5 rounded-full bg-current"></span>
									{selectedSummaryItem.type === 'missing' ? 'Missing' : 'Damaged'}
								</span>
							</div>
							<div class="flex items-center justify-between">
								<span class="text-xs text-gray-500">Status</span>
								<span class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 {getObligationStatusClass(selectedSummaryItem.status)}">
									{selectedSummaryItem.status.charAt(0).toUpperCase() + selectedSummaryItem.status.slice(1)}
								</span>
							</div>
							<div class="flex items-center justify-between">
								<span class="text-xs text-gray-500">Due Date</span>
								<span class="font-medium text-gray-900">{new Date(selectedSummaryItem.dueDate).toLocaleDateString()}</span>
							</div>
						</div>

						<!-- Financials for selected item -->
						<div class="rounded-lg border border-gray-200 divide-y divide-gray-100 text-sm">
							<div class="flex items-center justify-between px-4 py-3">
								<span class="text-gray-500">Amount</span>
								<span class="font-medium text-gray-900">PHP {selectedSummaryItem.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
							</div>
							<div class="flex items-center justify-between px-4 py-3">
								<span class="text-gray-500">Paid</span>
								<span class="font-medium text-gray-900">PHP {selectedSummaryItem.amountPaid.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
							</div>
							<div class="flex items-center justify-between px-4 py-3">
								<span class="text-gray-500">Balance</span>
								<span class="font-semibold {selectedSummaryItem.balance > 0 ? 'text-amber-600' : 'text-emerald-600'}">PHP {selectedSummaryItem.balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
							</div>
						</div>

						<!-- Actions for selected item -->
						{#if selectedSummaryItem.status === 'pending'}
							<div class="flex flex-wrap gap-2 pt-1">
								<button
									onclick={() => {
										const amount = parseFloat(prompt(`Enter payment amount (Balance: PHP ${selectedSummaryItem!.balance}):`) || '0');
										if (amount > 0 && amount <= selectedSummaryItem!.balance) {
											handleResolveObligation(selectedSummaryItem!.id, 'payment', amount);
											selectedSummary = null;
										}
									}}
									class="flex-1 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-1 transition-colors"
								>
									Record Payment
								</button>
								<button
									onclick={() => {
										if (confirm('Mark item as replaced by student?')) {
											handleResolveObligation(selectedSummaryItem!.id, 'replacement');
											selectedSummary = null;
										}
									}}
									class="flex-1 rounded-lg border border-blue-300 bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 transition-colors"
								>
									Mark Replaced
								</button>
								<button
									onclick={() => {
										if (confirm('Waive this obligation? This action cannot be undone.')) {
											handleResolveObligation(selectedSummaryItem!.id, 'waiver');
											selectedSummary = null;
										}
									}}
									class="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-1 transition-colors"
								>
									Waive
								</button>
							</div>
						{/if}
					{/if}

					<!-- Request totals -->
					<div class="border-t border-gray-100 pt-4">
						<p class="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">Request Total</p>
						<div class="flex items-center justify-between text-sm">
							<span class="text-gray-500">Total Balance</span>
							<span class="font-semibold {selectedSummary.balance > 0 ? 'text-amber-600' : 'text-emerald-600'}">PHP {selectedSummary.balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
						</div>
					</div>
				</div>

				<!-- Footer -->
				<div class="flex justify-end border-t border-gray-200 px-6 py-4">
					<button
						onclick={() => selectedSummary = null}
						class="rounded-lg border border-gray-300 bg-white px-5 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:ring-offset-1 transition-colors"
					>
						Close
					</button>
				</div>
			</div>
		</div>
	</div>
{/if}

<!-- Obligation Detail Modal -->
{#if selectedObligation}
	<div class="fixed inset-0 z-50 overflow-y-auto" role="dialog" aria-modal="true" aria-labelledby="obligation-modal-title">
		<div class="fixed inset-0 bg-black/40 transition-opacity" onclick={() => selectedObligation = null}></div>
		<div class="flex min-h-full items-center justify-center p-4">
			<div class="relative z-50 w-full max-w-lg rounded-xl bg-white shadow-2xl">

				<!-- Header -->
				<div class="flex items-center justify-between border-b border-gray-200 px-6 py-4">
					<div>
						<h2 id="obligation-modal-title" class="text-base font-semibold text-gray-900">Obligation Details</h2>
						<p class="mt-0.5 text-xs text-gray-500">{selectedObligation.itemName} · {selectedObligation.studentName || 'Unknown Student'}</p>
					</div>
					<button
						onclick={() => selectedObligation = null}
						class="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
						aria-label="Close"
					>
						<svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
						</svg>
					</button>
				</div>

				<!-- Body -->
				<div class="px-6 py-5 space-y-5">

					<!-- Student -->
					<div class="flex items-center gap-3">
						<div class="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-pink-100 text-sm font-semibold text-pink-700">
							{#if selectedObligation.studentProfilePhotoUrl}
								<img src={selectedObligation.studentProfilePhotoUrl} alt={selectedObligation.studentName || ''} class="h-full w-full object-cover" />
							{:else}
								{getInitials(selectedObligation.studentName || 'Unknown Student')}
							{/if}
						</div>
						<div>
							<p class="text-sm font-medium text-gray-900">{selectedObligation.studentName || 'Unknown Student'}</p>
							<p class="text-xs text-gray-500">{selectedObligation.studentEmail || 'N/A'}</p>
						</div>
						<div class="ml-auto">
							<span class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 {getObligationStatusClass(selectedObligation.status)}">
								{selectedObligation.status.charAt(0).toUpperCase() + selectedObligation.status.slice(1)}
							</span>
						</div>
					</div>

					<!-- Details grid -->
					<div class="grid grid-cols-2 gap-4 rounded-lg bg-gray-50 p-4 text-sm">
						<div>
							<p class="text-xs text-gray-500">Item</p>
							<p class="mt-0.5 font-medium text-gray-900">{selectedObligation.itemName}</p>
						</div>
						<div>
							<p class="text-xs text-gray-500">Quantity</p>
							<p class="mt-0.5 font-medium text-gray-900">{selectedObligation.quantity}</p>
						</div>
						<div>
							<p class="text-xs text-gray-500">Type</p>
							<span class="mt-0.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ring-1 {selectedObligation.type === 'missing' ? 'bg-red-100 text-red-800 ring-red-200' : 'bg-rose-100 text-rose-800 ring-rose-200'}">
								<span class="h-1.5 w-1.5 rounded-full bg-current"></span>
								{selectedObligation.type === 'missing' ? 'Missing' : 'Damaged'}
							</span>
						</div>
						<div>
							<p class="text-xs text-gray-500">Due Date</p>
							<p class="mt-0.5 font-medium text-gray-900">{new Date(selectedObligation.dueDate).toLocaleDateString()}</p>
						</div>
					</div>

					<!-- Financials -->
					<div class="rounded-lg border border-gray-200 divide-y divide-gray-100 text-sm">
						<div class="flex items-center justify-between px-4 py-3">
							<span class="text-gray-500">Amount</span>
							<span class="font-medium text-gray-900">PHP {selectedObligation.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
						</div>
						<div class="flex items-center justify-between px-4 py-3">
							<span class="text-gray-500">Paid</span>
							<span class="font-medium text-gray-900">PHP {selectedObligation.amountPaid.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
						</div>
						<div class="flex items-center justify-between px-4 py-3">
							<span class="text-gray-500">Balance</span>
							<span class="font-semibold {selectedObligation.balance > 0 ? 'text-amber-600' : 'text-emerald-600'}">PHP {selectedObligation.balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
						</div>
					</div>

					<!-- Actions -->
					{#if selectedObligation.status === 'pending'}
						<div class="flex flex-wrap gap-2 pt-1">
							<button
								onclick={() => {
									const amount = parseFloat(prompt(`Enter payment amount (Balance: PHP ${selectedObligation!.balance}):`) || '0');
									if (amount > 0 && amount <= selectedObligation!.balance) {
										handleResolveObligation(selectedObligation!.id, 'payment', amount);
										selectedObligation = null;
									}
								}}
								class="flex-1 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-1 transition-colors"
							>
								Record Payment
							</button>
							<button
								onclick={() => {
									if (confirm('Mark item as replaced by student?')) {
										handleResolveObligation(selectedObligation!.id, 'replacement');
										selectedObligation = null;
									}
								}}
								class="flex-1 rounded-lg border border-blue-300 bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 transition-colors"
							>
								Mark Replaced
							</button>
							<button
								onclick={() => {
									if (confirm('Waive this obligation? This action cannot be undone.')) {
										handleResolveObligation(selectedObligation!.id, 'waiver');
										selectedObligation = null;
									}
								}}
								class="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-1 transition-colors"
							>
								Waive
							</button>
						</div>
					{/if}
				</div>

				<!-- Footer -->
				<div class="flex justify-end border-t border-gray-200 px-6 py-4">
					<button
						onclick={() => selectedObligation = null}
						class="rounded-lg border border-gray-300 bg-white px-5 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:ring-offset-1 transition-colors"
					>
						Close
					</button>
				</div>
			</div>
		</div>
	</div>
{/if}
