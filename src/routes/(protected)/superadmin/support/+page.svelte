<script lang="ts">
	import { onMount, onDestroy, tick } from 'svelte';
	import { toastStore } from '$lib/stores/toast';
	import {
		MessageCircle,
		Send,
		RefreshCw,
		Loader2,
		X,
		CheckCircle2,
		Clock,
		AlertCircle,
		XCircle,
		Search,
		Filter,
		User,
		ChevronDown
	} from 'lucide-svelte';

	// ─── Types ────────────────────────────────────────────────────────────────

	type TicketStatus = 'open' | 'in_progress' | 'resolved' | 'closed';

	interface ChatEntry {
		id: string;
		sender: 'student' | 'superadmin';
		senderId: string;
		senderName: string;
		body: string;
		sentAt: string;
	}

	type OwnerRole = 'student' | 'instructor' | 'custodian';

	interface Ticket {
		id: string;
		studentId: string;
		ownerRole?: OwnerRole;
		studentName?: string;
		studentEmail?: string;
		subject: string;
		messages: ChatEntry[];
		status: TicketStatus;
		lastMessageAt: string;
		unreadBySuperadmin: number;
		unreadByStudent: number;
		createdAt: string;
		updatedAt: string;
	}

	// ─── State ────────────────────────────────────────────────────────────────

	let tickets = $state<Ticket[]>([]);
	let loadingTickets = $state(false);
	let selectedTicket = $state<Ticket | null>(null);
	let replyBody = $state('');
	let sendingReply = $state(false);
	let updatingStatus = $state(false);
	let searchQuery = $state('');
	let statusFilter = $state<TicketStatus | 'all'>('all');
	let roleFilter = $state<OwnerRole | 'all'>('all');
	let showStatusDropdown = $state(false);

	// SSE
	let sseSource: EventSource | null = null;

	// Chat scroll
	let chatContainer = $state<HTMLDivElement | null>(null);

	// ─── Helpers ─────────────────────────────────────────────────────────────

	function statusLabel(s: TicketStatus): string {
		return { open: 'Open', in_progress: 'In Progress', resolved: 'Resolved', closed: 'Closed' }[s] ?? s;
	}

	function statusColor(s: TicketStatus): string {
		return (
			{
				open: 'bg-blue-100 text-blue-700',
				in_progress: 'bg-yellow-100 text-yellow-700',
				resolved: 'bg-green-100 text-green-700',
				closed: 'bg-gray-100 text-gray-500'
			}[s] ?? 'bg-gray-100 text-gray-500'
		);
	}

	function statusIcon(s: TicketStatus) {
		return { open: AlertCircle, in_progress: Clock, resolved: CheckCircle2, closed: XCircle }[s] ?? AlertCircle;
	}

	function ownerRoleLabel(r?: OwnerRole): string {
		return { student: 'Student', instructor: 'Instructor', custodian: 'Custodian' }[r ?? 'student'] ?? 'User';
	}

	function ownerRoleColor(r?: OwnerRole): string {
		return (
			{
				student: 'bg-purple-100 text-purple-700',
				instructor: 'bg-indigo-100 text-indigo-700',
				custodian: 'bg-teal-100 text-teal-700'
			}[r ?? 'student'] ?? 'bg-gray-100 text-gray-600'
		);
	}

	function formatTime(iso: string): string {
		const d = new Date(iso);
		const now = new Date();
		const diffMs = now.getTime() - d.getTime();
		const diffMin = Math.floor(diffMs / 60_000);
		if (diffMin < 1) return 'Just now';
		if (diffMin < 60) return `${diffMin}m ago`;
		const diffH = Math.floor(diffMin / 60);
		if (diffH < 24) return `${diffH}h ago`;
		return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
	}

	function formatFullTime(iso: string): string {
		return new Date(iso).toLocaleString('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric',
			hour: 'numeric',
			minute: '2-digit'
		});
	}

	async function scrollToBottom() {
		await tick();
		if (chatContainer) {
			chatContainer.scrollTop = chatContainer.scrollHeight;
		}
	}

	// ─── Filtered tickets ─────────────────────────────────────────────────────

	const filteredTickets = $derived.by(() => {
		let result = tickets;
		if (statusFilter !== 'all') {
			result = result.filter((t) => t.status === statusFilter);
		}
		if (roleFilter !== 'all') {
			result = result.filter((t) => (t.ownerRole ?? 'student') === roleFilter);
		}
		if (searchQuery.trim()) {
			const q = searchQuery.toLowerCase();
			result = result.filter(
				(t) =>
					t.subject.toLowerCase().includes(q) ||
					(t.studentName ?? '').toLowerCase().includes(q) ||
					(t.studentEmail ?? '').toLowerCase().includes(q)
			);
		}
		return result;
	});

	const stats = $derived({
		total: tickets.length,
		open: tickets.filter((t) => t.status === 'open').length,
		inProgress: tickets.filter((t) => t.status === 'in_progress').length,
		resolved: tickets.filter((t) => t.status === 'resolved').length,
		unread: tickets.reduce((s, t) => s + (t.unreadBySuperadmin ?? 0), 0)
	});

	// ─── API calls ────────────────────────────────────────────────────────────

	async function loadTickets() {
		loadingTickets = true;
		try {
			const res = await fetch('/api/support');
			if (!res.ok) throw new Error('Failed to load tickets');
			const data = await res.json();
			tickets = data.tickets ?? [];

			// Refresh selected ticket if open
			if (selectedTicket) {
				const fresh = tickets.find((t) => t.id === selectedTicket!.id);
				if (fresh) selectedTicket = fresh;
			}
		} catch {
			toastStore.error('Could not load support tickets. Please try again.');
		} finally {
			loadingTickets = false;
		}
	}

	async function openTicket(ticket: Ticket) {
		selectedTicket = ticket;
		// Mark as read
		if (ticket.unreadBySuperadmin > 0) {
			await fetch(`/api/support?ticketId=${ticket.id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ markRead: true })
			});
			tickets = tickets.map((t) =>
				t.id === ticket.id ? { ...t, unreadBySuperadmin: 0 } : t
			);
			selectedTicket = { ...ticket, unreadBySuperadmin: 0 };
		}
		await scrollToBottom();
	}

	async function sendReply() {
		if (!replyBody.trim() || !selectedTicket) return;
		sendingReply = true;
		const body = replyBody.trim();
		replyBody = '';
		try {
			const res = await fetch(`/api/support?ticketId=${selectedTicket.id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ message: body })
			});
			if (!res.ok) throw new Error('Failed to send reply');
			const updated: Ticket = await res.json();
			selectedTicket = updated;
			tickets = tickets.map((t) => (t.id === updated.id ? updated : t));
			await scrollToBottom();
		} catch {
			toastStore.error('Failed to send reply. Please try again.');
			replyBody = body;
		} finally {
			sendingReply = false;
		}
	}

	async function updateStatus(newStatus: TicketStatus) {
		if (!selectedTicket) return;
		updatingStatus = true;
		showStatusDropdown = false;
		try {
			const res = await fetch(`/api/support?ticketId=${selectedTicket.id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ status: newStatus })
			});
			if (!res.ok) throw new Error('Failed to update status');
			const updated: Ticket = await res.json();
			selectedTicket = updated;
			tickets = tickets.map((t) => (t.id === updated.id ? updated : t));
			toastStore.success(`Ticket status updated to "${statusLabel(newStatus)}".`);
		} catch {
			toastStore.error('Failed to update ticket status.');
		} finally {
			updatingStatus = false;
		}
	}

	function handleReplyKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			sendReply();
		}
	}

	// ─── SSE ─────────────────────────────────────────────────────────────────

	function connectSSE() {
		if (sseSource) sseSource.close();
		sseSource = new EventSource('/api/support/stream');
		sseSource.onmessage = (e) => {
			try {
				const evt = JSON.parse(e.data);
				if (evt.type === 'heartbeat' || evt.type === 'connected') return;
				loadTickets();
			} catch {
				// ignore
			}
		};
		sseSource.onerror = () => {
			sseSource?.close();
			setTimeout(connectSSE, 5_000);
		};
	}

	// ─── Lifecycle ────────────────────────────────────────────────────────────

	onMount(() => {
		loadTickets();
		connectSSE();
	});

	onDestroy(() => {
		sseSource?.close();
	});

	$effect(() => {
		if (selectedTicket?.messages) {
			scrollToBottom();
		}
	});
</script>

<svelte:head>
	<title>Support Inbox - Superadmin</title>
</svelte:head>

<div class="space-y-6">
	<!-- Page Header -->
	<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
		<div>
			<h1 class="text-2xl font-bold text-gray-900 sm:text-3xl">Support Inbox</h1>
			<p class="mt-1 text-sm text-gray-500">Manage and respond to student support tickets.</p>
		</div>
		<button
			onclick={loadTickets}
			class="flex items-center gap-2 self-start rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50 sm:self-auto"
		>
			<RefreshCw size={15} class={loadingTickets ? 'animate-spin' : ''} />
			Refresh
		</button>
	</div>

	<!-- Stats -->
	<div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
		<div class="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
			<p class="text-xs font-medium text-gray-500">Total Tickets</p>
			<p class="mt-1 text-2xl font-bold text-gray-900">{stats.total}</p>
		</div>
		<div class="rounded-xl border border-blue-100 bg-blue-50 p-4 shadow-sm">
			<p class="text-xs font-medium text-blue-600">Open</p>
			<p class="mt-1 text-2xl font-bold text-blue-700">{stats.open}</p>
		</div>
		<div class="rounded-xl border border-yellow-100 bg-yellow-50 p-4 shadow-sm">
			<p class="text-xs font-medium text-yellow-600">In Progress</p>
			<p class="mt-1 text-2xl font-bold text-yellow-700">{stats.inProgress}</p>
		</div>
		<div class="rounded-xl border border-green-100 bg-green-50 p-4 shadow-sm">
			<p class="text-xs font-medium text-green-600">Resolved</p>
			<p class="mt-1 text-2xl font-bold text-green-700">{stats.resolved}</p>
		</div>
	</div>

	<!-- Main panel -->
	<div class="flex h-[calc(100vh-22rem)] min-h-[480px] overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">

		<!-- Left: ticket list -->
		<div class="flex w-full flex-col border-r border-gray-200 sm:w-72 lg:w-80 {selectedTicket ? 'hidden sm:flex' : 'flex'}">
			<!-- Search + filter -->
			<div class="space-y-2 border-b border-gray-200 px-3 py-3">
				<div class="relative">
					<Search size={14} class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
					<input
						type="text"
						bind:value={searchQuery}
						placeholder="Search tickets…"
						class="block h-9 w-full rounded-lg border border-gray-300 bg-white pl-8 pr-3 text-xs placeholder-gray-400 focus:border-pink-400 focus:outline-none focus:ring-2 focus:ring-pink-100"
					/>
				</div>
				<div class="flex gap-1 flex-wrap">
					{#each (['all', 'open', 'in_progress', 'resolved', 'closed'] as const) as s}
						<button
							onclick={() => (statusFilter = s)}
							class="rounded-full px-2.5 py-1 text-[10px] font-medium transition-colors {statusFilter === s
								? 'bg-pink-500 text-white'
								: 'bg-gray-100 text-gray-600 hover:bg-gray-200'}"
						>
							{s === 'all' ? 'All' : s === 'in_progress' ? 'In Progress' : s.charAt(0).toUpperCase() + s.slice(1)}
						</button>
					{/each}
				</div>
				<!-- Role filter -->
				<div class="flex gap-1 flex-wrap">
					{#each (['all', 'student', 'instructor', 'custodian'] as const) as r}
						<button
							onclick={() => (roleFilter = r)}
							class="rounded-full px-2.5 py-1 text-[10px] font-medium transition-colors {roleFilter === r
								? 'bg-pink-500 text-white'
								: 'bg-gray-100 text-gray-600 hover:bg-gray-200'}"
						>
							{r === 'all' ? 'All Roles' : r.charAt(0).toUpperCase() + r.slice(1)}
						</button>
					{/each}
				</div>
			</div>

			<!-- List -->
			<div class="flex-1 overflow-y-auto">
				{#if loadingTickets && tickets.length === 0}
					<div class="flex flex-col items-center justify-center gap-2 py-12 text-gray-400">
						<Loader2 size={22} class="animate-spin" />
						<p class="text-xs">Loading tickets…</p>
					</div>
				{:else if filteredTickets.length === 0}
					<div class="flex flex-col items-center justify-center gap-3 px-4 py-12 text-center">
						<div class="flex h-12 w-12 items-center justify-center rounded-full bg-gray-100">
							<MessageCircle size={22} class="text-gray-400" />
						</div>
						<p class="text-sm font-medium text-gray-600">No tickets found</p>
					</div>
				{:else}
					{#each filteredTickets as ticket}
						<button
							onclick={() => openTicket(ticket)}
							class="w-full border-b border-gray-100 px-4 py-3 text-left transition-colors hover:bg-gray-50 {selectedTicket?.id === ticket.id ? 'bg-pink-50' : ''}"
						>
							<div class="flex items-start justify-between gap-2">
								<p class="line-clamp-1 text-xs font-semibold text-gray-800">{ticket.subject}</p>
								{#if ticket.unreadBySuperadmin > 0}
									<span class="flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-pink-500 px-1 text-[9px] font-bold text-white">
										{ticket.unreadBySuperadmin}
									</span>
								{/if}
							</div>
							<div class="mt-1 flex items-center gap-1.5">
								<User size={10} class="text-gray-400" />
								<p class="line-clamp-1 text-[11px] text-gray-500">
									{ticket.studentName ?? 'Unknown Student'}
								</p>
							</div>
							<div class="mt-1.5 flex items-center justify-between gap-2">
								<div class="flex items-center gap-1">
									<span class="rounded-full px-2 py-0.5 text-[10px] font-medium {ownerRoleColor(ticket.ownerRole)}">
										{ownerRoleLabel(ticket.ownerRole)}
									</span>
									<span class="rounded-full px-2 py-0.5 text-[10px] font-medium {statusColor(ticket.status)}">
										{statusLabel(ticket.status)}
									</span>
								</div>
								<span class="text-[10px] text-gray-400">{formatTime(ticket.lastMessageAt)}</span>
							</div>
						</button>
					{/each}
				{/if}
			</div>
		</div>

		<!-- Right: conversation -->
		<div class="flex flex-1 flex-col {selectedTicket ? 'flex' : 'hidden sm:flex'}">
			{#if selectedTicket}
				<!-- Conversation header -->
				<div class="flex items-center gap-3 border-b border-gray-200 px-4 py-3">
					<button
						onclick={() => (selectedTicket = null)}
						class="rounded-lg p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 sm:hidden"
						aria-label="Back to tickets"
					>
						<X size={18} />
					</button>
					<div class="min-w-0 flex-1">
						<p class="truncate text-sm font-semibold text-gray-800">{selectedTicket.subject}</p>
						<div class="flex items-center gap-1.5 mt-0.5">
							<User size={11} class="text-gray-400" />
							<p class="text-xs text-gray-500">
								{selectedTicket.studentName ?? 'Unknown'}
								{#if selectedTicket.studentEmail}
									<span class="text-gray-400">· {selectedTicket.studentEmail}</span>
								{/if}
							</p>
							<span class="rounded-full px-2 py-0.5 text-[10px] font-medium {ownerRoleColor(selectedTicket.ownerRole)}">
								{ownerRoleLabel(selectedTicket.ownerRole)}
							</span>
						</div>
					</div>

					<!-- Status dropdown -->
					<div class="relative shrink-0">
						<button
							onclick={() => (showStatusDropdown = !showStatusDropdown)}
							class="flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-gray-50 {statusColor(selectedTicket.status)}"
							disabled={updatingStatus}
						>
							{#if updatingStatus}
								<Loader2 size={12} class="animate-spin" />
							{:else}
								{statusLabel(selectedTicket.status)}
								<ChevronDown size={12} />
							{/if}
						</button>
						{#if showStatusDropdown}
							<!-- svelte-ignore a11y_no_static_element_interactions -->
							<div
								class="absolute right-0 top-full z-20 mt-1 w-36 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg"
								onmouseleave={() => (showStatusDropdown = false)}
							>
								{#each (['open', 'in_progress', 'resolved', 'closed'] as const) as s}
									<button
										onclick={() => updateStatus(s)}
										class="flex w-full items-center gap-2 px-3 py-2 text-xs transition-colors hover:bg-gray-50 {selectedTicket.status === s ? 'font-semibold text-pink-600' : 'text-gray-700'}"
									>
										{statusLabel(s)}
									</button>
								{/each}
							</div>
						{/if}
					</div>
				</div>

				<!-- Messages -->
				<div
					bind:this={chatContainer}
					class="flex-1 overflow-y-auto space-y-4 px-5 py-4 bg-gray-50"
				>
					{#each selectedTicket.messages as msg}
						{@const isAdmin = msg.sender === 'superadmin'}
						<div class="flex {isAdmin ? 'justify-end' : 'justify-start'}">
							{#if isAdmin}
								<!-- Admin message — right, pink bubble -->
								<div class="max-w-[70%]">
									<div class="rounded-2xl rounded-br-sm bg-pink-500 px-4 py-2.5 text-sm text-white shadow-sm">
										<p class="mb-0.5 text-[11px] font-semibold opacity-80">{msg.senderName}</p>
										<p class="leading-relaxed">{msg.body}</p>
										<p class="mt-1 text-right text-[10px] opacity-70">{formatFullTime(msg.sentAt)}</p>
									</div>
								</div>
							{:else}
								<!-- User message — left, white card -->
								<div class="max-w-[70%]">
									<div class="rounded-2xl rounded-bl-sm border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-800 shadow-sm">
										<p class="mb-0.5 text-[11px] font-semibold text-gray-700">{msg.senderName}</p>
										<p class="leading-relaxed">{msg.body}</p>
										<p class="mt-1 text-[10px] text-gray-400">{formatFullTime(msg.sentAt)}</p>
									</div>
								</div>
							{/if}
						</div>
					{/each}

					{#if selectedTicket.status === 'resolved' || selectedTicket.status === 'closed'}
						<div class="flex justify-center">
							<span class="rounded-full bg-gray-200 px-4 py-1.5 text-xs text-gray-500">
								Ticket {selectedTicket.status}
							</span>
						</div>
					{/if}
				</div>

				<!-- Reply input -->
				{#if selectedTicket.status !== 'closed'}
					<div class="border-t border-gray-100 bg-white px-4 py-3">
						<div class="flex items-center gap-2 rounded-full border border-gray-300 bg-white focus-within:border-pink-400 focus-within:ring-2 focus-within:ring-pink-100">
							<input
								bind:value={replyBody}
								onkeydown={handleReplyKeydown}
								placeholder="Type your reply…"
								disabled={sendingReply}
								class="flex-1 bg-transparent px-4 py-2.5 text-sm text-gray-800 placeholder-gray-400 focus:outline-none disabled:cursor-not-allowed"
							/>
							<button
								onclick={sendReply}
								disabled={!replyBody.trim() || sendingReply}
								class="mr-1.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors {replyBody.trim() && !sendingReply ? 'bg-pink-500 text-white hover:bg-pink-600' : 'bg-gray-200 text-gray-400'} disabled:cursor-not-allowed"
								aria-label="Send reply"
							>
								{#if sendingReply}
									<Loader2 size={14} class="animate-spin" />
								{:else}
									<Send size={14} />
								{/if}
							</button>
						</div>
						<p class="mt-1.5 text-center text-[10px] text-gray-400">Press Enter to send · Shift+Enter for new line</p>
					</div>
				{/if}
			{:else}
				<!-- Empty state -->
				<div class="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
					<div class="flex h-16 w-16 items-center justify-center rounded-full bg-pink-50">
						<MessageCircle size={28} class="text-pink-400" />
					</div>
					<div>
						<p class="text-base font-semibold text-gray-700">Select a ticket</p>
						<p class="mt-1 text-sm text-gray-400">
							Choose a support ticket from the list to view and respond.
						</p>
					</div>
					{#if stats.unread > 0}
						<div class="rounded-xl border border-pink-100 bg-pink-50 px-4 py-2.5 text-sm text-pink-700">
							You have <strong>{stats.unread}</strong> unread {stats.unread === 1 ? 'message' : 'messages'}.
						</div>
					{/if}
				</div>
			{/if}
		</div>
	</div>
</div>
