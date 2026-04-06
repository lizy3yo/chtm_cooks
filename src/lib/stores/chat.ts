/**
 * AI Chatbot Store
 * Global state management for the AI assistant panel
 */

import { writable } from 'svelte/store';
import { browser } from '$app/environment';

export type MessageRole = 'user' | 'assistant' | 'system';

export interface ChatMessage {
	id: string;
	role: MessageRole;
	content: string;
	timestamp: Date;
	isStreaming?: boolean;
}

export interface ChatConversation {
	id: string;
	title: string;
	messages: ChatMessage[];
	createdAt: Date;
	updatedAt: Date;
}

interface ChatState {
	isOpen: boolean;
	messages: ChatMessage[];
	conversations: ChatConversation[];
	activeConversationId: string | null;
	isLoading: boolean;
	error: string | null;
}

interface PersistedChatMessage {
	id: string;
	role: MessageRole;
	content: string;
	timestamp: string;
}

interface PersistedChatState {
	version: number;
	activeConversationId?: string;
	conversations?: PersistedChatConversation[];
	messages: PersistedChatMessage[];
	updatedAt: string;
}

interface PersistedChatConversation {
	id: string;
	title: string;
	messages: PersistedChatMessage[];
	createdAt: string;
	updatedAt: string;
}

const CHAT_HISTORY_VERSION = 2;
const CHAT_HISTORY_MAX_MESSAGES = 80;
const CHAT_HISTORY_MAX_CONVERSATIONS = 40;
const CHAT_HISTORY_STORAGE_PREFIX = 'chtm:aria:chat-history';
const DEFAULT_CONVERSATION_TITLE = 'New chat';

const initialState: ChatState = {
	isOpen: false,
	messages: [],
	conversations: [],
	activeConversationId: null,
	isLoading: false,
	error: null
};

