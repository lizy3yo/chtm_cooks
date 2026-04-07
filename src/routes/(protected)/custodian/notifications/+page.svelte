<script lang="ts">
	import { goto } from '$app/navigation';
	import { Bell, CheckCheck } from 'lucide-svelte';
	import { notificationsAPI, type NotificationRecord } from '$lib/api/notifications';

	let notifications = $state<NotificationRecord[]>([]);
	let unreadCount = $state(0);
	let loading = $state(true);

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

	async function loadNotifications() {
		loading = true;
		try {
			const data = await notificationsAPI.list(50, 0);
			notifications = data.notifications;
			unreadCount = data.unreadCount;
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
	<title>Notifications - CHTM Cooks</title>
</svelte:head>

<div class="space-y-6">
	<div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
		<div>
			<h1 class="text-2xl font-bold text-gray-900 sm:text-3xl">Notifications</h1>
			<p class="mt-1 text-sm text-gray-500">Stay updated with request processing and return activities</p>
		</div>
		<button
			type="button"
			onclick={markAllAsRead}
			disabled={unreadCount === 0}
			class="inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors {unreadCount > 0 ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100' : 'cursor-not-allowed bg-gray-100 text-gray-400'}"
		>
			<CheckCheck size={16} />
			Mark all as read
		</button>
	</div>

	<div class="rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm text-gray-600">
		Unread notifications: <span class="font-semibold text-gray-900">{unreadCount}</span>
	</div>

	{#if loading}
		<div class="rounded-lg border border-gray-200 bg-white p-10 text-center text-sm text-gray-500">Loading notifications...</div>
	{:else if notifications.length === 0}
		<div class="rounded-lg border border-gray-200 bg-white p-12 text-center">
			<Bell size={40} class="mx-auto text-pink-600" />
			<h3 class="mt-4 text-lg font-medium text-gray-900">No notifications yet</h3>
			<p class="mt-2 text-sm text-gray-500">You are all caught up.</p>
		</div>
	{:else}
		<div class="space-y-3">
			{#each notifications as notification (notification.id)}
				<button
					type="button"
					onclick={() => openNotification(notification)}
					class="w-full rounded-lg border px-4 py-3 text-left transition-colors hover:bg-gray-50 {notification.isRead ? 'border-gray-200 bg-white' : 'border-pink-200 bg-pink-50/40'}"
				>
					<div class="flex items-start justify-between gap-4">
						<div>
							<p class="text-sm font-semibold text-gray-900">{notification.title}</p>
							<p class="mt-1 text-sm text-gray-600">{notification.message}</p>
						</div>
						{#if !notification.isRead}
							<span class="mt-1 inline-block h-2.5 w-2.5 rounded-full bg-pink-600"></span>
						{/if}
					</div>
					<p class="mt-2 text-xs text-gray-400">{formatDate(notification.createdAt)}</p>
				</button>
			{/each}
		</div>
	{/if}
</div>
