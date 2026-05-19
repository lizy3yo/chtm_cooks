<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { borrowRequestsAPI, type BorrowRequestRecord } from '$lib/api/borrowRequests';
	import { toastStore } from '$lib/stores/toast';
	import { loadingStore } from '$lib/stores/loading';
	import {
		Clock,
		Package,
		CheckCircle2,
		XCircle,
		CalendarDays,
		User,
		ShieldCheck,
		FileText,
		UserCircle,
		X,
		ClipboardList,
		FileCheck,
		CheckCheck,
		PackageCheck,
		Truck,
		Home,
		CircleAlert,
		Info,
		Filter,
		Search,
		RotateCcw,
		CircleX,
		BookOpen,
		QrCode,
		CornerDownLeft
	} from 'lucide-svelte';
	import HistorySkeletonLoader from '$lib/components/ui/HistorySkeletonLoader.svelte';
	import Pagination from '$lib/components/ui/Pagination.svelte';
	import ItemImagePlaceholder from '$lib/components/ui/ItemImagePlaceholder.svelte';

	let history = $state<BorrowRequestRecord[]>([]);
	let total = $state(0);
	let page = $state(1);
	let limit = $state(10);
	let search = $state('');
	let statusFilter = $state('');
	let loading = $state(true);
	let byRequestLoading = $state(true);
	let byItemLoading = $state(true);
	let inFlightLoadId = 0;

	let unsubscribeSSE: (() => void) | null = null;
	let viewMode = $state<'by-request' | 'by-item'>('by-request');
	let showDetailModal = $state(false);
	let selectedRequest = $state<any>(null);

	const activeLoading = $derived(viewMode === 'by-request' ? byRequestLoading : byItemLoading);

	const statusOptions = [
		{ value: '', label: 'All Statuses' },
		{ value: 'returned', label: 'Returned' },
		{ value: 'resolved', label: 'Resolved' },
		{ value: 'cancelled', label: 'Cancelled' },
		{ value: 'rejected', label: 'Rejected' }
	];

	async function loadHistoryProgressive(forceRefresh = true) {
		const loadId = ++inFlightLoadId;
		try {
			let apiStatuses: string[];
			if (!statusFilter) {
				apiStatuses = ['returned', 'resolved', 'cancelled', 'rejected'];
			} else if (statusFilter === 'cancelled') {
				apiStatuses = ['cancelled', 'rejected'];
			} else {
				apiStatuses = [statusFilter];
			}

			const promise = borrowRequestsAPI.list(
				{
					statuses: apiStatuses as any,
					search: search || undefined,
					page,
					limit,
					sortBy: 'createdAt'
				},
				{ forceRefresh }
			);

			const results = await Promise.allSettled([promise]);

			if (loadId !== inFlightLoadId) return;

			const listRes = results[0];
			if (listRes.status === 'fulfilled') {
				history = listRes.value.requests;
				total = listRes.value.total;
			}

			byRequestLoading = false;

			await new Promise((r) => setTimeout(r, 120));
			if (loadId !== inFlightLoadId) return;
			byItemLoading = false;
		} catch (err: any) {
			console.error('Failed to load history:', err);
			toastStore.error(err.message || 'Failed to load history');
			history = [];
			total = 0;
		} finally {
			if (loadId === inFlightLoadId) {
				loading = false;
				byRequestLoading = false;
				byItemLoading = false;
			}
		}
	}

	async function loadHistory(showLoader = true) {
		if (showLoader) {
			if (history.length === 0) {
				if (viewMode === 'by-request') byRequestLoading = true;
				else byItemLoading = true;
			}
			await loadHistoryProgressive(true);
		} else {
			try {
				let apiStatuses: string[];
				if (!statusFilter) {
					apiStatuses = ['returned', 'resolved', 'cancelled', 'rejected'];
				} else if (statusFilter === 'cancelled') {
					apiStatuses = ['cancelled', 'rejected'];
				} else {
					apiStatuses = [statusFilter];
				}

				const response = await borrowRequestsAPI.list({
					statuses: apiStatuses as any,
					search: search || undefined,
					page,
					limit,
					sortBy: 'createdAt'
				});
				history = response.requests;
				total = response.total;
			} catch (err: any) {
				console.error('Silent load failed', err);
			}
		}
	}

	onMount(() => {
		loadHistory();
		unsubscribeSSE = borrowRequestsAPI.subscribeToChanges(() => {
			loadHistory(false);
		});
	});

	onDestroy(() => {
		if (unsubscribeSSE) unsubscribeSSE();
	});

	function formatDate(date: string) {
		return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(
			new Date(date)
		);
	}

	function formatDateShort(date: string) {
		return new Intl.DateTimeFormat('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		}).format(new Date(date));
	}

	function getStatusColor(status: string) {
		const map: Record<string, string> = {
			pending: 'bg-yellow-100 text-yellow-800 border-yellow-200',
			approved: 'bg-blue-100 text-blue-800 border-blue-200',
			ready: 'bg-emerald-100 text-emerald-800 border-emerald-200',
			'picked-up': 'bg-violet-100 text-violet-800 border-violet-200',
			'pending-return': 'bg-orange-100 text-orange-800 border-orange-200',
			missing: 'bg-rose-100 text-rose-800 border-rose-200',
			returned: 'bg-teal-100 text-teal-800 border-teal-200',
			resolved: 'bg-emerald-100 text-emerald-800 border-emerald-200',
			cancelled: 'bg-slate-100 text-slate-800 border-slate-200',
			rejected: 'bg-red-100 text-red-800 border-red-200'
		};
		return map[status] || 'bg-gray-100 text-gray-800 border-gray-200';
	}

	function statusIcon(status: string) {
		const map: Record<string, any> = {
			returned: CheckCircle2,
			resolved: ShieldCheck,
			cancelled: XCircle,
			rejected: XCircle
		};
		return map[status] || Clock;
	}

	let StatusIcon = $derived.by(() =>
		selectedRequest ? statusIcon(selectedRequest.status) : Clock
	);

	function isCancelledRequest(
		status: BorrowRequestRecord['status'],
		rejectionReason?: string
	): boolean {
		if (status === 'cancelled') return true;
		if (!rejectionReason) return false;
		return rejectionReason.toLowerCase().includes('cancel');
	}

	function toUiStatus(status: BorrowRequestRecord['status'], rejectionReason?: string): string {
		if (isCancelledRequest(status, rejectionReason)) return 'cancelled';
		const map: Record<string, string> = {
			pending_instructor: 'pending',
			approved_instructor: 'approved',
			ready_for_pickup: 'ready',
			borrowed: 'picked-up',
			pending_return: 'pending-return',
			missing: 'missing',
			resolved: 'resolved',
			returned: 'returned',
			cancelled: 'cancelled',
			rejected: 'rejected'
		};
		return map[status] ?? status;
	}

	function toStatusLabel(s: string): string {
		const labels: Record<string, string> = {
			pending: 'Under Review',
			approved: 'Approved',
			ready: 'Ready for Pickup',
			'picked-up': 'Active Loan',
			'pending-return': 'Return Initiated',
			missing: 'Item Missing',
			resolved: 'Resolved',
			returned: 'Returned',
			cancelled: 'Cancelled',
			rejected: 'Rejected'
		};
		return labels[s] ?? s;
	}

	function formatRequestCode(id: string) {
		return `REQ-${id.slice(-6).toUpperCase()}`;
	}

	let itemPictureCache = $state<Map<string, string>>(new Map());

	function openDetailModal(request: any) {
		selectedRequest = {
			...request,
			rawId: request.id,
			id: formatRequestCode(request.id),
			items: request.items.map((item: any) => ({
				name: item.name,
				itemId: item.itemId,
				picture: item.picture || null,
				code: item.itemId.slice(-6).toUpperCase(),
				quantity: item.quantity,
				inspection: item.inspection || null
			})),
			status: toUiStatus(request.status, request.rejectReason),
			requestDate: request.createdAt,
			borrowDate: request.borrowDate,
			returnDate: request.returnDate,
			purpose: request.purpose,
			instructor: request.instructor?.fullName || 'Pending',
			instructorData: request.instructor ?? null,
			custodianData: request.custodian ?? null,
			classCodeId: request.classCodeId,
			classCode: (request as any).classCode,
			approvedDate: request.approvedAt,
			releasedDate: request.releasedAt,
			pickedUpDate: request.pickedUpAt,
			returnedAt: request.returnedAt,
			rejectionReason: request.rejectReason,
			appealReason: request.appealReason,
			appealCount: request.appealCount ?? 0
		};
		showDetailModal = true;
	}

	function closeDetailModal() {
		showDetailModal = false;
		selectedRequest = null;
	}

	function getRequestsStatusLabel(status: string): string {
		const labels: Record<string, string> = {
			pending: 'Under Review',
			approved: 'Instructor Approved',
			ready: 'Ready for Pickup',
			'picked-up': 'Active Loan',
			'pending-return': 'Return Initiated',
			missing: 'Item Missing',
			returned: 'Returned',
			resolved: 'Resolved',
			cancelled: 'Cancelled',
			rejected: 'Rejected',
			appealed: 'Appeal Submitted'
		};
		return labels[status] ?? status;
	}

	function getRequestsStatusColor(status: string): string {
		switch (status) {
			case 'pending':
				return 'bg-amber-100 text-amber-800';
			case 'approved':
				return 'bg-blue-100 text-blue-800';
			case 'ready':
				return 'bg-emerald-100 text-emerald-800';
			case 'picked-up':
				return 'bg-violet-100 text-violet-800';
			case 'pending-return':
				return 'bg-orange-100 text-orange-800';
			case 'missing':
				return 'bg-rose-100 text-rose-800';
			case 'returned':
				return 'bg-teal-100 text-teal-800';
			case 'resolved':
				return 'bg-emerald-100 text-emerald-800';
			case 'cancelled':
				return 'bg-slate-100 text-slate-800';
			case 'rejected':
				return 'bg-red-100 text-red-800';
			case 'appealed':
				return 'bg-violet-100 text-violet-800';
			default:
				return 'bg-gray-100 text-gray-800';
		}
	}

	function getRequestsStatusIconComponent(status: string) {
		switch (status) {
			case 'pending':
				return Clock;
			case 'approved':
				return CheckCircle2;
			case 'ready':
				return PackageCheck;
			case 'picked-up':
				return PackageCheck;
			case 'pending-return':
				return CornerDownLeft;
			case 'missing':
				return CircleAlert;
			case 'returned':
				return CheckCircle2;
			case 'resolved':
				return FileCheck;
			case 'cancelled':
				return CircleX;
			case 'rejected':
				return CircleX;
			case 'appealed':
				return RotateCcw;
			default:
				return Clock;
		}
	}

	function getRequestsStatusBorderColor(status: string): string {
		switch (status) {
			case 'pending':
				return 'border-amber-400';
			case 'approved':
				return 'border-blue-500';
			case 'ready':
				return 'border-emerald-500';
			case 'picked-up':
				return 'border-violet-500';
			case 'pending-return':
				return 'border-orange-500';
			case 'missing':
				return 'border-rose-600';
			case 'returned':
				return 'border-teal-500';
			case 'resolved':
				return 'border-emerald-500';
			case 'cancelled':
				return 'border-slate-400';
			case 'rejected':
				return 'border-red-500';
			case 'appealed':
				return 'border-violet-500';
			default:
				return 'border-gray-200';
		}
	}

	function getDetailModalStatusLabel(request: any): string {
		if (!request) return '';
		if (request.status === 'resolved' || request.status === 'returned') {
			return getRequestsStatusLabel(request.status);
		}
		if (
			request.status === 'missing' ||
			request.items?.some(
				(item: any) =>
					item.inspection?.status === 'missing' || item.inspection?.status === 'damaged'
			)
		) {
			const hasMissing =
				request.status === 'missing' ||
				request.items?.some((item: any) => item.inspection?.status === 'missing');
			const hasDamaged = request.items?.some((item: any) => item.inspection?.status === 'damaged');

			if (hasMissing && hasDamaged) {
				return 'Unresolved Incidents';
			} else if (hasMissing) {
				return 'Item Missing';
			} else if (hasDamaged) {
				return 'Item Damaged';
			}
		}
		return getRequestsStatusLabel(request.status);
	}

	function getDetailModalStatusColor(request: any): string {
		if (!request) return 'bg-gray-100 text-gray-800';
		if (request.status === 'resolved' || request.status === 'returned') {
			return getRequestsStatusColor(request.status);
		}
		if (
			request.status === 'missing' ||
			request.items?.some(
				(item: any) =>
					item.inspection?.status === 'missing' || item.inspection?.status === 'damaged'
			)
		) {
			const hasMissing =
				request.status === 'missing' ||
				request.items?.some((item: any) => item.inspection?.status === 'missing');
			const hasDamaged = request.items?.some((item: any) => item.inspection?.status === 'damaged');

			if (hasMissing && hasDamaged) {
				return 'bg-rose-100 text-rose-800';
			} else if (hasMissing) {
				return 'bg-rose-100 text-rose-800';
			} else if (hasDamaged) {
				return 'bg-amber-100 text-amber-800';
			}
		}
		return getRequestsStatusColor(request.status);
	}

	function getDetailModalStatusIcon(request: any): any {
		if (!request) return Clock;
		if (request.status === 'resolved' || request.status === 'returned') {
			return getRequestsStatusIconComponent(request.status);
		}
		if (
			request.status === 'missing' ||
			request.items?.some(
				(item: any) =>
					item.inspection?.status === 'missing' || item.inspection?.status === 'damaged'
			)
		) {
			return CircleAlert;
		}
		return getRequestsStatusIconComponent(request.status);
	}

	const SelectedStatusIcon = $derived.by(() =>
		selectedRequest ? getDetailModalStatusIcon(selectedRequest) : Clock
	);

	function getApprovalTimeline(request: any) {
		const timeline: Array<{ step: string; status: string; date: string | null; by: string }> = [
			{ step: 'Request Submitted', status: 'completed', date: request.requestDate, by: 'You' }
		];

		if (request.status === 'pending') {
			timeline.push({
				step: 'Instructor Review',
				status: 'pending',
				date: null,
				by: request.instructor
			});
			timeline.push({ step: 'Custodian Approval', status: 'pending', date: null, by: 'Custodian' });
		} else if (request.status === 'approved') {
			timeline.push({
				step: 'Instructor Approved',
				status: 'completed',
				date: request.approvedDate || request.requestDate,
				by: request.instructor || 'Primary Admin'
			});
			timeline.push({ step: 'Custodian Approval', status: 'pending', date: null, by: 'Custodian' });
		} else if (request.status === 'ready') {
			timeline.push({
				step: 'Instructor Approved',
				status: 'completed',
				date: request.approvedDate || request.requestDate,
				by: request.instructor || 'Primary Admin'
			});
			timeline.push({
				step: 'Custodian Approved',
				status: 'completed',
				date: request.releasedDate || request.requestDate,
				by: 'Custodian'
			});
			timeline.push({ step: 'Awaiting Pickup', status: 'pending', date: null, by: 'Student' });
		} else if (request.status === 'picked-up') {
			timeline.push({
				step: 'Instructor Approved',
				status: 'completed',
				date: request.approvedDate || request.requestDate,
				by: request.instructor || 'Primary Admin'
			});
			timeline.push({
				step: 'Custodian Approved',
				status: 'completed',
				date: request.releasedDate || request.requestDate,
				by: 'Custodian'
			});
			timeline.push({
				step: 'Pickup Confirmed',
				status: 'completed',
				date: request.pickedUpDate || request.requestDate,
				by: 'Custodian'
			});
			timeline.push({ step: 'Awaiting Return', status: 'pending', date: null, by: 'Student' });
		} else if (request.status === 'returned' || request.status === 'resolved') {
			timeline.push({
				step: 'Instructor Approved',
				status: 'completed',
				date: request.approvedDate || request.requestDate,
				by: request.instructor || 'Primary Admin'
			});
			timeline.push({
				step: 'Custodian Approved',
				status: 'completed',
				date: request.releasedDate || request.requestDate,
				by: 'Custodian'
			});
			timeline.push({
				step: 'Pickup Confirmed',
				status: 'completed',
				date: request.pickedUpDate || request.requestDate,
				by: 'Custodian'
			});
			timeline.push({
				step: 'Returned',
				status: 'completed',
				date: request.returnedAt || request.requestDate,
				by: 'Student'
			});
		} else if (request.status === 'pending_return') {
			timeline.push({
				step: 'Instructor Approved',
				status: 'completed',
				date: request.approvedDate || request.requestDate,
				by: request.instructor || 'Primary Admin'
			});
			timeline.push({
				step: 'Custodian Approved',
				status: 'completed',
				date: request.releasedDate || request.requestDate,
				by: 'Custodian'
			});
			timeline.push({
				step: 'Pickup Confirmed',
				status: 'completed',
				date: request.pickedUpDate || request.requestDate,
				by: 'Custodian'
			});
			timeline.push({
				step: 'Return Initiated',
				status: 'completed',
				date: request.returnDate || request.requestDate,
				by: 'You'
			});
			timeline.push({
				step: 'Awaiting Inspection',
				status: 'pending',
				date: null,
				by: 'Custodian'
			});
		} else if (
			request.status === 'missing' ||
			request.items?.some(
				(item: any) =>
					item.inspection?.status === 'missing' || item.inspection?.status === 'damaged'
			)
		) {
			timeline.push({
				step: 'Instructor Approved',
				status: 'completed',
				date: request.approvedDate || request.requestDate,
				by: request.instructor || 'Primary Admin'
			});
			timeline.push({
				step: 'Custodian Approved',
				status: 'completed',
				date: request.releasedDate || request.requestDate,
				by: 'Custodian'
			});
			timeline.push({
				step: 'Pickup Confirmed',
				status: 'completed',
				date: request.pickedUpDate || request.requestDate,
				by: 'Custodian'
			});

			const hasMissing =
				request.status === 'missing' ||
				request.items?.some((item: any) => item.inspection?.status === 'missing');
			const hasDamaged = request.items?.some((item: any) => item.inspection?.status === 'damaged');

			if (hasMissing && hasDamaged) {
				timeline.push({
					step: 'Unresolved Incidents',
					status: 'rejected',
					date: request.missingDate || request.returnedAt || request.requestDate,
					by: 'Custodian'
				});
			} else if (hasMissing) {
				timeline.push({
					step: 'Item Missing',
					status: 'rejected',
					date: request.missingDate || request.returnedAt || request.requestDate,
					by: 'Custodian'
				});
			} else if (hasDamaged) {
				timeline.push({
					step: 'Item Damaged',
					status: 'rejected',
					date: request.returnedAt || request.requestDate,
					by: 'Custodian'
				});
			}
		} else if (request.status === 'cancelled') {
			timeline.push({
				step: 'Request Cancelled',
				status: 'cancelled',
				date: request.requestDate,
				by: 'You'
			});
		} else if (request.status === 'rejected') {
			timeline.push({
				step: 'Request Rejected',
				status: 'rejected',
				date: request.requestDate,
				by: request.instructor
			});
		} else if (request.status === 'appealed') {
			timeline.push({
				step: 'Request Rejected',
				status: 'rejected',
				date: request.requestDate,
				by: request.instructor
			});
			timeline.push({
				step: 'Appeal Submitted',
				status: 'completed',
				date: request.requestDate,
				by: 'You'
			});
			timeline.push({
				step: 'Instructor Review',
				status: 'pending',
				date: null,
				by: request.instructor
			});
		}

		return timeline;
	}
</script>

<svelte:head>
	<title>History - Account - Student Portal</title>
</svelte:head>

{#if activeLoading && history.length === 0}
	<HistorySkeletonLoader />
{:else}
	<div class="space-y-4 sm:space-y-6">
		<!-- Header -->
		<div>
			<h1 class="text-2xl font-bold text-gray-900 sm:text-3xl">History</h1>
			<p class="mt-1 text-sm text-gray-600">View your complete borrowing history</p>
		</div>

		<!-- Filters -->
		<div class="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
			<div
				class="flex flex-col items-center justify-between gap-4 border-b border-gray-200 bg-gray-50/50 p-4 sm:flex-row"
			>
				<!-- Left: Filters -->
				<div class="flex w-full flex-col gap-3 sm:flex-1 sm:flex-row sm:items-center">
					<!-- Status Dropdown -->
					<div class="w-full sm:w-48">
						<div class="relative">
							<div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
								<Filter size={16} class="text-gray-400" />
							</div>
							<select
								id="status-filter"
								bind:value={statusFilter}
								onchange={() => {
									page = 1;
									loadHistory();
								}}
								class="block w-full appearance-none rounded-lg border border-gray-300 bg-white py-2 pr-10 pl-10 text-sm font-medium text-gray-900 shadow-sm transition-all focus:border-pink-500 focus:ring-2 focus:ring-pink-500/20 focus:outline-none"
							>
								{#each statusOptions as opt}
									<option value={opt.value}>{opt.label}</option>
								{/each}
							</select>
							<div class="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
								<svg
									class="h-4 w-4 text-gray-400"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M19 9l-7 7-7-7"
									/>
								</svg>
							</div>
						</div>
					</div>

					<!-- Search Input -->
					<div class="w-full sm:max-w-md sm:flex-1">
						<div class="relative">
							<div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
								<Search size={16} class="text-gray-400" />
							</div>
							<input
								type="text"
								id="search"
								placeholder="Search by purpose or item..."
								bind:value={search}
								onkeydown={(e) => e.key === 'Enter' && loadHistory()}
								class="block w-full rounded-lg border border-gray-300 bg-white py-2 pr-3 pl-10 text-sm placeholder-gray-400 shadow-sm transition-all focus:border-pink-500 focus:ring-2 focus:ring-pink-500/20 focus:outline-none"
							/>
						</div>
					</div>
				</div>

				<!-- Right: View Mode Toggle -->
				<div class="flex w-full items-center justify-center sm:w-auto sm:justify-end">
					<div class="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-0.5 shadow-sm">
						<button
							onclick={() => (viewMode = 'by-request')}
							class="rounded-md px-3 py-1.5 text-xs font-semibold transition-all {viewMode ===
							'by-request'
								? 'bg-white text-gray-900 shadow-sm'
								: 'text-gray-600 hover:text-gray-900'}"
						>
							By Request
						</button>
						<button
							onclick={() => (viewMode = 'by-item')}
							class="rounded-md px-3 py-1.5 text-xs font-semibold transition-all {viewMode ===
							'by-item'
								? 'bg-white text-gray-900 shadow-sm'
								: 'text-gray-600 hover:text-gray-900'}"
						>
							By Item
						</button>
					</div>
				</div>
			</div>
		</div>

		<!-- Content -->
		{#if !history || history.length === 0}
			<div class="rounded-xl border border-gray-200 bg-white shadow-sm">
				<div class="px-6 py-16 text-center">
					<div
						class="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full bg-gray-100"
					>
						<Clock size={32} class="text-gray-400" />
					</div>
					<h3 class="text-base font-semibold text-gray-900">No history found</h3>
					<p class="mt-2 text-sm text-gray-500">
						You have no completed, cancelled, or declined requests yet.
					</p>
				</div>
			</div>
		{:else}
			<!-- Results Info -->
			<div class="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
				<div class="border-b border-gray-100 bg-gray-50/30 px-6 py-3">
					<p class="text-sm text-gray-700">
						Showing <span class="font-semibold">{history.length}</span> of
						<span class="font-semibold">{total}</span>
						{total === 1 ? 'request' : 'requests'}
					</p>
				</div>

				<div class="divide-y divide-gray-200">
					{#if viewMode === 'by-request'}
						{#each history as req, i}
							{@const uiStatus = toUiStatus(req.status, req.rejectReason)}
							{@const Icon = statusIcon(uiStatus)}
							<button
								onclick={() => openDetailModal(req)}
								class="group w-full p-5 text-left transition-colors hover:bg-gray-50"
							>
								<div class="flex items-start gap-4">
									<!-- Row number -->
									<span
										class="mt-1 hidden h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gray-100 text-[10px] font-semibold text-gray-500 sm:inline-flex"
										>{(page - 1) * limit + i + 1}</span
									>

									<!-- Item Images -->
									<div class="hidden shrink-0 sm:flex sm:-space-x-3">
										{#each req.items.slice(0, 3) as item}
											{#if item.picture}
												<img
													src={item.picture}
													alt={item.name}
													class="h-14 w-14 rounded-xl object-cover ring-2 ring-white"
												/>
											{:else}
												<div
													class="flex h-14 w-14 items-center justify-center rounded-xl bg-gray-100 ring-2 ring-white"
												>
													<Package size={20} class="text-gray-400" />
												</div>
											{/if}
										{/each}
										{#if req.items.length > 3}
											<div
												class="flex h-14 w-14 items-center justify-center rounded-xl bg-linear-to-br from-pink-50 to-violet-50 ring-2 ring-white"
											>
												<span class="text-sm font-semibold text-gray-700"
													>+{req.items.length - 3}</span
												>
											</div>
										{/if}
									</div>

									<!-- Content -->
									<div class="min-w-0 flex-1">
										<div class="flex items-start justify-between gap-3">
											<div class="min-w-0 flex-1">
												<h3
													class="text-base font-semibold text-gray-900 transition-colors group-hover:text-pink-600"
												>
													{req.purpose}
												</h3>
												<p class="mt-0.5 font-mono text-xs text-gray-500">
													{formatRequestCode(req.id)}
												</p>
											</div>
											<span
												class="inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium {getStatusColor(
													uiStatus
												)}"
											>
												<Icon size={12} />
												{toStatusLabel(uiStatus)}
											</span>
										</div>

										<!-- Items List -->
										<div class="mt-3 space-y-1.5">
											{#each req.items as item}
												<div class="flex items-center gap-2 text-sm">
													<div
														class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-50 sm:hidden"
													>
														{#if item.picture}
															<img
																src={item.picture}
																alt={item.name}
																class="h-8 w-8 rounded-lg object-cover"
															/>
														{:else}
															<Package size={14} class="text-gray-400" />
														{/if}
													</div>
													<span class="text-gray-900">{item.name}</span>
													<span class="text-gray-400">×</span>
													<span class="font-medium text-gray-700">{item.quantity}</span>
												</div>
											{/each}
										</div>

										<!-- Meta Info -->
										<div
											class="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-gray-600"
										>
											<div class="flex items-center gap-1.5">
												<CalendarDays size={14} class="text-gray-400" />
												<span>{formatDateShort(req.createdAt)}</span>
											</div>
											{#if req.instructor?.fullName}
												<div class="flex items-center gap-1.5">
													<User size={14} class="text-gray-400" />
													<span>{req.instructor.fullName}</span>
												</div>
											{/if}
											{#if req.custodian?.fullName}
												<div class="flex items-center gap-1.5">
													<ShieldCheck size={14} class="text-gray-400" />
													<span>{req.custodian.fullName}</span>
												</div>
											{/if}
										</div>
									</div>
								</div>
							</button>
						{/each}
					{:else}
						{#each history as req, i}
							{@const uiStatus = toUiStatus(req.status, req.rejectReason)}
							{@const Icon = statusIcon(uiStatus)}
							{#each req.items as item, j}
								<button
									onclick={() => openDetailModal(req)}
									class="group w-full p-5 text-left transition-colors hover:bg-gray-50"
								>
									<div class="flex items-start gap-4">
										<!-- Row number -->
										<span
											class="mt-1 hidden h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gray-100 text-[10px] font-semibold text-gray-500 sm:inline-flex"
											>{(page - 1) * limit + i + 1}.{j + 1}</span
										>

										<!-- Item Image -->
										<div class="shrink-0">
											{#if item.picture}
												<img
													src={item.picture}
													alt={item.name}
													class="h-16 w-16 rounded-xl object-cover sm:h-20 sm:w-20"
												/>
											{:else}
												<div
													class="flex h-16 w-16 items-center justify-center rounded-xl bg-gray-100 sm:h-20 sm:w-20"
												>
													<Package size={24} class="text-gray-400" />
												</div>
											{/if}
										</div>

										<!-- Content -->
										<div class="min-w-0 flex-1">
											<div class="flex items-start justify-between gap-3">
												<div class="min-w-0 flex-1">
													<h3
														class="text-base font-semibold text-gray-900 transition-colors group-hover:text-pink-600"
													>
														{item.name}
													</h3>
													<p class="mt-0.5 text-sm text-gray-600">Quantity: {item.quantity}</p>
												</div>
												<span
													class="inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium {getStatusColor(
														uiStatus
													)}"
												>
													<Icon size={12} />
													{toStatusLabel(uiStatus)}
												</span>
											</div>

											<div class="mt-2 text-sm text-gray-700">
												<span class="font-medium">Purpose:</span>
												{req.purpose}
											</div>

											<!-- Meta Info -->
											<div
												class="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-gray-600"
											>
												<div class="flex items-center gap-1.5">
													<CalendarDays size={14} class="text-gray-400" />
													<span>{formatDateShort(req.createdAt)}</span>
												</div>
												{#if req.instructor?.fullName}
													<div class="flex items-center gap-1.5">
														<User size={14} class="text-gray-400" />
														<span>{req.instructor.fullName}</span>
													</div>
												{/if}
												{#if req.custodian?.fullName}
													<div class="flex items-center gap-1.5">
														<ShieldCheck size={14} class="text-gray-400" />
														<span>{req.custodian.fullName}</span>
													</div>
												{/if}
											</div>
										</div>
									</div>
								</button>
							{/each}
						{/each}
					{/if}
				</div>

				<!-- Pagination -->
				{#if total > limit}
					<Pagination
						currentPage={page}
						totalPages={Math.ceil(total / limit)}
						totalItems={total}
						itemsPerPage={limit}
						onPageChange={(p) => {
							page = p;
							loadHistory();
						}}
					/>
				{/if}
			</div>
		{/if}
	</div>
{/if}

<!-- Detail Modal -->
{#if showDetailModal && selectedRequest}
	<div class="fixed inset-0 z-50 overflow-y-auto">
		<div
			class="fixed inset-0 bg-black/40 backdrop-blur-sm transition-opacity"
			onclick={closeDetailModal}
			role="button"
			tabindex="0"
			onkeydown={(e) => {
				if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') closeDetailModal();
			}}
			aria-label="Close details modal"
		></div>
		<div class="flex min-h-full items-end justify-center sm:items-center sm:p-4">
			<div
				class="animate-scaleIn relative w-full max-w-3xl overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl"
			>
				<!-- Header -->
				<div
					class="sticky top-0 z-10 border-b border-gray-200 bg-white/95 px-4 py-4 backdrop-blur-sm sm:px-8 sm:py-6"
				>
					<div class="flex items-start justify-between gap-3">
						<div class="flex min-w-0 flex-1 items-start gap-3">
							<div
								class="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-linear-to-br from-pink-500 to-pink-600 shadow-lg shadow-pink-500/30 sm:h-12 sm:w-12"
							>
								<ClipboardList size={20} class="text-white sm:hidden" strokeWidth={2.5} />
								<ClipboardList size={24} class="hidden text-white sm:block" strokeWidth={2.5} />
							</div>
							<div class="min-w-0 flex-1">
								<h2 class="text-lg font-bold text-gray-900 sm:text-xl md:text-2xl">
									Request Details
								</h2>
								<p class="mt-0.5 font-mono text-xs font-semibold text-pink-600 sm:text-sm">
									{selectedRequest.id}
								</p>
								<div
									class="mt-2 inline-flex items-center gap-2 rounded-full px-2.5 py-1 sm:px-3 sm:py-1.5 {getDetailModalStatusColor(
										selectedRequest
									)} shadow-sm ring-1 ring-black/5"
								>
									<SelectedStatusIcon size={12} strokeWidth={2.5} class="sm:hidden" />
									<SelectedStatusIcon size={14} strokeWidth={2.5} class="hidden sm:block" />
									<span class="text-[10px] font-bold sm:text-xs"
										>{getDetailModalStatusLabel(selectedRequest)}</span
									>
								</div>
							</div>
						</div>
						<div class="flex shrink-0 items-center gap-1.5 sm:gap-2">
							<button
								onclick={closeDetailModal}
								class="rounded-xl p-2 text-gray-400 transition-all hover:bg-gray-100 hover:text-gray-600 active:scale-95 sm:p-2.5"
							>
								<X size={18} class="sm:hidden" />
								<X size={22} class="hidden sm:block" />
							</button>
						</div>
					</div>
				</div>

				<!-- Content -->
				<div class="max-h-[70vh] overflow-y-auto px-4 py-5 sm:px-8 sm:py-8">
					<div class="space-y-6 sm:space-y-8">
						<!-- Approval Timeline -->
						<div>
							<div
								class="rounded-2xl border border-gray-200 bg-linear-to-br from-white to-gray-50 p-4 sm:p-5"
							>
								<!-- Timeline Container -->
								<div class="relative">
									<!-- SVG Background for connector lines -->
									<svg class="pointer-events-none absolute inset-0 h-16 w-full" style="z-index: 0;">
										{#each getApprovalTimeline(selectedRequest) as step, idx}
											{@const stepCount = getApprovalTimeline(selectedRequest).length}
											{@const isLastStep = idx === stepCount - 1}
											{@const stepWidth = 100 / stepCount}
											{@const x1 = stepWidth * (idx + 0.5)}
											{@const x2 = stepWidth * (idx + 1.5)}
											{@const y = 20}
											{@const currentStep = step}
											{@const isCurrentCompleted = currentStep.status === 'completed'}

											{#if !isLastStep}
												<line
													x1="{x1}%"
													y1={y}
													x2="{x2}%"
													y2={y}
													stroke={isCurrentCompleted ? '#ec4899' : '#e5e7eb'}
													stroke-width="2"
													stroke-linecap="round"
												/>
											{/if}
										{/each}
									</svg>

									<!-- Timeline steps -->
									<div
										class="relative flex items-start justify-between gap-1 sm:gap-2"
										style="z-index: 1;"
									>
										{#each getApprovalTimeline(selectedRequest) as step, idx}
											{@const isCompleted = step.status === 'completed'}
											{@const isPending = step.status === 'pending'}
											{@const isCancelled = step.status === 'cancelled'}
											{@const isRejected = step.status === 'rejected'}

											<div class="flex flex-1 flex-col items-center">
												<!-- Icon Circle -->
												<div class="relative mb-2 flex items-center justify-center">
													<div
														class="flex h-10 w-10 items-center justify-center rounded-full border-2 bg-white sm:h-12 sm:w-12 {isCompleted
															? 'border-pink-600'
															: isCancelled
																? 'border-slate-400'
																: isRejected
																	? 'border-red-600'
																	: 'border-gray-300'}"
													>
														{#if step.step === 'Request Submitted'}
															<FileCheck
																size={18}
																class="{isCompleted ? 'text-pink-600' : 'text-gray-400'} sm:hidden"
															/>
															<FileCheck
																size={20}
																class="{isCompleted
																	? 'text-pink-600'
																	: 'text-gray-400'} hidden sm:block"
															/>
														{:else if step.step === 'Instructor Approved' || step.step === 'Instructor Review'}
															<CheckCheck
																size={18}
																class="{isCompleted ? 'text-pink-600' : 'text-gray-400'} sm:hidden"
															/>
															<CheckCheck
																size={20}
																class="{isCompleted
																	? 'text-pink-600'
																	: 'text-gray-400'} hidden sm:block"
															/>
														{:else if step.step === 'Custodian Approved' || step.step === 'Custodian Approval'}
															<PackageCheck
																size={18}
																class="{isCompleted ? 'text-pink-600' : 'text-gray-400'} sm:hidden"
															/>
															<PackageCheck
																size={20}
																class="{isCompleted
																	? 'text-pink-600'
																	: 'text-gray-400'} hidden sm:block"
															/>
														{:else if step.step === 'Awaiting Pickup' || step.step === 'Pickup Confirmed'}
															<Truck
																size={18}
																class="{isCompleted ? 'text-pink-600' : 'text-gray-400'} sm:hidden"
															/>
															<Truck
																size={20}
																class="{isCompleted
																	? 'text-pink-600'
																	: 'text-gray-400'} hidden sm:block"
															/>
														{:else if step.step === 'Awaiting Return' || step.step === 'Returned'}
															<Home
																size={18}
																class="{isCompleted ? 'text-pink-600' : 'text-gray-400'} sm:hidden"
															/>
															<Home
																size={20}
																class="{isCompleted
																	? 'text-pink-600'
																	: 'text-gray-400'} hidden sm:block"
															/>
														{:else if step.step === 'Request Cancelled'}
															<CircleX size={18} class="text-slate-400 sm:hidden" />
															<CircleX size={20} class="hidden text-slate-400 sm:block" />
														{:else if step.step === 'Request Rejected' || step.step === 'Item Missing' || step.step === 'Item Damaged' || step.step === 'Unresolved Incidents'}
															<CircleX size={18} class="text-red-600 sm:hidden" />
															<CircleX size={20} class="hidden text-red-600 sm:block" />
														{:else}
															<Clock size={18} class="animate-pulse text-gray-400 sm:hidden" />
															<Clock
																size={20}
																class="hidden animate-pulse text-gray-400 sm:block"
															/>
														{/if}
													</div>
												</div>

												<!-- Step Label -->
												<div class="min-w-0 text-center">
													<p
														class="line-clamp-2 text-[10px] leading-tight font-semibold text-gray-900 sm:text-xs"
													>
														{step.step}
													</p>
													<p class="mt-0.5 line-clamp-1 text-[9px] text-gray-500 sm:text-xs">
														{step.by}
													</p>
													<p
														class="text-[9px] font-medium sm:text-xs {isCompleted
															? 'text-pink-600'
															: isCancelled
																? 'text-slate-500'
																: isRejected
																	? 'text-red-600'
																	: 'text-gray-400'} mt-0.5"
													>
														{#if step.date}
															{new Date(step.date).toLocaleDateString('en-US', {
																month: 'short',
																day: 'numeric'
															})}
														{:else}
															Pending
														{/if}
													</p>
												</div>
											</div>
										{/each}
									</div>
								</div>

								<!-- Status Legend -->
								<div
									class="mt-4 flex flex-wrap justify-center gap-3 border-t border-gray-200 pt-3 text-[10px] sm:text-xs"
								>
									<div class="flex items-center gap-1.5">
										<div class="h-2 w-2 rounded-full bg-pink-600"></div>
										<span class="text-gray-600">Completed</span>
									</div>
									<div class="flex items-center gap-1.5">
										<div class="h-2 w-2 rounded-full bg-gray-300"></div>
										<span class="text-gray-600">Pending</span>
									</div>
									<div class="flex items-center gap-1.5">
										<div class="h-2 w-2 rounded-full bg-red-600"></div>
										<span class="text-gray-600">Declined</span>
									</div>
									<div class="flex items-center gap-1.5">
										<div class="h-2 w-2 rounded-full bg-slate-400"></div>
										<span class="text-gray-600">Cancelled</span>
									</div>
								</div>
							</div>
						</div>

						<!-- Request Information -->
						<div>
							<h3
								class="mb-4 flex items-center gap-2 text-sm font-bold tracking-wider text-gray-900 uppercase"
							>
								<div class="h-1 w-1 rounded-full bg-pink-500"></div>
								Request Information
							</h3>
							<div class="grid grid-cols-2 gap-3 sm:gap-4">
								<div
									class="group rounded-xl border border-gray-200 bg-linear-to-br from-white to-gray-50 p-3 transition-all hover:border-pink-200 hover:shadow-md sm:p-4"
								>
									<div class="mb-2 flex items-center gap-1.5 sm:gap-2">
										<CalendarDays size={14} class="text-pink-500 sm:hidden" />
										<CalendarDays size={16} class="hidden text-pink-500 sm:block" />
										<p
											class="text-[10px] font-bold tracking-wider text-gray-500 uppercase sm:text-xs"
										>
											Request Date
										</p>
									</div>
									<p class="text-sm font-bold text-gray-900 sm:text-base">
										{new Date(selectedRequest.requestDate).toLocaleDateString('en-US', {
											month: 'short',
											day: 'numeric',
											year: 'numeric'
										})}
									</p>
								</div>
								<div
									class="group rounded-xl border border-gray-200 bg-linear-to-br from-white to-gray-50 p-3 transition-all hover:border-pink-200 hover:shadow-md sm:p-4"
								>
									<div class="mb-2 flex items-center gap-1.5 sm:gap-2">
										<CalendarDays size={14} class="text-pink-500 sm:hidden" />
										<CalendarDays size={16} class="hidden text-pink-500 sm:block" />
										<p
											class="text-[10px] font-bold tracking-wider text-gray-500 uppercase sm:text-xs"
										>
											Borrow Period
										</p>
									</div>
									<p class="text-sm font-bold text-gray-900 sm:text-base">
										{new Date(selectedRequest.borrowDate).toLocaleDateString('en-US', {
											month: 'short',
											day: 'numeric'
										})} – {new Date(selectedRequest.returnDate).toLocaleDateString('en-US', {
											month: 'short',
											day: 'numeric'
										})}
									</p>
								</div>
								<div
									class="group rounded-xl border border-gray-200 bg-linear-to-br from-white to-gray-50 p-3 transition-all hover:border-pink-200 hover:shadow-md sm:p-4"
								>
									<div class="mb-2 flex items-center gap-1.5 sm:gap-2">
										<BookOpen size={14} class="text-pink-500 sm:hidden" />
										<BookOpen size={16} class="hidden text-pink-500 sm:block" />
										<p
											class="text-[10px] font-bold tracking-wider text-gray-500 uppercase sm:text-xs"
										>
											Class Code
										</p>
									</div>
									{#if selectedRequest.classCode}
										<p class="text-sm font-bold text-gray-900 sm:text-base">
											{selectedRequest.classCode.courseCode}
										</p>
										<p class="mt-0.5 truncate text-[10px] text-gray-500 sm:text-xs">
											{selectedRequest.classCode.courseName}
										</p>
									{:else if selectedRequest.classCodeId}
										<p class="text-sm font-bold text-gray-400 sm:text-base">Loading...</p>
										<p class="mt-0.5 text-[10px] text-gray-400 sm:text-xs">
											ID: {selectedRequest.classCodeId.slice(0, 8)}
										</p>
									{:else}
										<p class="text-sm font-bold text-gray-400 sm:text-base">—</p>
									{/if}
								</div>
								<div
									class="group rounded-xl border border-gray-200 bg-linear-to-br from-white to-gray-50 p-3 transition-all hover:border-pink-200 hover:shadow-md sm:p-4"
								>
									<div class="mb-2 flex items-center gap-1.5 sm:gap-2">
										<UserCircle size={14} class="text-pink-500 sm:hidden" />
										<UserCircle size={16} class="hidden text-pink-500 sm:block" />
										<p
											class="text-[10px] font-bold tracking-wider text-gray-500 uppercase sm:text-xs"
										>
											Instructor
										</p>
									</div>
									{#if selectedRequest.instructorData}
										<div class="flex items-center gap-2.5">
											<div
												class="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-pink-100 text-xs font-semibold text-pink-700 ring-1 ring-pink-200"
											>
												{#if selectedRequest.instructorData.profilePhotoUrl}
													<img
														src={selectedRequest.instructorData.profilePhotoUrl}
														alt={selectedRequest.instructorData.fullName}
														class="h-full w-full object-cover"
														loading="lazy"
													/>
												{:else}
													{(selectedRequest.instructorData.fullName ?? 'I').charAt(0).toUpperCase()}
												{/if}
											</div>
											<p class="text-sm font-bold text-gray-900 sm:text-base">
												{selectedRequest.instructorData.fullName}
											</p>
										</div>
									{:else}
										<p class="text-sm font-bold text-gray-900 sm:text-base">
											{selectedRequest.instructor}
										</p>
									{/if}
								</div>
								{#if selectedRequest.custodianData}
									<div
										class="group rounded-xl border border-gray-200 bg-linear-to-br from-white to-gray-50 p-3 transition-all hover:border-pink-200 hover:shadow-md sm:p-4"
									>
										<div class="mb-2 flex items-center gap-1.5 sm:gap-2">
											<UserCircle size={14} class="text-pink-500 sm:hidden" />
											<UserCircle size={16} class="hidden text-pink-500 sm:block" />
											<p
												class="text-[10px] font-bold tracking-wider text-gray-500 uppercase sm:text-xs"
											>
												Custodian
											</p>
										</div>
										<div class="flex items-center gap-2.5">
											<div
												class="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-pink-100 text-xs font-semibold text-pink-700 ring-1 ring-pink-200"
											>
												{#if selectedRequest.custodianData.profilePhotoUrl}
													<img
														src={selectedRequest.custodianData.profilePhotoUrl}
														alt={selectedRequest.custodianData.fullName}
														class="h-full w-full object-cover"
														loading="lazy"
													/>
												{:else}
													{(selectedRequest.custodianData.fullName ?? 'C').charAt(0).toUpperCase()}
												{/if}
											</div>
											<p class="text-sm font-bold text-gray-900 sm:text-base">
												{selectedRequest.custodianData.fullName}
											</p>
										</div>
									</div>
								{/if}
								<div
									class="group col-span-2 rounded-xl border border-gray-200 bg-linear-to-br from-white to-gray-50 p-3 transition-all hover:border-pink-200 hover:shadow-md sm:p-4"
								>
									<div class="mb-2 flex items-center gap-1.5 sm:gap-2">
										<FileText size={14} class="text-pink-500 sm:hidden" />
										<FileText size={16} class="hidden text-pink-500 sm:block" />
										<p
											class="text-[10px] font-bold tracking-wider text-gray-500 uppercase sm:text-xs"
										>
											Purpose
										</p>
									</div>
									<p class="text-sm font-bold text-gray-900 sm:text-base">
										{selectedRequest.purpose}
									</p>
								</div>
							</div>
						</div>

						<!-- Requested Items -->
						<div>
							<h3
								class="mb-4 flex items-center gap-2 text-sm font-bold tracking-wider text-gray-900 uppercase"
							>
								<div class="h-1 w-1 rounded-full bg-pink-500"></div>
								Requested Items
							</h3>
							<div class="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
								<!-- Desktop Table Header -->
								<div
									class="hidden grid-cols-12 border-b border-gray-200 bg-gray-50 px-4 py-2.5 text-[11px] font-semibold tracking-wide text-gray-500 uppercase sm:grid"
								>
									<span class="col-span-8">Item</span>
									<span class="col-span-2 text-center">Code</span>
									<span class="col-span-2 text-center">Qty</span>
								</div>

								<!-- Table Rows -->
								<div class="divide-y divide-gray-100">
									{#each selectedRequest.items as item}
										{@const pic = item.picture ?? itemPictureCache.get(item.itemId)}
										{@const code =
											item.code ?? (item.itemId ? item.itemId.slice(-6).toUpperCase() : 'N/A')}
										<div
											class="grid items-center gap-3 bg-white p-3 transition-colors hover:bg-gray-50/50 sm:grid-cols-12 sm:p-4"
										>
											<!-- Item Info -->
											<div class="col-span-12 flex min-w-0 items-center gap-3 sm:col-span-8">
												{#if pic}
													<img
														src={pic}
														alt={item.name}
														class="h-10 w-10 shrink-0 rounded-lg object-cover ring-1 ring-gray-200"
														loading="lazy"
													/>
												{:else}
													<div
														class="h-10 w-10 shrink-0 overflow-hidden rounded-lg ring-1 ring-gray-200"
													>
														<ItemImagePlaceholder size="sm" />
													</div>
												{/if}
												<div class="flex min-w-0 flex-col gap-1">
													<span class="truncate text-sm font-semibold text-gray-900"
														>{item.name}</span
													>

													{#if item.inspection}
														{@const isGood = item.inspection.status === 'good'}
														{@const isDamaged = item.inspection.status === 'damaged'}
														{@const isMissing = item.inspection.status === 'missing'}
														<div class="mt-0.5 flex flex-wrap items-center gap-1.5">
															{#if isGood}
																<span
																	class="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-1.5 py-0.5 text-[9px] font-bold text-emerald-700 ring-1 ring-emerald-200/50"
																>
																	<span class="h-1 w-1 rounded-full bg-emerald-500"></span>
																	Good
																</span>
															{/if}
															{#if isDamaged}
																<span
																	class="inline-flex items-center gap-1 rounded-md bg-amber-50 px-1.5 py-0.5 text-[9px] font-bold text-amber-700 ring-1 ring-amber-200/50"
																>
																	<span class="h-1 w-1 rounded-full bg-amber-500"></span>
																	Damaged
																</span>
															{/if}
															{#if isMissing}
																<span
																	class="inline-flex items-center gap-1 rounded-md bg-rose-50 px-1.5 py-0.5 text-[9px] font-bold text-rose-700 ring-1 ring-rose-200/50"
																>
																	<span class="h-1 w-1 rounded-full bg-rose-500"></span>
																	Missing
																</span>
															{/if}
														</div>
													{/if}
												</div>
											</div>

											<!-- Mobile/Desktop Details -->
											<div
												class="col-span-6 flex items-center justify-between border-t border-gray-100 pt-3 sm:col-span-2 sm:justify-center sm:border-0 sm:pt-0"
											>
												<span class="text-[10px] font-semibold text-gray-500 uppercase sm:hidden"
													>Code</span
												>
												<span class="font-mono text-sm font-medium text-gray-600">{code}</span>
											</div>
											<div
												class="col-span-6 flex items-center justify-between border-t border-l border-gray-100 pt-3 pl-3 sm:col-span-2 sm:justify-center sm:border-0 sm:pt-0 sm:pl-0"
											>
												<span class="text-[10px] font-semibold text-gray-500 uppercase sm:hidden"
													>Qty</span
												>
												<span class="text-sm font-bold text-gray-900 tabular-nums"
													>{item.quantity}</span
												>
											</div>
										</div>
									{/each}
								</div>
							</div>
						</div>

						<!-- Replacement Obligations Table -->
						{#if selectedRequest.items.some((item: any) => item.inspection && (item.inspection.replacementQuantity || 0) > 0)}
							<div class="animate-fadeIn mt-8">
								<h3
									class="mb-4 flex items-center gap-2 text-sm font-bold tracking-wider text-gray-900 uppercase"
								>
									<div class="h-1 w-1 rounded-full bg-amber-500"></div>
									Replacement Obligations
								</h3>
								<div class="overflow-hidden rounded-xl border border-amber-200 bg-white shadow-sm">
									<!-- Desktop Table Header -->
									<div
										class="hidden grid-cols-12 border-b border-amber-100 bg-amber-50/50 px-4 py-2.5 text-[11px] font-semibold tracking-wide text-amber-900 uppercase sm:grid"
									>
										<span class="col-span-6">Item to Replace</span>
										<span class="col-span-3 text-center">Qty Required</span>
										<span class="col-span-3 text-right">Due Date</span>
									</div>

									<!-- Table Rows -->
									<div class="divide-y divide-amber-100/50">
										{#each selectedRequest.items.filter((item: any) => item.inspection && (item.inspection.replacementQuantity || 0) > 0) as item}
											{@const pic = item.picture ?? itemPictureCache.get(item.itemId)}
											{@const code =
												item.code ?? (item.itemId ? item.itemId.slice(-6).toUpperCase() : 'N/A')}
											<div
												class="grid items-center gap-3 bg-white p-3 transition-colors hover:bg-amber-50/30 sm:grid-cols-12 sm:p-4"
											>
												<div class="col-span-12 flex min-w-0 items-center gap-3 sm:col-span-6">
													{#if pic}
														<img
															src={pic}
															alt={item.name}
															class="h-10 w-10 shrink-0 rounded-lg object-cover ring-1 ring-amber-200/50"
															loading="lazy"
														/>
													{:else}
														<div
															class="h-10 w-10 shrink-0 overflow-hidden rounded-lg text-amber-500/50 ring-1 ring-amber-200/50"
														>
															<ItemImagePlaceholder size="sm" />
														</div>
													{/if}
													<div class="flex min-w-0 flex-col gap-1">
														<span class="truncate text-sm font-semibold text-gray-900"
															>{item.name}</span
														>
														<span class="text-[10px] font-semibold text-amber-600/80 uppercase"
															>{code}</span
														>
														{#if item.inspection?.notes?.replace(/^\[Unit breakdown:[^\]]+\]\s*/i, '')}
															<span
																class="text-amber-855 border-amber-250/30 mt-1 w-fit max-w-full rounded-lg border bg-amber-50/50 px-2.5 py-1 text-[11px] leading-relaxed font-medium shadow-xs"
															>
																<span class="text-amber-955 font-bold">Note:</span>
																{item.inspection.notes.replace(
																	/^\[Unit breakdown:[^\]]+\]\s*/i,
																	''
																)}
															</span>
														{/if}
													</div>
												</div>
												<div
													class="col-span-6 flex items-center justify-between border-t border-amber-100/50 pt-3 sm:col-span-3 sm:justify-center sm:border-0 sm:pt-0"
												>
													<span class="text-[10px] font-semibold text-amber-800 uppercase sm:hidden"
														>Qty Required</span
													>
													<span class="text-sm font-bold text-amber-700 tabular-nums"
														>{item.inspection.replacementQuantity}</span
													>
												</div>
												<div
													class="col-span-6 flex items-center justify-between border-t border-l border-amber-100/50 pt-3 pl-3 sm:col-span-3 sm:justify-end sm:border-0 sm:pt-0 sm:pl-0"
												>
													<span class="text-[10px] font-semibold text-amber-800 uppercase sm:hidden"
														>Due Date</span
													>
													<span class="text-xs font-semibold text-gray-700">
														{item.inspection.dueDate
															? new Date(item.inspection.dueDate).toLocaleDateString('en-US', {
																	month: 'short',
																	day: 'numeric',
																	year: 'numeric'
																})
															: 'Not set'}
													</span>
												</div>
											</div>
										{/each}
									</div>
								</div>
							</div>
						{/if}

						<!-- Decline Reason -->
						{#if selectedRequest.status === 'rejected' && selectedRequest.rejectionReason}
							<div
								class="rounded-2xl border-2 border-red-200 bg-linear-to-br from-red-50 to-red-100/50 p-5"
							>
								<div class="flex gap-3">
									<div
										class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-500"
									>
										<CircleAlert size={20} class="text-white" />
									</div>
									<div class="min-w-0 flex-1">
										<p class="text-sm font-bold text-red-900">Decline Reason</p>
										<p class="mt-1.5 text-sm leading-relaxed text-red-800">
											{selectedRequest.rejectionReason}
										</p>
									</div>
								</div>
							</div>
						{/if}

						<!-- Appeal Submitted Banner -->
						{#if selectedRequest.status === 'appealed' && selectedRequest.appealReason}
							<div
								class="rounded-2xl border-2 border-violet-200 bg-linear-to-br from-violet-50 to-violet-100/50 p-5"
							>
								<div class="flex gap-3">
									<div
										class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-500"
									>
										<RotateCcw size={20} class="text-white" />
									</div>
									<div class="min-w-0 flex-1">
										<p class="text-sm font-bold text-violet-900">Appeal Submitted</p>
										<p class="mt-0.5 text-xs text-violet-700">
											Your appeal is under instructor review.
										</p>
										<p class="mt-2 text-sm leading-relaxed text-violet-800">
											{selectedRequest.appealReason}
										</p>
									</div>
								</div>
							</div>
						{/if}
					</div>
				</div>

				<!-- Footer -->
				{#if !(selectedRequest.status === 'missing' || selectedRequest.items?.some((item: any) => item.inspection?.status === 'missing' || item.inspection?.status === 'damaged'))}
					<div
						class="safe-area-bottom sticky bottom-0 border-t border-gray-200 bg-white/95 px-4 py-3.5 backdrop-blur-sm sm:px-8 sm:py-4"
					>
						<div
							class="flex flex-col items-stretch justify-end gap-2 sm:flex-row sm:items-center sm:gap-3"
						>
							{#if selectedRequest.status === 'returned' || selectedRequest.status === 'resolved'}
								<div
									class="animate-fadeIn flex flex-1 items-center gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs text-emerald-700"
								>
									<CheckCircle2 size={14} class="shrink-0 text-emerald-400" />
									<span>This request has been successfully returned and resolved. Thank you!</span>
								</div>
							{:else if selectedRequest.status === 'cancelled'}
								<div
									class="animate-fadeIn flex flex-1 items-center gap-2.5 rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-xs text-gray-600"
								>
									<Info size={14} class="shrink-0 text-gray-400" />
									<span>This request was cancelled.</span>
								</div>
							{:else if selectedRequest.status === 'rejected'}
								<div
									class="animate-fadeIn flex-1 rounded-xl border border-pink-200 bg-pink-50 px-4 py-2.5 text-xs text-pink-700"
								>
									<div class="flex items-center gap-2">
										<Info size={14} class="shrink-0 text-pink-400" />
										<span>This request was rejected by your instructor.</span>
									</div>
								</div>
							{/if}
							<button
								onclick={closeDetailModal}
								class="shrink-0 rounded-xl bg-linear-to-r from-gray-900 to-gray-800 px-5 py-2.5 text-sm font-bold text-white shadow-sm transition-all hover:from-gray-800 hover:to-gray-700 active:scale-[0.98] sm:px-6 sm:py-3"
							>
								Close
							</button>
						</div>
					</div>
				{/if}
			</div>
		</div>
	</div>
{/if}
