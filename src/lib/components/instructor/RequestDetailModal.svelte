<script lang="ts">
import ItemImagePlaceholder from '$lib/components/ui/ItemImagePlaceholder.svelte';
import type { ClassCodeResponse } from '$lib/api/classCodes';
import type { BorrowRequestStatus } from '$lib/api/borrowRequests';

interface Props {
	request: any;
	itemPictureCache: Map<string, string>;
	classCodeCache: Map<string, ClassCodeResponse>;
	isActionInFlight: (rawId: string) => boolean;
	bulkActionInFlight: boolean;
	onClose: () => void;
	onApprove: (rawId: string) => void;
	onReject: (rawId: string) => void;
	getStatusLabel: (status: string, rawStatus?: BorrowRequestStatus, rejectionReason?: string) => string;
	getStatusColor: (status: string, rawStatus?: BorrowRequestStatus, rejectionReason?: string) => string;
}

let {
	request,
	itemPictureCache,
	classCodeCache,
	isActionInFlight,
	bulkActionInFlight,
	onClose,
	onApprove,
	onReject,
	getStatusLabel,
	getStatusColor
}: Props = $props();
</script>

<div class="fixed inset-0 z-50 overflow-y-auto">
	<button type="button" class="fixed inset-0 bg-black/40 backdrop-blur-sm transition-opacity" onclick={onClose} aria-label="Close modal" tabindex="-1"></button>
	<div class="flex min-h-full items-end justify-center sm:items-center sm:p-4">
		<div class="relative w-full max-w-4xl rounded-t-3xl sm:rounded-3xl bg-white shadow-2xl animate-scaleIn overflow-hidden">
			
			<!-- Header -->
			<div class="sticky top-0 z-10 border-b border-gray-200 bg-white/95 backdrop-blur-sm px-4 py-4 sm:px-8 sm:py-6">
				<div class="flex items-start justify-between gap-3">
					<div class="flex items-start gap-3 min-w-0 flex-1">
						<div class="flex h-10 w-10 sm:h-12 sm:w-12 shrink-0 items-center justify-center rounded-2xl bg-linear-to-br from-pink-500 to-pink-600 shadow-lg shadow-pink-500/30">
							<svg class="h-5 w-5 text-white sm:h-6 sm:w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
							</svg>
						</div>
						<div class="min-w-0 flex-1">
							<h2 class="text-lg sm:text-xl md:text-2xl font-bold text-gray-900">Request Details</h2>
							<p class="mt-0.5 font-mono text-xs sm:text-sm font-semibold text-pink-600">{request.id}</p>
							<div class="mt-2 inline-flex items-center gap-2 rounded-full px-2.5 py-1 sm:px-3 sm:py-1.5 {getStatusColor(request.status, request.rawStatus, request.rejectionReason)} shadow-sm ring-1 ring-black/5">
								<span class="h-1.5 w-1.5 rounded-full bg-current"></span>
								<span class="text-[10px] sm:text-xs font-bold">{getStatusLabel(request.status, request.rawStatus, request.rejectionReason)}</span>
							</div>
						</div>
					</div>
					<button 
						onclick={onClose}
						aria-label="Close modal"
						class="rounded-xl p-2 sm:p-2.5 text-gray-400 transition-all hover:bg-gray-100 hover:text-gray-600 active:scale-95"
					>
						<svg class="h-5 w-5 sm:h-6 sm:w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
						</svg>
					</button>
				</div>
			</div>
			
			<!-- Content -->
			<div class="max-h-[70vh] overflow-y-auto px-4 py-5 sm:px-8 sm:py-8">
				<div class="space-y-6 sm:space-y-8">
					
					<!-- Student Information -->
					<div>
						<h3 class="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-gray-900">
							<div class="h-1 w-1 rounded-full bg-pink-500"></div>
							Student Information
						</h3>
						<div class="rounded-2xl border border-gray-200 bg-linear-to-br from-white to-gray-50 p-4 sm:p-5">
							<div class="flex items-center gap-4">
								<div class="flex h-14 w-14 sm:h-16 sm:w-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-pink-100 text-lg sm:text-xl font-semibold text-pink-700 ring-2 ring-pink-200">
									{#if request.student.avatarUrl}
										<img
											src={request.student.avatarUrl}
											alt={request.student.name}
											class="h-full w-full object-cover"
											loading="lazy"
										/>
									{:else}
										{request.student.avatar}
									{/if}
								</div>
								<div class="min-w-0 flex-1">
									<p class="text-base sm:text-lg font-bold text-gray-900">{request.student.name}</p>
									<p class="text-xs sm:text-sm text-gray-600 mt-0.5">{request.student.yearLevel} • Block {request.student.block}</p>
									<div class="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
										<span class="font-mono">ID: {request.student.studentId}</span>
										<span>•</span>
										<span class="truncate">{request.student.email}</span>
									</div>
								</div>
							</div>
						</div>
					</div>

					<!-- Request Information -->
					<div>
						<h3 class="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-gray-900">
							<div class="h-1 w-1 rounded-full bg-pink-500"></div>
							Request Information
						</h3>
						<div class="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
							<div class="group rounded-xl border border-gray-200 bg-linear-to-br from-white to-gray-50 p-3 sm:p-4 transition-all hover:border-pink-200 hover:shadow-md">
								<div class="flex items-center gap-1.5 sm:gap-2 mb-2">
									<svg class="h-3.5 w-3.5 sm:h-4 sm:w-4 text-pink-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
									</svg>
									<p class="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-gray-500">Request Date</p>
								</div>
								<p class="text-sm sm:text-base font-bold text-gray-900">{new Date(request.requestDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
							</div>
							<div class="group rounded-xl border border-gray-200 bg-linear-to-br from-white to-gray-50 p-3 sm:p-4 transition-all hover:border-pink-200 hover:shadow-md">
								<div class="flex items-center gap-1.5 sm:gap-2 mb-2">
									<svg class="h-3.5 w-3.5 sm:h-4 sm:w-4 text-pink-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
									</svg>
									<p class="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-gray-500">Borrow Period</p>
								</div>
								<p class="text-sm sm:text-base font-bold text-gray-900">
									{new Date(request.borrowDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – {new Date(request.returnDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
								</p>
							</div>
							<div class="group rounded-xl border border-gray-200 bg-linear-to-br from-white to-gray-50 p-3 sm:p-4 transition-all hover:border-pink-200 hover:shadow-md">
								<div class="flex items-center gap-1.5 sm:gap-2 mb-2">
									<svg class="h-3.5 w-3.5 sm:h-4 sm:w-4 text-pink-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/>
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/>
									</svg>
									<p class="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-gray-500">Usage Location</p>
								</div>
								<p class="text-sm sm:text-base font-bold text-gray-900">
									{#if request.usageLocation === 'school'}
										<span class="inline-flex items-center gap-1.5">
											<span class="h-2 w-2 rounded-full bg-green-500"></span>
											In-School Use
										</span>
									{:else if request.usageLocation === 'outdoor'}
										<span class="inline-flex items-center gap-1.5">
											<span class="h-2 w-2 rounded-full bg-blue-500"></span>
											Outdoor/Off-Campus
										</span>
									{:else}
										<span class="text-gray-400">Not specified</span>
									{/if}
								</p>
							</div>
							<div class="group rounded-xl border border-gray-200 bg-linear-to-br from-white to-gray-50 p-3 sm:p-4 transition-all hover:border-pink-200 hover:shadow-md">
								<div class="flex items-center gap-1.5 sm:gap-2 mb-2">
									<svg class="h-3.5 w-3.5 sm:h-4 sm:w-4 text-pink-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/>
									</svg>
									<p class="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-gray-500">Class Code</p>
								</div>
								{#if request.classCodeId}
									{@const classCode = classCodeCache.get(request.classCodeId)}
									{#if classCode}
										<p class="text-sm sm:text-base font-bold text-gray-900">{classCode.courseCode}</p>
										<p class="text-xs text-gray-600 mt-1">{classCode.courseName}</p>
										<p class="text-xs text-gray-500 mt-0.5">{classCode.semester} {classCode.academicYear}</p>
									{:else}
										<p class="text-sm sm:text-base font-bold text-gray-900">{request.classCodeId.slice(-8).toUpperCase()}</p>
									{/if}
								{:else}
									<p class="text-sm sm:text-base font-medium text-gray-400">Not specified</p>
								{/if}
							</div>
							<div class="group rounded-xl border border-gray-200 bg-linear-to-br from-white to-gray-50 p-3 sm:p-4 transition-all hover:border-pink-200 hover:shadow-md col-span-1 sm:col-span-2">
								<div class="flex items-center gap-1.5 sm:gap-2 mb-2">
									<svg class="h-3.5 w-3.5 sm:h-4 sm:w-4 text-pink-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z"/>
									</svg>
									<p class="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-gray-500">Purpose & Details</p>
								</div>
								<p class="text-sm sm:text-base font-semibold text-gray-900 leading-relaxed">{request.purpose}</p>
							</div>
							{#if request.approvedBy}
								<div class="group rounded-xl border border-gray-200 bg-linear-to-br from-white to-gray-50 p-3 sm:p-4 transition-all hover:border-pink-200 hover:shadow-md col-span-1 sm:col-span-2">
									<div class="flex items-center gap-1.5 sm:gap-2 mb-2">
										<svg class="h-3.5 w-3.5 sm:h-4 sm:w-4 text-pink-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
											<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
										</svg>
										<p class="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-gray-500">Approved By</p>
									</div>
									<p class="text-sm sm:text-base font-bold text-gray-900">{request.approvedBy}</p>
									{#if request.approvedDate}
										<p class="text-xs text-gray-500 mt-1">Approved on {request.approvedDate}</p>
									{/if}
								</div>
							{/if}
						</div>
					</div>

					<!-- Requested Items -->
					<div>
						<h3 class="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-gray-900">
							<div class="h-1 w-1 rounded-full bg-pink-500"></div>
							Requested Items
						</h3>
						<div class="grid gap-3 sm:grid-cols-2">
							{#each request.items as item}
								{@const pic = item.picture ?? itemPictureCache.get(item.itemId)}
								<div class="group flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-3 transition-all hover:border-pink-200 hover:shadow-md">
									{#if pic}
										<img src={pic} alt={item.name} class="h-12 w-12 rounded-lg object-cover shrink-0 ring-1 ring-gray-100" loading="lazy" />
									{:else}
										<div class="h-12 w-12 shrink-0 overflow-hidden rounded-lg ring-1 ring-gray-100">
											<ItemImagePlaceholder size="sm" />
										</div>
									{/if}
									<div class="min-w-0 flex-1">
										<p class="text-sm font-semibold text-gray-900 group-hover:text-pink-600 transition-colors truncate">{item.name}</p>
										<p class="text-xs text-gray-500 mt-0.5">Code: {item.code} • Qty: {item.quantity}</p>
									</div>
								</div>
							{/each}
						</div>
					</div>
				</div>
			</div>
			
			<!-- Footer -->
			<div class="sticky bottom-0 border-t border-gray-200 bg-white/95 backdrop-blur-sm px-4 py-3 sm:px-8 sm:py-4">
				{#if request.status === 'pending'}
					<div class="flex items-center justify-end gap-3">
						<button
							onclick={() => onReject(request.rawId)}
							disabled={isActionInFlight(request.rawId) || bulkActionInFlight}
							class="rounded-xl border-2 border-red-200 bg-white px-5 py-2.5 sm:px-6 sm:py-3 text-sm font-bold text-red-600 shadow-sm transition-all hover:bg-red-50 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
						>
							Reject Request
						</button>
						<button
							onclick={() => onApprove(request.rawId)}
							disabled={isActionInFlight(request.rawId) || bulkActionInFlight}
							class="rounded-xl bg-linear-to-r from-green-600 to-green-700 px-5 py-2.5 sm:px-6 sm:py-3 text-sm font-bold text-white shadow-sm transition-all hover:from-green-700 hover:to-green-800 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
						>
							{isActionInFlight(request.rawId) ? 'Approving…' : 'Approve Request'}
						</button>
					</div>
				{/if}
			</div>
		</div>
	</div>
</div>
