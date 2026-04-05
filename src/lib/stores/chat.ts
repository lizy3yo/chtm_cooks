/**
 * AI Chatbot Store
 * Global state management for the AI assistant panel
 */

import { writable } from 'svelte/store';

export type MessageRole = 'user' | 'assistant' | 'system';

export interface ChatMessage {
	id: string;
	role: MessageRole;
	content: string;
	timestamp: Date;
	isStreaming?: boolean;
}

interface ChatState {
	isOpen: boolean;
	messages: ChatMessage[];
	isLoading: boolean;
	error: string | null;
}

const initialState: ChatState = {
	isOpen: false,
	messages: [],
	isLoading: false,
	error: null
};

function createChatStore() {
	const { subscribe, update, set } = writable<ChatState>(initialState);

	let msgCounter = 0;

	return {
		subscribe,

		open: () => update((s) => ({ ...s, isOpen: true })),
		close: () => update((s) => ({ ...s, isOpen: false })),
		toggle: () => update((s) => ({ ...s, isOpen: !s.isOpen })),

		addMessage: (role: MessageRole, content: string): string => {
			const id = `msg-${Date.now()}-${msgCounter++}`;
			update((s) => ({
				...s,
				messages: [
					...s.messages,
					{ id, role, content, timestamp: new Date() }
				]
			}));
			return id;
		},

		appendToMessage: (id: string, chunk: string) => {
			update((s) => ({
				...s,
				messages: s.messages.map((m) =>
					m.id === id ? { ...m, content: m.content + chunk, isStreaming: true } : m
				)
			}));
		},

		finalizeMessage: (id: string) => {
			update((s) => ({
				...s,
				messages: s.messages.map((m) =>
					m.id === id ? { ...m, isStreaming: false } : m
				)
			}));
		},

		setLoading: (isLoading: boolean) => update((s) => ({ ...s, isLoading })),
		setError: (error: string | null) => update((s) => ({ ...s, error })),

		clearMessages: () =>
			update((s) => ({ ...s, messages: [], error: null }))
	};
}

export const chatStore = createChatStore();
