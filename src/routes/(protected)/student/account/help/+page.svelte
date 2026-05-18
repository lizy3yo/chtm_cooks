<script lang="ts">
	import { onMount, onDestroy, tick } from 'svelte';
	import { toastStore } from '$lib/stores/toast';
	import { user } from '$lib/stores/auth';
	import { MessageCircle, HelpCircle, ChevronDown, ChevronUp, Send, LoaderCircle, X, SquarePen, Trash2, Bot, UserRound } from 'lucide-svelte';

	// ─── Types ────────────────────────────────────────────────────────────────

	type TicketStatus = 'open' | 'in_progress' | 'resolved' | 'closed';

	interface ChatEntry {
		id: string;
		sender: 'student' | 'instructor' | 'custodian' | 'superadmin';
		senderId: string;
		senderName: string;
		body: string;
		sentAt: string;
	}

	interface Ticket {
		id: string;
		studentId: string;
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

	type PageTab = 'faq' | 'chat';
	let activeTab = $state<PageTab>('faq');
	let openFaqIndex = $state<number | null>(null);

	let tickets = $state<Ticket[]>([]);
	let loadingTickets = $state(false);
	let selectedTicket = $state<Ticket | null>(null);

	let messageInput = $state('');
	let sendingMessage = $state(false);
	let ariaThinking = $state(false); // ARIA is generating a reply

	let sseSource: EventSource | null = null;
	let chatContainer = $state<HTMLDivElement | null>(null);
	let inputEl = $state<HTMLInputElement | null>(null);

	// ─── FAQ Data ─────────────────────────────────────────────────────────────

	const faqs = [
		{ question: 'How do I borrow equipment?', answer: 'Navigate to "Equipment Catalog" to browse available items, then click "Request Equipment" to submit a borrow request. Your instructor must approve the request before the custodian releases the items.' },
		{ question: 'How long can I borrow equipment?', answer: 'Borrow duration is set when you submit your request. You must specify a borrow date and a return date. Extensions are not guaranteed — contact your instructor if you need more time.' },
		{ question: 'What happens if I lose or damage an item?', answer: 'You will be issued a replacement obligation. You are responsible for replacing or paying for the item. Contact the custodian or superadmin immediately if an item is lost or damaged.' },
		{ question: 'How do I return borrowed items?', answer: 'Bring the borrowed items to the custodian desk. The custodian will inspect the items and confirm the return on their end.' },
		{ question: 'Why was my request declined?', answer: 'Requests can be declined by your instructor or the custodian. Common reasons include insufficient stock, invalid dates, or missing class enrollment. Check the decline reason in "My Requests" for details.' },
		{ question: 'Can I cancel a pending request?', answer: 'Yes. While your request is still in "Under Review" status, you can cancel it from the "My Requests" page. Once approved, cancellation is no longer available.' },
		{ question: 'What is a class code and why do I need one?', answer: 'A class code links your borrow request to a specific course and instructor. You must be enrolled in a class code to submit equipment requests. Contact your instructor if you are not enrolled.' },
		{ question: 'How do I contact support?', answer: 'Switch to the "Chat Support" tab on this page to send a message directly to the system administrator. You will receive a reply in the same conversation thread.' }
	];

	const quickQuestions = [
		'How do I borrow equipment?',
		'Check my request status',
		'Equipment return process',
		'What is a class code?'
	];

	// ─── Helpers ─────────────────────────────────────────────────────────────

	function statusLabel(s: TicketStatus): string {
		return { open: 'Open', in_progress: 'In Progress', resolved: 'Resolved', closed: 'Closed' }[s] ?? s;
	}

	function statusBadgeColor(s: TicketStatus): string {
		return ({ open: 'bg-blue-500', in_progress: 'bg-yellow-500', resolved: 'bg-green-500', closed: 'bg-gray-400' }[s] ?? 'bg-gray-400');
	}

	function statusTextColor(s: TicketStatus): string {
		return ({ open: 'bg-blue-100 text-blue-700', in_progress: 'bg-yellow-100 text-yellow-700', resolved: 'bg-green-100 text-green-700', closed: 'bg-gray-100 text-gray-500' }[s] ?? 'bg-gray-100 text-gray-500');
	}

	function formatTime(iso: string): string {
		return new Date(iso).toLocaleString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
	}

	function formatDate(iso: string): string {
		return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
	}

	function ticketCode(index: number): string {
		return `TKT-${String(tickets.length - index).padStart(5, '0')}`;
	}

	/** True if the last reply in this ticket was from a human (superadmin), not ARIA */
	function hasHumanReplied(ticket: Ticket): boolean {
		const lastAdmin = [...ticket.messages].reverse().find((m) => m.sender === 'superadmin');
		return lastAdmin ? lastAdmin.senderName !== 'ARIA' : false;
	}

	const firstName = $derived($user?.firstName ?? 'there');

	async function scrollToBottom() {
		await tick();
		if (chatContainer) chatContainer.scrollTop = chatContainer.scrollHeight;
	}

	function resetToWelcome() {
		selectedTicket = null;
		messageInput = '';
		tick().then(() => inputEl?.focus());
	}

	/**
	 * Bypass ARIA and open a direct conversation with the support team.
	 * Creates a ticket with a human-handoff flag so the ai-reply endpoint skips ARIA.
	 */
	async function messageHuman() {
		if (sendingMessage) return;
		sendingMessage = true;
		try {
			const res = await fetch('/api/support', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					subject: 'Direct support request',
					message: 'I would like to speak with a support agent directly.'
				})
			});
			if (!res.ok) { const e = await res.json(); throw new Error(e.error ?? 'Failed'); }
			const ticket: Ticket = await res.json();
			tickets = [ticket, ...tickets];
			selectedTicket = ticket;
			await scrollToBottom();
			tick().then(() => inputEl?.focus());
		} catch (err: unknown) {
			toastStore.error(err instanceof Error ? err.message : 'Failed to connect to support.');
		} finally {
			sendingMessage = false;
		}
	}

	// ─── API calls ────────────────────────────────────────────────────────────

	async function loadTickets() {
		loadingTickets = true;
		try {
			const res = await fetch('/api/support');
			if (!res.ok) throw new Error();
			const data = await res.json();
			// Only show non-closed tickets in the user's list
			tickets = (data.tickets ?? []).filter((t: Ticket) => t.status !== 'closed');
			if (selectedTicket) {
				const fresh = tickets.find((t) => t.id === selectedTicket!.id);
				if (fresh) selectedTicket = fresh;
				else if (selectedTicket.status === 'closed') selectedTicket = null;
			}
		} catch { toastStore.error('Could not load your support tickets. Please try again.'); }
		finally { loadingTickets = false; }
	}

	/**
	 * Close a ticket from the user's side.
	 * Sets status to 'closed' — the ticket remains visible to the superadmin.
	 */
	async function closeTicket(e: MouseEvent, ticket: Ticket) {
		e.stopPropagation();
		try {
			const res = await fetch(`/api/support?ticketId=${ticket.id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ status: 'closed' })
			});
			if (!res.ok) throw new Error();
			// Remove from local list immediately
			tickets = tickets.filter((t) => t.id !== ticket.id);
			if (selectedTicket?.id === ticket.id) selectedTicket = null;
		} catch {
			toastStore.error('Failed to close the conversation. Please try again.');
		}
	}

	async function openTicket(ticket: Ticket) {
		selectedTicket = ticket;
		messageInput = '';
		if (ticket.unreadByStudent > 0) {
			await fetch(`/api/support?ticketId=${ticket.id}`, {
				method: 'PATCH', headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ markRead: true })
			});
			tickets = tickets.map((t) => t.id === ticket.id ? { ...t, unreadByStudent: 0 } : t);
			selectedTicket = { ...ticket, unreadByStudent: 0 };
		}
		await scrollToBottom();
		tick().then(() => inputEl?.focus());
	}

	/**
	 * Unified send:
	 * - No ticket open → create ticket, then ask ARIA
	 * - Ticket open → reply to ticket, then ask ARIA (unless human has taken over)
	 */
	async function sendMessage(text?: string) {
		const msgText = (text ?? messageInput).trim();
		if (!msgText || sendingMessage) return;
		messageInput = '';
		sendingMessage = true;

		try {
			let ticket = selectedTicket;

			if (!ticket) {
				// Step 1: Create the ticket
				const res = await fetch('/api/support', {
					method: 'POST', headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ subject: msgText.slice(0, 80), message: msgText })
				});
				if (!res.ok) { const e = await res.json(); throw new Error(e.error ?? 'Failed to create ticket'); }
				ticket = await res.json();
				tickets = [ticket!, ...tickets];
				selectedTicket = ticket;
				await scrollToBottom();
			} else {
				// Step 1: Append user message to existing ticket
				const res = await fetch(`/api/support?ticketId=${ticket.id}`, {
					method: 'PATCH', headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ message: msgText })
				});
				if (!res.ok) throw new Error('Failed to send message');
				const updated: Ticket = await res.json();
				selectedTicket = updated;
				ticket = updated;
				tickets = tickets.map((t) => (t.id === updated.id ? updated : t));
				await scrollToBottom();
			}

			sendingMessage = false;

			// Step 2: Ask ARIA to reply (only if no human has taken over)
			if (!hasHumanReplied(ticket!)) {
				ariaThinking = true;
				await scrollToBottom();
				try {
					const aiRes = await fetch('/api/support/ai-reply', {
						method: 'POST', headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({ ticketId: ticket!.id })
					});
					if (aiRes.ok) {
						const data = await aiRes.json();
						if (data.ticket) {
							selectedTicket = data.ticket;
							tickets = tickets.map((t) => (t.id === data.ticket.id ? data.ticket : t));
						}
					}
				} catch { /* ARIA failure is non-fatal */ }
				finally {
					ariaThinking = false;
					await scrollToBottom();
				}
			}
		} catch (err: unknown) {
			toastStore.error(err instanceof Error ? err.message : 'Failed to send message.');
			messageInput = msgText;
			sendingMessage = false;
		}

		tick().then(() => inputEl?.focus());
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
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
			} catch { /* ignore */ }
		};
		sseSource.onerror = () => { sseSource?.close(); setTimeout(connectSSE, 5_000); };
	}

	onMount(() => { loadTickets(); connectSSE(); });
	onDestroy(() => { sseSource?.close(); });
	$effect(() => { if (selectedTicket?.messages) scrollToBottom(); });

	const totalUnread = $derived(tickets.reduce((sum, t) => sum + (t.unreadByStudent ?? 0), 0));
	const mobileShowRight = $derived(selectedTicket !== null);
	const canSend = $derived(messageInput.trim().length > 0 && !sendingMessage && !ariaThinking);
	const isClosed = $derived(selectedTicket?.status === 'resolved' || selectedTicket?.status === 'closed');
</script>

<svelte:head>
	<title>Help & Support - Student Portal</title>
</svelte:head>

<div class="space-y-6">
	<div class="border-b border-gray-200 pb-5">
		<h1 class="text-3xl font-bold text-gray-900">Help & Support</h1>
		<p class="mt-2 text-sm text-gray-600">Find answers to common questions or contact the support team directly.</p>
	</div>

	<div class="border-b border-gray-200">
		<nav class="-mb-px flex gap-6" aria-label="Support tabs">
			<button onclick={() => (activeTab = 'faq')} class="flex items-center gap-2 border-b-2 pb-3 text-sm font-medium transition-colors {activeTab === 'faq' ? 'border-pink-500 text-pink-600' : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'}">
				<HelpCircle size={16} />Frequently Asked Questions
			</button>
			<button onclick={() => { activeTab = 'chat'; }} class="relative flex items-center gap-2 border-b-2 pb-3 text-sm font-medium transition-colors {activeTab === 'chat' ? 'border-pink-500 text-pink-600' : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'}">
				<MessageCircle size={16} />Chat Support
				{#if totalUnread > 0}<span class="flex h-5 min-w-5 items-center justify-center rounded-full bg-pink-500 px-1.5 text-[10px] font-bold text-white">{totalUnread > 99 ? '99+' : totalUnread}</span>{/if}
			</button>
		</nav>
	</div>

	{#if activeTab === 'faq'}
		<div class="space-y-3">
			<div class="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-700">
				<strong>Can't find your answer?</strong> Switch to the <button onclick={() => (activeTab = 'chat')} class="font-semibold underline hover:text-blue-900">Chat Support</button> tab to send a message directly to the support team.
			</div>
			{#each faqs as faq, i}
				<div class="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
					<button onclick={() => (openFaqIndex = openFaqIndex === i ? null : i)} class="flex w-full items-center justify-between px-5 py-4 text-left transition-colors hover:bg-gray-50" aria-expanded={openFaqIndex === i}>
						<span class="pr-4 text-sm font-semibold text-gray-800">{faq.question}</span>
						{#if openFaqIndex === i}<ChevronUp size={18} class="shrink-0 text-pink-500" />{:else}<ChevronDown size={18} class="shrink-0 text-gray-400" />{/if}
					</button>
					{#if openFaqIndex === i}<div class="border-t border-gray-100 px-5 py-4"><p class="text-sm leading-relaxed text-gray-600">{faq.answer}</p></div>{/if}
				</div>
			{/each}
		</div>
	{/if}

	{#if activeTab === 'chat'}
		<div class="flex h-[calc(100vh-20rem)] min-h-[560px] overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">

			<!-- Left panel: conversation list -->
			<div class="flex w-full flex-col border-r border-gray-200 sm:w-72 lg:w-80 {mobileShowRight ? 'hidden sm:flex' : 'flex'}">
				<div class="flex items-center justify-between border-b border-gray-200 px-4 py-3">
					<div>
						<h2 class="text-sm font-semibold text-gray-900">Conversations</h2>
						{#if tickets.length > 0}<p class="text-xs text-gray-400">{tickets.length} conversation{tickets.length !== 1 ? 's' : ''}</p>{/if}
					</div>
					<button onclick={resetToWelcome} class="flex items-center gap-1.5 rounded-lg bg-pink-500 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-pink-600">
						<SquarePen size={13} />New Chat
					</button>
				</div>
				<div class="flex-1 overflow-y-auto">
					{#if loadingTickets && tickets.length === 0}
						<div class="flex flex-col items-center justify-center gap-2 py-12 text-gray-400"><LoaderCircle size={22} class="animate-spin" /><p class="text-xs">Loading…</p></div>
					{:else if tickets.length === 0}
						<div class="flex flex-col items-center justify-center gap-3 px-4 py-12 text-center"><MessageCircle size={28} class="text-gray-300" /><p class="text-sm text-gray-400">No conversations yet.</p></div>
					{:else}
						{#each tickets as ticket, i}
							{@const isActive = selectedTicket?.id === ticket.id}
							<!-- svelte-ignore a11y_interactive_supports_focus -->
							<div role="button" onclick={() => openTicket(ticket)} onkeydown={(e) => e.key === 'Enter' && openTicket(ticket)} class="group relative w-full cursor-pointer border-b border-gray-100 px-4 py-3 transition-colors hover:bg-gray-50 {isActive ? 'bg-pink-50' : ''}">
								<div class="flex items-start justify-between gap-2">
									<div class="min-w-0 flex-1">
										<p class="text-xs font-bold text-gray-700">{ticketCode(i)}</p>
										<p class="mt-0.5 line-clamp-1 text-xs text-gray-500">{ticket.messages.length > 0 ? ticket.messages[ticket.messages.length - 1].body : ticket.subject}</p>
									</div>
									<button onclick={(e) => closeTicket(e, ticket)} class="shrink-0 rounded p-1 text-gray-300 opacity-0 transition-opacity group-hover:opacity-100 hover:text-red-400" aria-label="Close conversation"><Trash2 size={13} /></button>
								</div>
								<div class="mt-1.5 flex items-center justify-between gap-2">
									<span class="rounded-full px-2 py-0.5 text-[10px] font-semibold {statusTextColor(ticket.status)}">{statusLabel(ticket.status)}</span>
									<span class="text-[10px] text-gray-400">{formatDate(ticket.lastMessageAt)}</span>
								</div>
								{#if ticket.unreadByStudent > 0}<span class="absolute right-3 top-3 flex h-4 min-w-4 items-center justify-center rounded-full bg-pink-500 px-1 text-[9px] font-bold text-white">{ticket.unreadByStudent}</span>{/if}
							</div>
						{/each}
					{/if}
				</div>
			</div>

			<!-- Right panel -->
			<div class="flex flex-1 flex-col bg-white {mobileShowRight ? 'flex' : 'hidden sm:flex'}">

				{#if selectedTicket}
					<!-- ── Active conversation ──────────────────────────── -->
					<div class="flex items-center gap-3 border-b border-gray-100 px-5 py-3">
						<button onclick={resetToWelcome} class="rounded-lg p-1 text-gray-400 transition-colors hover:bg-gray-100 sm:hidden" aria-label="Back"><X size={18} /></button>
						<div class="min-w-0 flex-1">
							<div class="flex items-center gap-2">
								<p class="text-sm font-bold text-gray-900">{ticketCode(tickets.findIndex(t => t.id === selectedTicket!.id))}</p>
								<span class="rounded-full {statusBadgeColor(selectedTicket.status)} px-2.5 py-0.5 text-[10px] font-bold text-white">{statusLabel(selectedTicket.status)}</span>
							</div>
							<p class="mt-0.5 line-clamp-1 text-xs text-gray-500">{selectedTicket.subject}</p>
						</div>
						{#if !hasHumanReplied(selectedTicket) && !isClosed}
							<button
								onclick={messageHuman}
								disabled={sendingMessage || ariaThinking}
								class="flex shrink-0 items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:border-pink-300 hover:bg-pink-50 hover:text-pink-600 disabled:opacity-50"
								title="Talk to a support agent"
							>
								<UserRound size={13} />
								<span class="hidden sm:inline">Message a person</span>
							</button>
						{/if}
					</div>

					<!-- Messages -->
					<div bind:this={chatContainer} class="flex-1 overflow-y-auto px-5 py-4 space-y-4 bg-gray-50">
						{#each selectedTicket.messages as msg}
							{@const isMe = msg.sender === 'student'}
							{@const isAria = msg.sender === 'superadmin' && msg.senderName === 'ARIA'}
							<div class="flex {isMe ? 'justify-end' : 'justify-start'}">
								{#if isMe}
									<div class="max-w-[70%]">
										<div class="rounded-2xl rounded-br-sm bg-pink-500 px-4 py-2.5 text-sm text-white shadow-sm">
											<p class="mb-0.5 text-[11px] font-semibold opacity-80">{msg.senderName}</p>
											<p class="leading-relaxed">{msg.body}</p>
											<p class="mt-1 text-right text-[10px] opacity-70">{formatTime(msg.sentAt)}</p>
										</div>
									</div>
								{:else}
									<div class="max-w-[75%]">
										<div class="rounded-2xl rounded-bl-sm border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-800 shadow-sm">
											<p class="mb-0.5 text-[11px] font-semibold {isAria ? 'text-pink-500' : 'text-gray-700'}">
												{isAria ? 'ARIA · AI Assistant' : 'Support Team'}
											</p>
											<p class="whitespace-pre-wrap leading-relaxed">{msg.body}</p>
											<p class="mt-1 text-[10px] text-gray-400">{formatTime(msg.sentAt)}</p>
										</div>
									</div>
								{/if}
							</div>
						{/each}

						{#if ariaThinking}
							<div class="flex justify-start">
								<div class="rounded-2xl rounded-bl-sm border border-gray-200 bg-white px-4 py-3 shadow-sm">
									<p class="mb-1.5 text-[11px] font-semibold text-pink-500">ARIA · AI Assistant</p>
									<div class="flex items-center gap-1.5">
										<span class="h-2 w-2 animate-bounce rounded-full bg-pink-400" style="animation-delay:0ms"></span>
										<span class="h-2 w-2 animate-bounce rounded-full bg-pink-400" style="animation-delay:150ms"></span>
										<span class="h-2 w-2 animate-bounce rounded-full bg-pink-400" style="animation-delay:300ms"></span>
									</div>
								</div>
							</div>
						{/if}

						{#if isClosed}
							<div class="flex justify-center py-2"><span class="rounded-full bg-gray-200 px-4 py-1.5 text-xs text-gray-500">This conversation has been {selectedTicket.status}. Start a new chat if you need further assistance.</span></div>
						{/if}
					</div>

					<!-- Status bar -->
					{#if !isClosed}
						<div class="border-t border-gray-100 bg-blue-50 px-5 py-2">
							<p class="text-xs text-blue-600">
								{hasHumanReplied(selectedTicket)
									? "You're chatting with our Support Team."
									: 'ARIA is handling your request. A support agent can take over at any time.'}
							</p>
						</div>
					{/if}

					<!-- Input bar -->
					<div class="border-t border-gray-100 bg-white px-4 py-3">
						<div class="flex items-center gap-2 rounded-full border {isClosed ? 'border-gray-200 bg-gray-50' : 'border-gray-300 bg-white focus-within:border-pink-400 focus-within:ring-2 focus-within:ring-pink-100'}">
							<input bind:this={inputEl} bind:value={messageInput} onkeydown={handleKeydown} placeholder={isClosed ? 'This conversation is closed' : 'Type your message…'} disabled={isClosed || sendingMessage || ariaThinking} class="flex-1 bg-transparent px-4 py-2.5 text-sm text-gray-800 placeholder-gray-400 focus:outline-none disabled:cursor-not-allowed" />
							<button onclick={() => sendMessage()} disabled={!canSend || isClosed} class="mr-1.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors {canSend && !isClosed ? 'bg-pink-500 text-white hover:bg-pink-600' : 'bg-gray-200 text-gray-400'} disabled:cursor-not-allowed" aria-label="Send">
								{#if sendingMessage || ariaThinking}<LoaderCircle size={14} class="animate-spin" />{:else}<Send size={14} />{/if}
							</button>
						</div>
						<p class="mt-1.5 text-center text-[10px] text-gray-400">Press Enter to send · Shift+Enter for new line</p>
					</div>

				{:else}
					<!-- ── Welcome / new chat state ──────────────────────── -->
					<div class="flex flex-1 flex-col items-center justify-between px-6 py-8">
						<div class="flex flex-1 flex-col items-center justify-center text-center">
							<!-- Bot avatar -->
							<div class="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-pink-100">
								<Bot size={32} class="text-pink-500" />
							</div>
							<h3 class="text-xl font-bold text-gray-900">Hi, {firstName} 👋</h3>
							<p class="mt-2 max-w-xs text-sm text-gray-500">
								I am ARIA, the CHTM Cooks AI assistant. How can I help you today?
							</p>
							<!-- Quick question chips -->
							<div class="mt-6 flex flex-wrap justify-center gap-2">
								{#each quickQuestions as q}
									<button
										onclick={() => sendMessage(q)}
										disabled={sendingMessage}
										class="rounded-full border border-pink-200 px-4 py-1.5 text-sm font-medium text-pink-600 transition-colors hover:bg-pink-50 disabled:cursor-not-allowed disabled:opacity-50"
									>{q}</button>
								{/each}
							</div>
							<!-- Human handoff -->
							<button
								onclick={messageHuman}
								disabled={sendingMessage}
								class="mt-5 flex items-center gap-2 rounded-full border border-gray-300 bg-white px-4 py-2 text-xs font-medium text-gray-600 shadow-sm transition-colors hover:border-pink-300 hover:bg-pink-50 hover:text-pink-600 disabled:cursor-not-allowed disabled:opacity-50"
							>
								<UserRound size={13} />
								Message a person
							</button>
						</div>
						<div class="w-full">
							<div class="flex items-center gap-2 rounded-full border border-pink-400 bg-white px-1 py-1 shadow-sm focus-within:ring-2 focus-within:ring-pink-100">
								<input bind:this={inputEl} bind:value={messageInput} onkeydown={handleKeydown} placeholder="Message ARIA…" disabled={sendingMessage} class="flex-1 bg-transparent px-3 py-1.5 text-sm text-gray-800 placeholder-gray-400 focus:outline-none" />
								<button onclick={() => sendMessage()} disabled={!canSend} class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors {canSend ? 'bg-pink-500 text-white hover:bg-pink-600' : 'bg-gray-200 text-gray-400'} disabled:cursor-not-allowed" aria-label="Send">
									{#if sendingMessage}<LoaderCircle size={14} class="animate-spin" />{:else}<Send size={14} />{/if}
								</button>
							</div>
							<p class="mt-2 text-center text-[10px] text-gray-400">Press Enter to send · Shift+Enter for new line</p>
						</div>
					</div>
				{/if}
			</div>
		</div>
	{/if}
</div>
