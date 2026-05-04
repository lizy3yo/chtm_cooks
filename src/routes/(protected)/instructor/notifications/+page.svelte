<script lang="ts">
	import { goto } from '$app/navigation';
	import { Bell, CheckCheck } from 'lucide-svelte';
	import { notificationsAPI, type NotificationRecord } from '$lib/api/notifications';
	import Pagination from '$lib/components/ui/Pagination.svelte';

	const PAGE_SIZE = 10;

	let notifications = $state<NotificationRecord[]>([]);
	let unreadCount = $state(0);
	let loading = $state(true);
	let currentPage = $state(1);
	let filter = $state<'all' | 'unread'>('all');

	const filteredNotifications = $derived(
		filter === 'all' ? notifications : notifications.filter((n) => !n.isRead)
	);
	const totalPages = $derived(Math.max(1, Math.ceil(filteredNotifications.length / PAGE_SIZE)));
	const pagedNotifications = $derived(
		filteredNotifications.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)
	);

	function formatDate(value: string): string {
		return new Date(value).toLocaleString('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric',
			hour: 'numeric',
			minute: '2-digit',
			hour12: true
		});
	}

	function getInitials(name?: string): string {
		if (!name) return '??';
		return name
			.split(' ')
			.filter(Boolean)
			.slice(0, 2)
			.map((part) => part[0]?.toUpperCase() || '')
			.join('');
	}

	async function loadNotifications() {
		loading = true;
		try {
			const data = await notificationsAPI.list(200, 0);
			notifications = data.notifications;
			unreadCount = data.unreadCount;
			currentPage = 1;
		} finally {
			loading = false;
		}
	}

	async function markAllAsRead() {
		if (unreadCount === 0) return;
		await notificationsAPI.markAllAsRead();
		await loadNotifications();
	}

	async function openNotification(notification: NotificationRecord) {
		if (!notification.isRead) {
			await notificationsAPI.markAsRead(notification.id);
		}
		if (notification.link) {
			await goto(notification.link);
			return;
		}
		await loadNotifications();
	}

	$effect(() => {
		void loadNotifications();
	});
</script>

<svelte:head>
	<title>Notifications - Instructor Portal</title>
</svelte:head>

<div class="space-y-6">
	<div class="border-b border-gray-200 pb-5">
		<h1 class="text-3xl font-bold text-gray-900">Notifications</h1>
		<p class="mt-2 text-sm text-gray-600">Track request reviews, approvals, and downstream outcomes</p>
	</div>

	<div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
		<div class="flex items-center gap-1 rounded-lg bg-gray-100/80 p-1">
			<button
				type="button"
				onclick={() => { filter = 'all'; currentPage = 1; }}
				class="flex items-center gap-2 rounded-md px-4 py-1.5 text-sm font-medium transition-all {filter === 'all' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'}"
			>
				All
			</button>
			<button
				type="button"
				onclick={() => { filter = 'unread'; currentPage = 1; }}
				class="flex items-center gap-2 rounded-md px-4 py-1.5 text-sm font-medium transition-all {filter === 'unread' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'}"
			>
				Unread
				{#if unreadCount > 0}
					<span class="inline-flex items-center justify-center rounded-full bg-pink-100 px-2 py-0.5 text-xs font-semibold text-pink-700">
						{unreadCount}
					</span>
				{/if}
			</button>
		</div>

		<button
			type="button"
			onclick={markAllAsRead}
			disabled={unreadCount === 0}
			class="inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors {unreadCount > 0 ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100' : 'cursor-not-allowed bg-gray-50 text-gray-400'}"
		>
			<CheckCheck size={16} />
			Mark all as read
		</button>
	</div>

	{#if loading}
		<div class="flex flex-col items-center justify-center rounded-xl border border-gray-200 bg-white p-12 text-center">
			<div class="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-pink-600"></div>
			<p class="mt-4 text-sm font-medium text-gray-500">Loading notifications...</p>
		</div>
	{:else if filteredNotifications.length === 0}
		<div class="flex flex-col items-center justify-center rounded-xl border border-gray-200 bg-white p-16 text-center shadow-sm">
			<div class="flex h-16 w-16 items-center justify-center rounded-full bg-pink-50 text-pink-600">
				{#if filter === 'unread'}
					<CheckCheck size={32} />
				{:else}
					<Bell size={32} />
				{/if}
			</div>
			<h3 class="mt-5 text-lg font-semibold text-gray-900">
				{filter === 'unread' ? "You're all caught up!" : 'No notifications yet'}
			</h3>
			<p class="mt-2 max-w-sm text-sm text-gray-500">
				{filter === 'unread' 
					? "You don't have any unread notifications right now." 
					: "You are all caught up."}
			</p>
		</div>
	{:else}
		<div class="space-y-3">
			{#each pagedNotifications as notification (notification.id)}
				<button
					type="button"
					onclick={() => openNotification(notification)}
					class="group relative flex w-full flex-col gap-1 rounded-xl border p-4 text-left transition-all hover:shadow-md {notification.isRead ? 'border-gray-200 bg-white hover:border-gray-300' : 'border-pink-200 bg-pink-50/30 hover:border-pink-300'}"
				>
					<div class="flex items-start justify-between gap-4">
						<div class="flex items-start gap-4 min-w-0">
							<div class="mt-0.5 flex h-10 w-10 shrink-0 overflow-hidden items-center justify-center rounded-full text-sm transition-colors {notification.isRead ? 'bg-gray-100 text-gray-500 group-hover:bg-gray-200' : 'bg-pink-100 text-pink-600 group-hover:bg-pink-200'} font-semibold">
								{#if notification.metadata?.actorPhotoUrl || notification.metadata?.photoUrl}
									<img src={(notification.metadata?.actorPhotoUrl || notification.metadata?.photoUrl) as string} alt="User" class="h-full w-full object-cover" />
								{:else if notification.metadata?.actorName}
									{getInitials(notification.metadata?.actorName as string)}
								{:else}
									<Bell size={18} />
								{/if}
							</div>
							<div class="min-w-0 flex-1">
								<p class="text-sm font-semibold {notification.isRead ? 'text-gray-900' : 'text-gray-900'}">{notification.title}</p>
								<p class="mt-1.5 text-sm {notification.isRead ? 'text-gray-600' : 'text-gray-800'} leading-relaxed">{notification.message}</p>
								<p class="mt-2.5 flex items-center text-xs font-medium {notification.isRead ? 'text-gray-400' : 'text-pink-600/80'}">
									{formatDate(notification.createdAt)}
								</p>
							</div>
						</div>
						{#if !notification.isRead}
							<div class="mt-2 shrink-0">
								<span class="inline-block h-2.5 w-2.5 rounded-full bg-pink-600 shadow-sm shadow-pink-200"></span>
							</div>
						{/if}
					</div>
				</button>
			{/each}
		</div>

		{#if filteredNotifications.length > PAGE_SIZE}
			<div class="mt-6">
				<Pagination
					{currentPage}
					{totalPages}
					totalItems={filteredNotifications.length}
					itemsPerPage={PAGE_SIZE}
					onPageChange={(p) => { currentPage = p; window.scrollTo({ top: 0, behavior: 'smooth' }); }}
				/>
			</div>
		{/if}
	{/if}
</div>
