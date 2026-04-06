import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createAiChatResponse, toChatServiceError, type ChatMessage } from '$lib/server/services/aiChat';

interface ChatRequestBody {
	messages?: Array<{ role: string; content: string }>;
}

export const POST: RequestHandler = async ({ request, locals }) => {
	let body: ChatRequestBody;

	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid request body.' }, { status: 400 });
	}

	const incomingMessages = Array.isArray(body.messages) ? body.messages : [];
	const messages: ChatMessage[] = incomingMessages
		.filter((m): m is { role: 'user' | 'assistant'; content: string } =>
			(m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string'
		)
		.map((m) => ({ role: m.role, content: m.content }));

	if (messages.length === 0) {
		return json({ error: 'At least one user message is required.' }, { status: 400 });
	}

	try {
		return await createAiChatResponse(messages, {
			userRole: locals.user?.role ?? locals.userRole ?? null,
			userId: locals.user?.userId ?? locals.userId ?? null,
			userEmail: locals.user?.email ?? null
		});
	} catch (error) {
		const serviceError = toChatServiceError(error);
		if (serviceError.status === 429) {
			return json(
				{ error: serviceError.message },
				{ status: serviceError.status, headers: { 'Retry-After': '2' } }
			);
		}

		return json({ error: serviceError.message }, { status: serviceError.status });
	}
};
