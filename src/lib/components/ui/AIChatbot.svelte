<script lang="ts">
	import { onMount } from 'svelte';
	import { tick } from 'svelte';
	import { fly, fade, scale } from 'svelte/transition';
	import { quintOut, cubicOut } from 'svelte/easing';
	import { chatStore } from '$lib/stores/chat';
	import { user } from '$lib/stores/auth';
	import {
		X,
		Send,
		Trash2,
		Bot,
		ChevronDown,
		RotateCcw,
		Minimize2,
		PanelLeft,
		MessageSquarePlus,
		History
	} from 'lucide-svelte';

	let inputValue = $state('');
	let messagesEl = $state<HTMLDivElement | null>(null);
	let inputEl = $state<HTMLTextAreaElement | null>(null);
	let isAtBottom = $state(true);
	let scrollRafPending = false;
	let activeHistoryScope = $state<string | null>(null);
	let isHistoryOpen = $state(false);
	let hasBlockingModal = $state(false);

	const messages = $derived($chatStore.messages);
	const conversations = $derived($chatStore.conversations);
	const activeConversationId = $derived($chatStore.activeConversationId);
	const isLoading = $derived($chatStore.isLoading);
	const isOpen = $derived($chatStore.isOpen);
	const hasMessages = $derived(messages.length > 0);
	const canSend = $derived(inputValue.trim().length > 0 && !isLoading);

	async function scrollToBottom(force = false) {
		await tick();
		if (!messagesEl) return;
		if (force || isAtBottom) messagesEl.scrollTop = messagesEl.scrollHeight;
	}

	function handleScroll() {
		if (!messagesEl) return;
		const { scrollTop, scrollHeight, clientHeight } = messagesEl;
		isAtBottom = scrollHeight - scrollTop - clientHeight < 40;
	}

	function queueScrollToBottom() {
		if (scrollRafPending) return;
		scrollRafPending = true;
		requestAnimationFrame(() => {
			scrollRafPending = false;
			if (isAtBottom) scrollToBottom();
		});
	}

	$effect(() => { if (messages.length) scrollToBottom(); });
	$effect(() => { if (isOpen) tick().then(() => inputEl?.focus()); });
	$effect(() => {
		const scope = $user?.id ? `user:${$user.id}` : 'guest';
		if (scope !== activeHistoryScope) {
			activeHistoryScope = scope;
			chatStore.initializeHistory(scope);
			isHistoryOpen = false;
		}
	});

	onMount(() => {
		if (!activeHistoryScope) {
			const scope = $user?.id ? `user:${$user.id}` : 'guest';
			activeHistoryScope = scope;
			chatStore.initializeHistory(scope);
		}

		const isVisibleDialog = (node: Element): boolean => {
			if (!(node instanceof HTMLElement)) return false;
			if (node.classList.contains('chat-panel')) return false;

			const style = window.getComputedStyle(node);
			if (style.display === 'none' || style.visibility === 'hidden') return false;

			return node.getClientRects().length > 0;
		};

		const updateBlockingModalState = () => {
			if (typeof document === 'undefined') return;
			const modalDialogs = document.querySelectorAll('[role="dialog"][aria-modal="true"]');
			hasBlockingModal = Array.from(modalDialogs).some(isVisibleDialog);
		};

		updateBlockingModalState();

		const observer = new MutationObserver(updateBlockingModalState);
		observer.observe(document.body, {
			childList: true,
			subtree: true,
			attributes: true,
			attributeFilter: ['class', 'style', 'aria-hidden']
		});

		window.addEventListener('focus', updateBlockingModalState);

		return () => {
			observer.disconnect();
			window.removeEventListener('focus', updateBlockingModalState);
		};
	});

	async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = 40000): Promise<Response> {
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(new Error(`Timeout after ${timeoutMs}ms`)), timeoutMs);
		try {
			return await fetch(url, { ...init, signal: controller.signal });
		} finally {
			clearTimeout(timer);
		}
	}

	function getRetryDelayMs(response: Response): number {
		const seconds = Number(response.headers.get('Retry-After') ?? '0');
		return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 2000;
	}

	async function sendMessage() {
		const text = inputValue.trim();
		if (!text || isLoading) return;

		const history = [...messages, { role: 'user' as const, content: text }].map((m) => ({
			role: m.role,
			content: m.content
		}));

		inputValue = '';
		chatStore.setError(null);
		chatStore.addMessage('user', text);
		chatStore.setLoading(true);
		await scrollToBottom(true);

		const assistantId = chatStore.addMessage('assistant', '');

		try {
			let res = await fetchWithTimeout('/api/ai-chat', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ messages: history })
			});

			if (res.status === 429) {
				await new Promise((r) => setTimeout(r, getRetryDelayMs(res)));
				res = await fetchWithTimeout('/api/ai-chat', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ messages: history })
				});
			}

			if (!res.ok) {
				const err = await res.json().catch(() => ({ error: 'Unknown error' }));
				throw new Error(err.error ?? 'Request failed');
			}

			const reader = res.body!.getReader();
			const decoder = new TextDecoder();
			let buffer = '';

			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				buffer += decoder.decode(value, { stream: true });
				const lines = buffer.split('\n');
				buffer = lines.pop() ?? '';
				for (const line of lines) {
					if (!line.startsWith('data: ')) continue;
					const data = line.slice(6).trim();
					if (data === '[DONE]') break;
					try {
						const parsed = JSON.parse(data);
						const delta = parsed.choices?.[0]?.delta?.content;
						if (delta) { chatStore.appendToMessage(assistantId, delta); queueScrollToBottom(); }
					} catch { /* ignore */ }
				}
			}
		} catch (err: unknown) {
			let msg = 'Something went wrong. Please try again.';
			if (err instanceof DOMException && err.name === 'AbortError') msg = 'Request timed out.';
			else if (err instanceof Error) msg = err.message;
			chatStore.setError(msg);
		} finally {
			chatStore.finalizeMessage(assistantId);
			chatStore.setLoading(false);
			await scrollToBottom(true);
			tick().then(() => inputEl?.focus());
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
	}

	function autoResize(node: HTMLTextAreaElement) {
		function resize() {
			node.style.height = 'auto';
			node.style.height = Math.min(node.scrollHeight, 120) + 'px';
		}
		node.addEventListener('input', resize);
		return { destroy: () => node.removeEventListener('input', resize) };
	}

	function escapeHtml(text: string): string {
		return text
			.replaceAll('&', '&amp;').replaceAll('<', '&lt;')
			.replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
	}

	function renderMarkdown(text: string): string {
		return escapeHtml(text)
			.replace(/```(\w*)\n?([\s\S]*?)```/g, '<pre><code>$2</code></pre>')
			.replace(/`([^`]+)`/g, '<code>$1</code>')
			.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
			.replace(/\*(.+?)\*/g, '<em>$1</em>')
			.replace(/^### (.+)$/gm, '<h3>$1</h3>')
			.replace(/^## (.+)$/gm, '<h2>$1</h2>')
			.replace(/^# (.+)$/gm, '<h1>$1</h1>')
			.replace(/^[-*] (.+)$/gm, '<li>$1</li>')
			.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>')
			.replace(/^\d+\. (.+)$/gm, '<li>$1</li>')
			.replace(/<ul>\n/g, '<ul>')
			.replace(/\n<\/ul>/g, '</ul>')
			.replace(/<\/li>\n<li>/g, '</li><li>')
			.replace(/\n\n/g, '<br><br>')
			.replace(/\n/g, '<br>')
			.replace(/<ul><br>/g, '<ul>')
			.replace(/<br><\/ul>/g, '</ul>')
			.replace(/<\/li><br><li>/g, '</li><li>');
	}

	function formatTime(date: Date): string {
		return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
	}

	function formatHistoryTime(date: Date): string {
		const now = new Date();
		const sameDay =
			now.getFullYear() === date.getFullYear() &&
			now.getMonth() === date.getMonth() &&
			now.getDate() === date.getDate();

		if (sameDay) {
			return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
		}

		return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
	}

	function toggleHistoryPanel() {
		isHistoryOpen = !isHistoryOpen;
	}

	function startNewChat() {
		chatStore.startNewConversation();
		chatStore.setError(null);
		inputValue = '';
		isHistoryOpen = false;
		tick().then(() => inputEl?.focus());
	}

	function switchConversation(conversationId: string) {
		chatStore.switchConversation(conversationId);
		chatStore.setError(null);
		isHistoryOpen = false;
		tick().then(() => scrollToBottom(true));
	}

	function deleteConversation(event: MouseEvent, conversationId: string) {
		event.stopPropagation();
		chatStore.deleteConversation(conversationId);
		chatStore.setError(null);
	}

	const userName = $derived($user?.firstName ?? 'there');
	const suggestions = ['How do I borrow equipment?', 'Check my request status', 'Equipment return process'];
</script>

{#if !isOpen && !hasBlockingModal}
	<button
		onclick={() => chatStore.open()}
		class="fab-btn"
		aria-label="Open Aria Assistant"
		in:scale={{ duration: 300, easing: quintOut }}
	>
		<span class="fab-ring"></span>
		<span class="fab-inner">
			<Bot size={22} />
		</span>
	</button>
{/if}

{#if isOpen}
	<div
		class="backdrop"
		transition:fade={{ duration: 200 }}
		onclick={() => chatStore.close()}
		role="presentation"
	></div>

	<div
		class="chat-panel"
		transition:fly={{ y: 48, duration: 380, easing: quintOut }}
		role="dialog"
		aria-modal="true"
	>
		<div class="chat-header">
			<div class="flex items-center justify-between">
				<div class="flex items-center gap-3">
					<div class="ai-avatar">
						<Bot size={22} class="text-white" />
					</div>
					<div>
						<p class="text-lg font-bold text-white leading-tight">Aria</p>
						<p class="text-xs text-white/80 font-medium">AI Requisition & Inventory Assistant</p>
					</div>
				</div>

				<div class="flex items-center gap-0.5">
					<button onclick={toggleHistoryPanel} class="header-btn" title="Conversation history">
						<PanelLeft size={15} />
					</button>
					<button onclick={startNewChat} class="header-btn" title="New chat">
						<MessageSquarePlus size={15} />
					</button>
					{#if hasMessages}
					<button onclick={() => chatStore.clearMessages()} class="header-btn" title="Clear">
						<Trash2 size={15} />
					</button>
				{/if}
				<button onclick={() => chatStore.close()} class="header-btn">
						<Minimize2 size={17} />
					</button>
				</div>
			</div>
		</div>

		<div bind:this={messagesEl} onscroll={handleScroll} class="messages-area">
			{#if isHistoryOpen}
				<div class="history-inline" in:fade={{ duration: 140 }}>
					<div class="history-inline-header">
						<div class="history-title-wrap">
							<History size={14} class="history-icon" />
							<p class="history-title">Conversation history</p>
						</div>
						<div class="history-inline-actions">
							<button onclick={startNewChat} class="history-new-btn">
								<MessageSquarePlus size={14} />
								<span>Start new conversation</span>
							</button>
							<button onclick={() => { isHistoryOpen = false; }} class="history-close-btn" aria-label="Hide history panel">
								<X size={14} />
							</button>
						</div>
					</div>

					<div class="history-list">
						{#if conversations.length === 0}
							<p class="history-empty">No saved conversations yet.</p>
						{:else}
							{#each conversations as conversation (conversation.id)}
								<div
									role="button"
									tabindex="0"
									onclick={() => switchConversation(conversation.id)}
									onkeydown={(event) => {
										if (event.key === 'Enter' || event.key === ' ') {
											event.preventDefault();
											switchConversation(conversation.id);
										}
									}}
									class="history-item {conversation.id === activeConversationId ? 'active' : ''}"
								>
									<div class="history-item-copy">
										<p class="history-item-title">{conversation.title}</p>
										<p class="history-item-meta">
											{formatHistoryTime(conversation.updatedAt)} · {conversation.messages.length} messages
										</p>
									</div>
									<button
										onclick={(event) => deleteConversation(event, conversation.id)}
										class="history-delete-btn"
										aria-label="Delete conversation"
									>
										<Trash2 size={13} />
									</button>
								</div>
							{/each}
						{/if}
					</div>
				</div>
			{/if}

			{#if !hasMessages}
				<div class="welcome-state" in:fade={{ duration: 300 }}>
					<div class="welcome-icon">
						<Bot size={26} class="text-pink-500" />
					</div>
					<div class="space-y-1">
						<p class="text-base font-semibold text-gray-900">Hi, {userName} 👋</p>
						<p class="text-sm text-gray-500 leading-relaxed">I am ARIA (AI Requisition & Inventory Assistant), your assistant for CHTM Cooks.<br>How can I help you today?</p>
					</div>
					<div class="flex flex-wrap justify-center gap-2 mt-1">
						{#each suggestions as s}
						<button onclick={() => { inputValue = s; sendMessage(); }} class="suggestion-chip">{s}</button>
						{/each}
					</div>
				</div>
			{:else}
				<div class="flex flex-col gap-5">
					{#each messages as message (message.id)}
						{#if message.role === 'user'}
							<div class="flex justify-end" in:fly={{ x: 16, duration: 220, easing: cubicOut }}>
								<div class="user-bubble">
									<p class="text-sm leading-relaxed text-white">{message.content}</p>
									<p class="mt-1.5 text-right text-[10px] text-white/50">{formatTime(message.timestamp)}</p>
								</div>
							</div>
						{:else}
							<div class="flex items-start gap-2.5" in:fly={{ x: -16, duration: 220, easing: cubicOut }}>
								<div class="bot-avatar">
									<Bot size={16} class="text-white" />
								</div>
								<div class="max-w-[84%]">
									<div class="assistant-bubble">
										{#if message.content}
											<div class="prose">{@html renderMarkdown(message.content)}</div>
										{:else}
											<div class="flex items-center gap-1 py-0.5">
												<span class="typing-dot" style="animation-delay: 0ms"></span>
												<span class="typing-dot" style="animation-delay: 160ms"></span>
												<span class="typing-dot" style="animation-delay: 320ms"></span>
											</div>
										{/if}
									</div>
									<p class="mt-1 pl-1 text-[10px] text-gray-400">{formatTime(message.timestamp)}</p>
								</div>
							</div>
						{/if}
					{/each}

					{#if $chatStore.error}
						<div class="error-banner" in:fade>
							<RotateCcw size={14} class="mt-0.5 shrink-0 text-red-500" />
							<p class="text-xs text-red-700 flex-1">{$chatStore.error}</p>
							<button onclick={() => chatStore.setError(null)} class="text-red-400 hover:text-red-600">
								<X size={12} />
							</button>
						</div>
					{/if}
				</div>
			{/if}
		</div>

		{#if !isAtBottom && hasMessages}
			<button onclick={() => scrollToBottom(true)} class="scroll-btn" in:scale={{ duration: 150 }}>
				<ChevronDown size={15} class="text-gray-600" />
			</button>
		{/if}

		<div class="input-area">
			<div class="input-wrapper">
				<textarea
					bind:this={inputEl}
					bind:value={inputValue}
					onkeydown={handleKeydown}
					use:autoResize
					rows={1}
					placeholder="Message Aria…"
					disabled={isLoading}
					class="input-field"
					style="max-height: 120px; min-height: 22px;"
				></textarea>
			<button onclick={sendMessage} disabled={!canSend} class="send-btn {canSend ? 'active' : ''}">
					{#if isLoading}
						<svg class="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
							<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
							<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
						</svg>
					{:else}
						<Send size={16} />
					{/if}
				</button>
			</div>
			<p class="mt-1.5 text-center text-[10px] text-gray-400">Press Enter to send · Shift+Enter for new line</p>
		</div>
	</div>
{/if}

<style>
	.fab-btn {
		position: fixed;
		bottom: 80px;
		right: 16px;
		z-index: 9990;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 56px;
		height: 56px;
		border: none;
		cursor: pointer;
		transition: transform 0.2s ease;
	}
	@media (min-width: 1024px) {
		.fab-btn {
			bottom: 24px;
			right: 24px;
		}
	}
	.fab-btn:hover { transform: scale(1.08); }
	.fab-btn:active { transform: scale(0.95); }

	.fab-ring {
		position: absolute;
		inset: -4px;
		border-radius: 50%;
		background: conic-gradient(from 0deg, #f9a8d4, #ec4899, #be185d, #f9a8d4);
		animation: spin 4s linear infinite;
		opacity: 0.5;
	}
	.fab-inner {
		position: relative;
		z-index: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 56px;
		height: 56px;
		border-radius: 50%;
		background: linear-gradient(135deg, #db2777, #be185d);
		color: white;
		box-shadow: 0 8px 24px rgba(219, 39, 119, 0.45);
	}

	@keyframes spin { to { transform: rotate(360deg); } }

	.backdrop {
		position: fixed;
		inset: 0;
		z-index: 9989;
		background: rgba(0,0,0,0.4);
		backdrop-filter: blur(4px);
	}
	@media (min-width: 1024px) { .backdrop { display: none; } }

	.chat-panel {
		position: fixed;
		bottom: 0;
		right: 0;
		z-index: 9990;
		display: flex;
		flex-direction: column;
		width: 100%;
		height: calc(100dvh - 140px);
		border-radius: 24px 24px 0 0;
		background: white;
		box-shadow: 0 32px 80px rgba(0,0,0,0.18), 0 0 0 1px rgba(0,0,0,0.06);
		overflow: hidden;
	}
	@media (min-width: 1024px) {
		.chat-panel {
			bottom: 24px;
			right: 24px;
			width: 400px;
			height: 680px;
			border-radius: 24px;
		}
	}

	.chat-header {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 18px 20px;
		background: linear-gradient(135deg, #db2777 0%, #be185d 100%);
		border-bottom: none;
		border-radius: 24px 24px 0 0;
	}
	@media (max-width: 1023px) {
		.chat-header {
			border-radius: 24px 24px 0 0;
		}
	}

	.ai-avatar {
		position: relative;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 44px;
		height: 44px;
		border-radius: 50%;
		background: rgba(255, 255, 255, 0.2);
		backdrop-filter: blur(10px);
		flex-shrink: 0;
	}

	.avatar-pulse {
		display: none;
	}

	.status-dot {
		display: none;
	}

	@keyframes blink {
		0%, 100% { opacity: 1; }
		50% { opacity: 0.4; }
	}

	.header-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		border-radius: 8px;
		border: none;
		background: rgba(255, 255, 255, 0.15);
		color: white;
		cursor: pointer;
		transition: all 0.15s;
	}
	.header-btn:hover { background: rgba(255, 255, 255, 0.25); }

	.history-inline {
		display: flex;
		flex-direction: column;
		gap: 12px;
		margin-bottom: 14px;
		padding: 14px;
		background: linear-gradient(180deg, rgba(255, 255, 255, 0.99), rgba(255, 248, 252, 0.98));
		border: 1px solid #f4d7e4;
		border-radius: 18px;
		box-shadow: 0 10px 24px rgba(17, 24, 39, 0.06);
	}

	.history-inline-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
	}

	.history-inline-actions {
		display: inline-flex;
		align-items: center;
		gap: 8px;
	}

	.history-title-wrap {
		display: inline-flex;
		align-items: center;
		gap: 8px;
	}

	.history-icon {
		color: #be185d;
	}

	.history-title {
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: #374151;
	}

	.history-close-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		border: 1px solid #e5e7eb;
		border-radius: 8px;
		background: #fff;
		color: #6b7280;
		cursor: pointer;
	}

	.history-close-btn:hover {
		background: #f9fafb;
	}

	.history-new-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 7px;
		padding: 9px 12px;
		border: 1px solid #f9a8d4;
		border-radius: 12px;
		background: #fff7fb;
		color: #be185d;
		font-size: 12px;
		font-weight: 700;
		cursor: pointer;
	}

	.history-new-btn:hover {
		background: #ffeef7;
	}

	.history-list {
		display: flex;
		flex-direction: column;
		gap: 8px;
		max-height: 180px;
		overflow-y: auto;
		padding-right: 2px;
	}

	.history-empty {
		padding: 12px;
		font-size: 12px;
		color: #6b7280;
		text-align: center;
	}

	.history-item {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		width: 100%;
		padding: 11px 12px;
		border: 1px solid #ead7e0;
		border-radius: 14px;
		background: rgba(255, 255, 255, 0.96);
		text-align: left;
		cursor: pointer;
		box-shadow: 0 1px 4px rgba(15, 23, 42, 0.04);
	}

	.history-item:hover {
		border-color: #ec4899;
		background: #fff8fc;
		box-shadow: 0 6px 16px rgba(219, 39, 119, 0.08);
	}

	.history-item.active {
		border-color: #ec4899;
		background: #fff1f7;
		box-shadow: 0 8px 18px rgba(219, 39, 119, 0.12);
	}

	.history-item-copy {
		min-width: 0;
		flex: 1;
	}

	.history-item-title {
		font-size: 13px;
		font-weight: 600;
		color: #111827;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.history-item-meta {
		margin-top: 2px;
		font-size: 11px;
		color: #6b7280;
	}

	.history-delete-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		border: 1px solid #e5e7eb;
		border-radius: 9px;
		background: #fff;
		color: #9ca3af;
		cursor: pointer;
		flex-shrink: 0;
	}

	.history-delete-btn:hover {
		border-color: #fecdd3;
		color: #e11d48;
		background: #fff1f2;
	}

	.messages-area {
		flex: 1;
		overflow-y: auto;
		padding: 24px 20px;
		background: #ffffff;
		scrollbar-width: thin;
		scrollbar-color: rgba(0,0,0,0.1) transparent;
	}

	.welcome-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		height: 100%;
		gap: 20px;
		text-align: center;
		padding: 0 8px;
	}

	.welcome-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 56px;
		height: 56px;
		border-radius: 16px;
		background: linear-gradient(135deg, #fdf2f8, #fce7f3);
		border: 1px solid #fbcfe8;
		box-shadow: 0 4px 16px rgba(219, 39, 119, 0.08);
	}

	.suggestion-chip {
		padding: 6px 14px;
		border-radius: 20px;
		border: 1px solid #fbcfe8;
		background: white;
		color: #be185d;
		font-size: 12px;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.15s;
		box-shadow: 0 1px 4px rgba(0,0,0,0.06);
	}
	.suggestion-chip:hover {
		background: #fdf2f8;
		border-color: #f9a8d4;
		box-shadow: 0 2px 8px rgba(219, 39, 119, 0.12);
		transform: translateY(-1px);
	}

	.user-bubble {
		max-width: 78%;
		background: linear-gradient(135deg, #db2777, #be185d);
		border-radius: 18px 18px 4px 18px;
		padding: 10px 14px;
		box-shadow: 0 4px 12px rgba(219, 39, 119, 0.25);
	}

	.bot-avatar {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 36px;
		height: 36px;
		margin-top: 2px;
		border-radius: 50%;
		background: linear-gradient(135deg, #db2777, #be185d);
		flex-shrink: 0;
	}

	.assistant-bubble {
		background: #f3f4f6;
		border-radius: 20px;
		padding: 14px 16px;
		border: none;
		box-shadow: none;
	}

	.prose {
		font-size: 15px;
		line-height: 1.5;
		color: #374151;
	}
	.prose :global(h1),
	.prose :global(h2),
	.prose :global(h3) {
		margin: 0 0 8px;
		line-height: 1.35;
		color: #111827;
	}
	.prose :global(ul),
	.prose :global(ol) {
		margin: 6px 0 8px;
		padding-left: 18px;
	}
	.prose :global(li) {
		margin: 0;
		padding: 0;
		line-height: 1.45;
	}
	.prose :global(li + li) {
		margin-top: 3px;
	}
	.prose :global(p) {
		margin: 0 0 8px;
	}
	.prose :global(p:last-child) {
		margin-bottom: 0;
	}
	.prose :global(code) {
		background: #fdf2f8;
		color: #be185d;
		padding: 2px 6px;
		border-radius: 4px;
		font-size: 12px;
		font-family: monospace;
	}
	.prose :global(pre) {
		background: #1f2937;
		color: #f3f4f6;
		padding: 12px;
		border-radius: 8px;
		overflow-x: auto;
	}
	.prose :global(pre code) {
		background: transparent;
		color: inherit;
		padding: 0;
	}

	.typing-dot {
		display: inline-block;
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: #d1d5db;
		animation: bounce 1.2s ease-in-out infinite;
	}

	@keyframes bounce {
		0%, 80%, 100% { transform: translateY(0); background: #d1d5db; }
		40% { transform: translateY(-6px); background: #ec4899; }
	}

	.error-banner {
		display: flex;
		align-items: flex-start;
		gap: 10px;
		padding: 12px 16px;
		border-radius: 12px;
		background: #fff1f2;
		border: 1px solid #fecdd3;
	}

	.scroll-btn {
		position: absolute;
		bottom: 76px;
		right: 16px;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 30px;
		height: 30px;
		border-radius: 50%;
		border: 1px solid #e5e7eb;
		background: white;
		cursor: pointer;
		box-shadow: 0 2px 8px rgba(0,0,0,0.1);
		transition: box-shadow 0.15s;
	}
	.scroll-btn:hover { box-shadow: 0 4px 12px rgba(0,0,0,0.15); }

	.input-area {
		padding: 14px 20px 18px;
		background: white;
		border-top: 1px solid #e5e7eb;
	}

	.input-wrapper {
		position: relative;
		display: flex;
		align-items: center;
		border: 2px solid #db2777;
		border-radius: 28px;
		padding: 0;
		background: white;
		transition: all 0.15s;
	}
	.input-wrapper:focus-within {
		box-shadow: 0 0 0 3px rgba(219, 39, 119, 0.1);
	}

	.input-field {
		flex: 1;
		resize: none;
		background: transparent;
		border: none;
		outline: none;
		padding: 12px 54px 12px 18px;
		font-size: 14px;
		line-height: 1.5;
		color: #1f2937;
	}
	.input-field::placeholder {
		color: #9ca3af;
	}
	.input-field:disabled {
		opacity: 0.5;
	}

	.send-btn {
		position: absolute;
		right: 6px;
		top: 50%;
		transform: translateY(-50%);
		display: flex;
		align-items: center;
		justify-content: center;
		width: 36px;
		height: 36px;
		border-radius: 50%;
		border: none;
		background: #d1d5db;
		color: white;
		box-shadow: none;
		cursor: pointer;
		transition: all 0.15s;
		flex-shrink: 0;
	}
	.send-btn:hover:not(:disabled) {
		background: #9ca3af;
	}
	.send-btn:active:not(:disabled) { transform: translateY(-50%) scale(0.95); }
	.send-btn:disabled {
		background: #e5e7eb;
		color: #9ca3af;
		cursor: not-allowed;
	}
	.send-btn:not(:disabled).active {
		background: linear-gradient(135deg, #db2777, #be185d);
		box-shadow: 0 2px 8px rgba(219, 39, 119, 0.3);
	}
</style>