function createChatStore() {
	const { subscribe, update } = writable<ChatState>(initialState);

	let msgCounter = 0;
	let historyStorageKey: string | null = null;

	function createConversation(now = new Date()): ChatConversation {
		return {
			id: `conv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
			title: DEFAULT_CONVERSATION_TITLE,
			messages: [],
			createdAt: now,
			updatedAt: now
		};
	}

	function sortConversations(conversations: ChatConversation[]): ChatConversation[] {
		return [...conversations].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
	}

	function ensureConversationLimit(conversations: ChatConversation[]): ChatConversation[] {
		return sortConversations(conversations).slice(0, CHAT_HISTORY_MAX_CONVERSATIONS);
	}

	function makeConversationTitle(text: string): string {
		const normalized = text.trim().replace(/\s+/g, ' ');
		if (!normalized) return DEFAULT_CONVERSATION_TITLE;
		return normalized.length <= 64 ? normalized : `${normalized.slice(0, 61)}...`;
	}

	function hydrateActiveMessages(state: ChatState): ChatState {
		const activeId = state.activeConversationId ?? state.conversations[0]?.id ?? null;
		const activeConversation = activeId
			? state.conversations.find((conversation) => conversation.id === activeId) ?? null
			: null;

		return {
			...state,
			activeConversationId: activeConversation?.id ?? null,
			messages: activeConversation?.messages ?? []
		};
	}

	function toStorageKey(scope: string): string {
		return `${CHAT_HISTORY_STORAGE_PREFIX}:v${CHAT_HISTORY_VERSION}:${scope}`;
	}

	function normalizeScope(scope: string | null | undefined): string {
		const trimmed = (scope ?? '').trim();
		return trimmed.length > 0 ? trimmed : 'guest';
	}

	function toPersistedMessages(messages: ChatMessage[]): PersistedChatMessage[] {
		return messages
			.filter((m) => (m.role === 'user' || m.role === 'assistant') && m.content.trim().length > 0)
			.slice(-CHAT_HISTORY_MAX_MESSAGES)
			.map((m) => ({
				id: m.id,
				role: m.role,
				content: m.content,
				timestamp: m.timestamp.toISOString()
			}));
	}

	function fromPersistedMessages(messages: PersistedChatMessage[]): ChatMessage[] {
		return messages
			.filter((m) =>
				typeof m.id === 'string' &&
				(m.role === 'user' || m.role === 'assistant') &&
				typeof m.content === 'string' &&
				typeof m.timestamp === 'string'
			)
			.map((m) => ({
				id: m.id,
				role: m.role,
				content: m.content,
				timestamp: new Date(m.timestamp),
				isStreaming: false
			}))
			.filter((m) => !Number.isNaN(m.timestamp.getTime()));
	}

	function toPersistedConversations(conversations: ChatConversation[]): PersistedChatConversation[] {
		return ensureConversationLimit(conversations).map((conversation) => ({
			id: conversation.id,
			title: conversation.title,
			messages: toPersistedMessages(conversation.messages),
			createdAt: conversation.createdAt.toISOString(),
			updatedAt: conversation.updatedAt.toISOString()
		}));
	}

	function fromPersistedConversations(conversations: PersistedChatConversation[]): ChatConversation[] {
		return conversations
			.filter((conversation) =>
				typeof conversation.id === 'string' &&
				typeof conversation.title === 'string' &&
				Array.isArray(conversation.messages) &&
				typeof conversation.createdAt === 'string' &&
				typeof conversation.updatedAt === 'string'
			)
			.map((conversation) => ({
				id: conversation.id,
				title: conversation.title.trim() || DEFAULT_CONVERSATION_TITLE,
				messages: fromPersistedMessages(conversation.messages),
				createdAt: new Date(conversation.createdAt),
				updatedAt: new Date(conversation.updatedAt)
			}))
			.filter(
				(conversation) =>
					!Number.isNaN(conversation.createdAt.getTime()) &&
					!Number.isNaN(conversation.updatedAt.getTime())
			);
	}

	function persistState(state: ChatState): void {
		if (!browser || !historyStorageKey) return;

		const payload: PersistedChatState = {
			version: CHAT_HISTORY_VERSION,
			activeConversationId: state.activeConversationId ?? undefined,
			conversations: toPersistedConversations(state.conversations),
			messages: toPersistedMessages(state.messages),
			updatedAt: new Date().toISOString()
		};

		try {
			localStorage.setItem(historyStorageKey, JSON.stringify(payload));
		} catch (error) {
			console.warn('[ChatStore] Failed to persist chat history.', error);
		}
	}

	function migrateV1ToConversations(messages: ChatMessage[]): ChatConversation[] {
		const now = new Date();
		const conversation = createConversation(now);
		const userSeed = messages.find((message) => message.role === 'user' && message.content.trim().length > 0);
		conversation.title = userSeed ? makeConversationTitle(userSeed.content) : DEFAULT_CONVERSATION_TITLE;
		conversation.messages = messages.slice(-CHAT_HISTORY_MAX_MESSAGES);
		conversation.updatedAt = now;
		return [conversation];
	}

	function readHistory(scope: string): { conversations: ChatConversation[]; activeConversationId: string | null } {
		if (!browser) {
			const fallback = createConversation();
			return {
				conversations: [fallback],
				activeConversationId: fallback.id
			};
		}

		const key = toStorageKey(scope);
		historyStorageKey = key;

		try {
			const raw = localStorage.getItem(key);
			if (!raw) {
				const fallback = createConversation();
				return {
					conversations: [fallback],
					activeConversationId: fallback.id
				};
			}

			const parsed = JSON.parse(raw) as Partial<PersistedChatState>;
			if (parsed.version === CHAT_HISTORY_VERSION && Array.isArray(parsed.conversations)) {
				const conversations = fromPersistedConversations(parsed.conversations);
				const bounded = ensureConversationLimit(conversations);
				const activeConversationId =
					typeof parsed.activeConversationId === 'string' ? parsed.activeConversationId : bounded[0]?.id ?? null;

				return {
					conversations: bounded,
					activeConversationId
				};
			}

			if (parsed.version === 1 && Array.isArray(parsed.messages)) {
				const migratedMessages = fromPersistedMessages(parsed.messages as PersistedChatMessage[]);
				const conversations = migrateV1ToConversations(migratedMessages);
				return {
					conversations,
					activeConversationId: conversations[0]?.id ?? null
				};
			}

			return {
				conversations: [createConversation()],
				activeConversationId: null
			};
		} catch (error) {
			console.warn('[ChatStore] Failed to load chat history.', error);
			return {
				conversations: [createConversation()],
				activeConversationId: null
			};
		}
	}

	function ensureActiveConversation(state: ChatState): ChatState {
		if (state.activeConversationId && state.conversations.some((c) => c.id === state.activeConversationId)) {
			return state;
		}

		const fallbackConversation = state.conversations[0] ?? createConversation();
		const conversations = state.conversations.length > 0 ? state.conversations : [fallbackConversation];
		return {
			...state,
			conversations,
			activeConversationId: fallbackConversation.id
		};
	}

	return {
		subscribe,

		initializeHistory: (scope?: string) => {
			if (!browser) return;

			const historyScope = normalizeScope(scope);
			const loaded = readHistory(historyScope);
			update((s) => {
				const nextState = hydrateActiveMessages({
					...s,
					conversations: loaded.conversations,
					activeConversationId: loaded.activeConversationId,
					error: null
				});
				persistState(nextState);
				return nextState;
			});
		},

		open: () => update((s) => ({ ...s, isOpen: true })),
		close: () => update((s) => ({ ...s, isOpen: false })),
		toggle: () => update((s) => ({ ...s, isOpen: !s.isOpen })),

		addMessage: (role: MessageRole, content: string): string => {
			const id = `msg-${Date.now()}-${msgCounter++}`;
			update((s) => {
				const now = new Date();
				const baseState = ensureActiveConversation(s);
				const activeConversationId = baseState.activeConversationId!;

				const conversations = baseState.conversations.map((conversation) => {
					if (conversation.id !== activeConversationId) return conversation;

					const messages = [...conversation.messages, { id, role, content, timestamp: now }];
					const nextTitle =
						role === 'user' && conversation.title === DEFAULT_CONVERSATION_TITLE
							? makeConversationTitle(content)
							: conversation.title;

					return {
						...conversation,
						title: nextTitle,
						messages: messages.slice(-CHAT_HISTORY_MAX_MESSAGES),
						updatedAt: now
					};
				});

				const nextState = hydrateActiveMessages({
					...baseState,
					conversations: ensureConversationLimit(conversations),
					activeConversationId
				});
				persistState(nextState);
				return nextState;
			});
			return id;
		},

		appendToMessage: (id: string, chunk: string) => {
			update((s) => {
				if (!s.activeConversationId) return s;

				const now = new Date();
				const conversations = s.conversations.map((conversation) => {
					if (conversation.id !== s.activeConversationId) return conversation;

					return {
						...conversation,
						messages: conversation.messages.map((m) =>
							m.id === id ? { ...m, content: m.content + chunk, isStreaming: true } : m
						),
						updatedAt: now
					};
				});

				const nextState = hydrateActiveMessages({
					...s,
					conversations
				});
				persistState(nextState);
				return nextState;
			});
		},

		finalizeMessage: (id: string) => {
			update((s) => {
				if (!s.activeConversationId) return s;

				const now = new Date();
				const conversations = s.conversations.map((conversation) => {
					if (conversation.id !== s.activeConversationId) return conversation;

					return {
						...conversation,
						messages: conversation.messages.map((m) =>
							m.id === id ? { ...m, isStreaming: false } : m
						),
						updatedAt: now
					};
				});

				const nextState = hydrateActiveMessages({
					...s,
					conversations
				});
				persistState(nextState);
				return nextState;
			});
		},

		startNewConversation: () => {
			update((s) => {
				const conversation = createConversation();
				const conversations = ensureConversationLimit([conversation, ...s.conversations]);
				const nextState = hydrateActiveMessages({
					...s,
					conversations,
					activeConversationId: conversation.id,
					error: null
				});
				persistState(nextState);
				return nextState;
			});
		},

		switchConversation: (conversationId: string) => {
			update((s) => {
				if (!s.conversations.some((conversation) => conversation.id === conversationId)) {
					return s;
				}

				const nextState = hydrateActiveMessages({
					...s,
					activeConversationId: conversationId,
					error: null
				});
				persistState(nextState);
				return nextState;
			});
		},

		deleteConversation: (conversationId: string) => {
			update((s) => {
				const remaining = s.conversations.filter((conversation) => conversation.id !== conversationId);
				const conversations = remaining.length > 0 ? remaining : [createConversation()];
				const fallbackActiveId =
					s.activeConversationId === conversationId
						? conversations[0].id
						: s.activeConversationId ?? conversations[0].id;

				const nextState = hydrateActiveMessages({
					...s,
					conversations: sortConversations(conversations),
					activeConversationId: fallbackActiveId,
					error: null
				});
				persistState(nextState);
				return nextState;
			});
		},

		setLoading: (isLoading: boolean) => update((s) => ({ ...s, isLoading })),
		setError: (error: string | null) => update((s) => ({ ...s, error })),

		clearMessages: () =>
			update((s) => {
				if (!s.activeConversationId) return s;

				const now = new Date();
				const conversations = s.conversations.map((conversation) =>
					conversation.id === s.activeConversationId
						? {
							...conversation,
							title: DEFAULT_CONVERSATION_TITLE,
							messages: [],
							updatedAt: now
						}
						: conversation
				);

				const nextState = hydrateActiveMessages({
					...s,
					conversations,
					error: null
				});
				persistState(nextState);
				return nextState;
			})
	};
}

export const chatStore = createChatStore();
