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
									{#if request.instructorData}
										<div class="flex items-center gap-2.5">
											<div class="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-pink-100 text-xs font-semibold text-pink-700 ring-1 ring-pink-200">
												{#if request.instructorData.profilePhotoUrl}
													<img src={request.instructorData.profilePhotoUrl} alt={request.instructorData.fullName} class="h-full w-full object-cover" loading="lazy" />
												{:else}
													{(request.instructorData.fullName ?? 'I').charAt(0).toUpperCase()}
												{/if}
											</div>
											<div>
												<p class="text-sm sm:text-base font-bold text-gray-900">{request.instructorData.fullName}</p>
												{#if request.approvedDate}
													<p class="text-xs text-gray-500 mt-0.5">Approved on {request.approvedDate}</p>
												{/if}
											</div>
										</div>
									{:else}
										<p class="text-sm sm:text-base font-bold text-gray-900">{request.approvedBy}</p>
										{#if request.approvedDate}
											<p class="text-xs text-gray-500 mt-1">Approved on {request.approvedDate}</p>
										{/if}
									{/if}
								</div>
							{/if}
							{#if request.custodianData}
								<div class="group rounded-xl border border-gray-200 bg-linear-to-br from-white to-gray-50 p-3 sm:p-4 transition-all hover:border-pink-200 hover:shadow-md col-span-1 sm:col-span-2">
									<div class="flex items-center gap-1.5 sm:gap-2 mb-2">
										<svg class="h-3.5 w-3.5 sm:h-4 sm:w-4 text-pink-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
											<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
										</svg>
										<p class="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-gray-500">Custodian</p>
									</div>
									<div class="flex items-center gap-2.5">
										<div class="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-pink-100 text-xs font-semibold text-pink-700 ring-1 ring-pink-200">
											{#if request.custodianData.profilePhotoUrl}
												<img src={request.custodianData.profilePhotoUrl} alt={request.custodianData.fullName} class="h-full w-full object-cover" loading="lazy" />
											{:else}
												{(request.custodianData.fullName ?? 'C').charAt(0).toUpperCase()}
											{/if}
										</div>
										<p class="text-sm sm:text-base font-bold text-gray-900">{request.custodianData.fullName}</p>
									</div>
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
						<div class="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
							<!-- Desktop Table Header -->
							<div class="hidden sm:grid grid-cols-12 border-b border-gray-200 bg-gray-50 px-4 py-2.5 text-[11px] font-semibold tracking-wide text-gray-500 uppercase">
								<span class="col-span-8">Item</span>
								<span class="col-span-2 text-center">Code</span>
								<span class="col-span-2 text-center">Qty</span>
							</div>
							
							<!-- Table Rows -->
							<div class="divide-y divide-gray-100">
								{#each request.items as item}
									{@const pic = item.picture ?? itemPictureCache.get(item.itemId)}
									<div class="grid items-center gap-3 bg-white p-3 sm:grid-cols-12 sm:p-4 transition-colors hover:bg-gray-50/50">
										<!-- Item Info -->
										<div class="col-span-12 flex items-center gap-3 sm:col-span-8 min-w-0">
											{#if pic}
												<img
													src={pic}
													alt={item.name}
													class="h-10 w-10 shrink-0 rounded-lg object-cover ring-1 ring-gray-200"
													loading="lazy"
												/>
											{:else}
												<div class="h-10 w-10 shrink-0 overflow-hidden rounded-lg ring-1 ring-gray-200">
													<ItemImagePlaceholder size="sm" />
												</div>
											{/if}
											<div class="flex flex-col gap-1 min-w-0">
												<span class="truncate text-sm font-semibold text-gray-900">{item.name}</span>
											</div>
										</div>
										
										<!-- Mobile/Desktop Details -->
										<div class="col-span-6 flex items-center justify-between sm:col-span-2 sm:justify-center border-t border-gray-100 pt-3 sm:border-0 sm:pt-0">
											<span class="text-[10px] font-semibold text-gray-500 uppercase sm:hidden">Code</span>
											<span class="font-mono text-sm font-medium text-gray-600">{item.code}</span>
										</div>
										<div class="col-span-6 flex items-center justify-between sm:col-span-2 sm:justify-center border-t border-gray-100 pt-3 sm:border-0 sm:pt-0 border-l border-gray-100 pl-3 sm:border-0 sm:pl-0">
											<span class="text-[10px] font-semibold text-gray-500 uppercase sm:hidden">Qty</span>
											<span class="text-sm font-bold text-gray-900 tabular-nums">{item.quantity}</span>
										</div>
									</div>
								{/each}
							</div>
						</div>

						<!-- Replacement Obligations Table -->
						{#if request.items.some((item: any) => item.inspection && (item.inspection.replacementQuantity || 0) > 0)}
							<div class="mt-8 animate-fadeIn">
								<h3 class="mb-4 flex items-center gap-2 text-sm font-bold tracking-wider text-gray-900 uppercase">
									<div class="h-1 w-1 rounded-full bg-amber-500"></div>
									Replacement Obligations
								</h3>
								<div class="overflow-hidden rounded-xl border border-amber-200 bg-white shadow-sm">
									<!-- Desktop Table Header -->
									<div class="hidden sm:grid grid-cols-12 border-b border-amber-100 bg-amber-50/50 px-4 py-2.5 text-[11px] font-semibold tracking-wide text-amber-900 uppercase">
										<span class="col-span-6">Item to Replace</span>
										<span class="col-span-3 text-center">Qty Required</span>
										<span class="col-span-3 text-right">Due Date</span>
									</div>
									
									<!-- Table Rows -->
									<div class="divide-y divide-amber-100/50">
										{#each request.items.filter((item: any) => item.inspection && (item.inspection.replacementQuantity || 0) > 0) as item}
											{@const pic = item.picture ?? itemPictureCache.get(item.itemId)}
											{@const code = item.code ?? (item.itemId ? item.itemId.slice(-6).toUpperCase() : 'N/A')}
											<div class="grid items-center gap-3 bg-white p-3 sm:grid-cols-12 sm:p-4 hover:bg-amber-50/30 transition-colors">
												<div class="col-span-12 flex items-center gap-3 sm:col-span-6 min-w-0">
													{#if pic}
														<img src={pic} alt={item.name} class="h-10 w-10 shrink-0 rounded-lg object-cover ring-1 ring-amber-200/50" loading="lazy" />
													{:else}
														<div class="h-10 w-10 shrink-0 overflow-hidden rounded-lg ring-1 ring-amber-200/50 text-amber-500/50">
															<ItemImagePlaceholder size="sm" />
														</div>
													{/if}
													<div class="flex flex-col gap-1 min-w-0">
														<span class="truncate text-sm font-semibold text-gray-900">{item.name}</span>
														<span class="text-[10px] font-semibold text-amber-600/80 uppercase">{code}</span>
														{#if item.inspection?.notes?.replace(/^\[Unit breakdown:[^\]]+\]\s*/i, '')}
															<span class="text-[11px] leading-relaxed text-amber-855 bg-amber-50/50 border border-amber-250/30 rounded-lg px-2.5 py-1 mt-1 font-medium w-fit max-w-full shadow-xs">
																<span class="font-bold text-amber-955">Note:</span> {item.inspection.notes.replace(/^\[Unit breakdown:[^\]]+\]\s*/i, '')}
															</span>
														{/if}
													</div>
												</div>
												<div class="col-span-6 flex items-center justify-between sm:col-span-3 sm:justify-center border-t border-amber-100/50 pt-3 sm:border-0 sm:pt-0">
													<span class="text-[10px] font-semibold text-amber-800 uppercase sm:hidden">Qty Required</span>
													<span class="text-sm font-bold text-amber-700 tabular-nums">{item.inspection.replacementQuantity}</span>
												</div>
												<div class="col-span-6 flex items-center justify-between sm:col-span-3 sm:justify-end border-t border-amber-100/50 pt-3 sm:border-0 sm:pt-0 border-l border-amber-100/50 pl-3 sm:border-0 sm:pl-0">
													<span class="text-[10px] font-semibold text-amber-800 uppercase sm:hidden">Due Date</span>
													<span class="text-xs font-semibold text-gray-700">
														{item.inspection.dueDate ? new Date(item.inspection.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Not set'}
													</span>
												</div>
											</div>
										{/each}
									</div>
								</div>
							</div>
						{/if}
					</div>

					<!-- Appeal Information (shown when request is a student appeal) -->
					{#if request.isAppeal && request.appealReason}
						<div>
							<h3 class="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-gray-900">
								<div class="h-1 w-1 rounded-full bg-violet-500"></div>
								Student Appeal
							</h3>
							<!-- Original Decline Reason -->
							{#if request.rejectionReason}
								<div class="mb-3 rounded-xl border border-red-200 bg-red-50 p-4">
									<p class="mb-1.5 text-xs font-semibold uppercase tracking-wide text-red-700">Original Decline Reason</p>
									<p class="text-sm text-red-800">{request.rejectionReason}</p>
								</div>
							{/if}
							<!-- Appeal reason -->
							<div class="rounded-xl border-2 border-violet-200 bg-linear-to-br from-violet-50 to-violet-100/50 p-4 sm:p-5">
								<div class="flex gap-3">
									<div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-500">
										<svg class="h-4 w-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
											<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
										</svg>
									</div>
									<div class="min-w-0 flex-1">
										<p class="text-sm font-bold text-violet-900">Student's Appeal Reason</p>
										<p class="mt-1.5 text-sm leading-relaxed text-violet-800">{request.appealReason}</p>
									</div>
								</div>
							</div>
						</div>
					{/if}
				</div>
			</div>
			
			<!-- Footer -->
			<div class="sticky bottom-0 border-t border-gray-200 bg-white/95 backdrop-blur-sm px-4 py-3 sm:px-8 sm:py-4">
				{#if request.status === 'pending' || request.isAppeal}
					<div class="flex items-center justify-between gap-3">
						<div class="min-w-0">
							{#if request.isAppeal}
								<p class="text-xs font-semibold text-violet-700">
									⚠ This is a student appeal — review the appeal reason before deciding.
								</p>
							{/if}
						</div>
						<div class="flex shrink-0 items-center gap-3">
							<button
								onclick={() => onReject(request.rawId)}
								disabled={isActionInFlight(request.rawId) || bulkActionInFlight}
								class="rounded-xl border-2 border-red-200 bg-white px-5 py-2.5 sm:px-6 sm:py-3 text-sm font-bold text-red-600 shadow-sm transition-all hover:bg-red-50 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
							>
								{request.isAppeal ? 'Uphold Decline' : 'Decline Request'}
							</button>
							<button
								onclick={() => onApprove(request.rawId)}
								disabled={isActionInFlight(request.rawId) || bulkActionInFlight}
								class="rounded-xl bg-linear-to-r from-green-600 to-green-700 px-5 py-2.5 sm:px-6 sm:py-3 text-sm font-bold text-white shadow-sm transition-all hover:from-green-700 hover:to-green-800 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
							>
								{#if isActionInFlight(request.rawId)}
									Approving…
								{:else if request.isAppeal}
									Approve Appeal
								{:else}
									Approve Request
								{/if}
							</button>
						</div>
					</div>
				{/if}
			</div>
		</div>
	</div>
</div>


