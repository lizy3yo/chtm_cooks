import Bytez from 'bytez.js';
import { GoogleGenAI } from '@google/genai';
import { env } from '$env/dynamic/private';

export type ChatRole = 'user' | 'assistant';

export interface ChatMessage {
	role: ChatRole;
	content: string;
}

export type ChatUserRole = 'student' | 'instructor' | 'custodian' | 'unknown';

export interface ChatContext {
	userRole?: string | null;
}

class ChatServiceError extends Error {
	status: number;

	constructor(message: string, status: number) {
		super(message);
		this.name = 'ChatServiceError';
		this.status = status;
	}
}

const MODEL_CASCADE = [
	'meta-llama/Llama-3.2-3B-Instruct',
	'mistralai/Mistral-7B-Instruct-v0.3',
	'meta-llama/Llama-2-7b-chat-hf',
	'openai/gpt-oss-20b'
] as const;

const MAX_HISTORY_MESSAGES = 12;
const MODEL_OPTIONS = { temperature: 0.4 };
const ENABLE_LOCAL_FALLBACK = true;
const MODEL_QUARANTINE_MS = 10 * 60 * 1000;
const MODEL_FAILURE_THRESHOLD = 2;
const GOOGLE_DEFAULT_MODEL = 'gemini-3-flash-preview';
const GOOGLE_DEFAULT_TIMEOUT_MS = 25000;

type ModelId = (typeof MODEL_CASCADE)[number];

const modelFailureState = new Map<ModelId, { count: number; quarantinedUntil: number }>();

const BASE_SYSTEM_PROMPT = `You are an intelligent assistant for CHTM Cooks - a laboratory equipment management system used by a culinary and hospitality school.

## About the System
CHTM Cooks is a digital platform that manages the borrowing, tracking, and return of culinary laboratory equipment. It serves three types of users:

- Students - Browse available equipment, submit borrow requests, track request status, and return items.
- Instructors - Review and approve or reject student borrow requests, monitor active loans, and manage unresolved incidents.
- Custodians - Prepare approved equipment for pickup, confirm student pickups, process item returns with condition inspection, manage inventory, and handle replacement obligations.

## Key Workflows You Can Explain

### How to Submit a Borrow Request (Students)
1. Log in to the student portal.
2. Browse the equipment catalog and select the items needed.
3. Specify the borrow date, return date, and purpose.
4. Submit the request - it goes to the instructor for review.
5. Once the instructor approves, the custodian prepares the items.
6. The student picks up the equipment from the custodian when notified.
7. On the return date, the student returns the items to the custodian for inspection.

### Request Status Flow
- Pending - Awaiting instructor approval.
- In Preparation - Instructor approved; custodian is preparing the items.
- Ready for Pickup - Items are staged and ready for the student to collect.
- Active / On Loan - Student has picked up the equipment.
- Return Requested - Student has initiated the return process.
- Returned / Completed - Items returned and inspected; request closed.
- Unresolved - Items reported damaged or missing; replacement obligations may apply.
- Cancelled / Rejected - Request was cancelled by the student or rejected by the instructor.

### Equipment and Inventory
- The catalog lists all available culinary equipment (knives, bowls, mixers, scales, processors, etc.).
- Each item has a name, category, condition, quantity, and availability status.
- Constant items always appear on request forms regardless of stock.
- Low-stock and out-of-stock items are flagged for custodian attention.

### Replacement Obligations
- If a returned item is found damaged or missing during inspection, a replacement obligation is created.
- The student is notified and must fulfill the obligation before borrowing again.

### Reports and Analytics
- Instructors and custodians can view usage reports, borrow trends, and equipment utilization data.

## How to Respond
- Always use a professional, industry-standard support tone.
- Be concise, clear, and practical. Prioritize actionable guidance.
- Maintain proper grammar and punctuation. Avoid slang, sarcasm, jokes, and emojis.
- Use neutral, respectful language suitable for academic and administrative users.
- Guide users step by step when they ask how to do something.
- If a user asks about equipment availability, explain how to check the catalog.
- If a user asks about their request status, explain the status definitions above.
- If the user intent is unclear, ask one brief clarifying question.
- Use markdown formatting (short headings, bullet points, numbered steps) to keep answers easy to scan.
- When relevant, present the response in this order:
	1. Direct answer
	2. Steps or details
	3. What to do next
- If you do not know something specific about the user's account, clearly state that limitation and direct them to the relevant portal section.
- Always stay on topic - only answer questions related to CHTM Cooks and its features.`;

function normalizeUserRole(role: string | null | undefined): ChatUserRole {
	const normalized = (role ?? '').trim().toLowerCase();
	if (normalized === 'student' || normalized === 'instructor' || normalized === 'custodian') {
		return normalized;
	}

	return 'unknown';
}

function buildRoleGuidance(role: ChatUserRole): string {
	if (role === 'student') {
		return `
## Role Context
The current authenticated user role is Student.

## Student-Specific Guidance Rules
- Prioritize student tasks: requesting equipment, tracking request status, pickup, return steps, and obligations.
- Provide clear student action items with prerequisites and deadlines.
- For policy-sensitive actions (approval, inspection, inventory edits), explain that these are handled by Instructor or Custodian roles.
- Do not suggest actions that require elevated permissions.`;
	}

	if (role === 'instructor') {
		return `
## Role Context
The current authenticated user role is Instructor.

## Instructor-Specific Guidance Rules
- Prioritize instructor tasks: reviewing requests, approval/rejection decisions, monitoring active loans, and unresolved incidents.
- Emphasize decision criteria, workflow checkpoints, and communication with students/custodians.
- When asked about actions outside instructor permissions (inventory preparation/inspection), direct to Custodian workflows.
- Keep recommendations auditable and policy-aligned.`;
	}

	if (role === 'custodian') {
		return `
## Role Context
The current authenticated user role is Custodian.

## Custodian-Specific Guidance Rules
- Prioritize custodian tasks: preparing approved items, confirming pickup, return inspection, inventory updates, and replacement obligations.
- Focus on operational accuracy: item condition checks, quantity verification, and status transitions.
- For approval decisions, clearly state those are instructor-controlled actions.
- Provide step-by-step procedures that reduce handling errors.`;
	}

	return `
## Role Context
The current user role is not explicitly available.

## Guidance Rule
- Ask one brief clarifying question for role (Student, Instructor, or Custodian) before giving role-specific workflow steps when role context is required.`;
}

function buildSystemPrompt(role: ChatUserRole): string {
	return `${BASE_SYSTEM_PROMPT}\n${buildRoleGuidance(role)}`;
}

let bytezClient: Bytez | null = null;
let aiProviderQueueTail: Promise<void> = Promise.resolve();

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runInProviderQueue<T>(operation: () => Promise<T>): Promise<T> {
	const previous = aiProviderQueueTail;
	let release!: () => void;
	aiProviderQueueTail = new Promise<void>((resolve) => {
		release = resolve;
	});

	await previous;

	try {
		return await operation();
	} finally {
		release();
	}
}

function getBytezClient(): Bytez {
	const apiKey = env.BYTEZ_API_KEY;
	if (!apiKey) {
		throw new ChatServiceError('AI service is not configured. Please set BYTEZ_API_KEY.', 503);
	}

	if (!bytezClient) {
		bytezClient = new Bytez(apiKey, false, true);
	}

	return bytezClient;
}

function getGoogleApiKey(): string | null {
	const key = env.GEMINI_API_KEY ?? env.GOOGLE_API_KEY;
	if (typeof key !== 'string') return null;
	const trimmed = key.trim();
	return trimmed.length > 0 ? trimmed : null;
}

function getGoogleModelId(): string {
	const configured = env.GOOGLE_AI_MODEL?.trim();
	return configured && configured.length > 0 ? configured : GOOGLE_DEFAULT_MODEL;
}

function getGoogleTimeoutMs(): number {
	const configured = Number(env.GOOGLE_AI_TIMEOUT_MS ?? GOOGLE_DEFAULT_TIMEOUT_MS.toString());
	if (!Number.isFinite(configured) || configured < 5000) {
		return GOOGLE_DEFAULT_TIMEOUT_MS;
	}

	return configured;
}

function isSupportedRole(role: string): role is ChatRole {
	return role === 'user' || role === 'assistant';
}

function normalizeMessages(messages: ChatMessage[], role: ChatUserRole) {
	const filtered = messages
		.filter((m) => isSupportedRole(m.role) && typeof m.content === 'string' && m.content.trim().length > 0)
		.slice(-MAX_HISTORY_MESSAGES)
		.map((m) => ({ role: m.role, content: m.content.trim() }));

	return [{ role: 'system', content: buildSystemPrompt(role) }, ...filtered];
}

function normalizeConversation(messages: ChatMessage[]) {
	return messages
		.filter((m) => isSupportedRole(m.role) && typeof m.content === 'string' && m.content.trim().length > 0)
		.slice(-MAX_HISTORY_MESSAGES)
		.map((m) => ({ role: m.role, content: m.content.trim() }));
}

function toSseChunk(token: string): string {
	return `data: ${JSON.stringify({ choices: [{ delta: { content: token } }] })}\n\n`;
}

interface GeminiGenerateContentResponse {
	text?: string;
	candidates?: Array<{
		content?: {
			parts?: Array<{ text?: string }>;
		};
	}>;
}

interface BytezResultLike {
	error?: string;
	output?: unknown;
}

function isBytezResultLike(value: unknown): value is BytezResultLike {
	if (!value || typeof value !== 'object') return false;
	return 'error' in value || 'output' in value;
}

function extractTextFromOutput(output: unknown): string | null {
	if (typeof output === 'string' && output.trim().length > 0) {
		return output;
	}

	if (Array.isArray(output) && output.length > 0) {
		const first = output[0] as Record<string, unknown>;
		const generatedText = first?.generated_text;
		if (typeof generatedText === 'string' && generatedText.trim().length > 0) {
			return generatedText;
		}
	}

	if (output && typeof output === 'object') {
		const maybeText = (output as Record<string, unknown>).text;
		if (typeof maybeText === 'string' && maybeText.trim().length > 0) {
			return maybeText;
		}
	}

	return null;
}

function createSingleChunkResponse(text: string): Response {
	const encoder = new TextEncoder();
	const stream = new ReadableStream({
		start(controller) {
			controller.enqueue(encoder.encode(toSseChunk(text)));
			controller.enqueue(encoder.encode('data: [DONE]\n\n'));
			controller.close();
		}
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache, no-transform',
			Connection: 'keep-alive',
			'X-Accel-Buffering': 'no'
		}
	});
}

async function createGoogleAiResponse(
	messages: ChatMessage[],
	apiKey: string,
	role: ChatUserRole
): Promise<Response> {
	const configuredModel = getGoogleModelId();
	const modelId = configuredModel.replace(/^models\//, '');
	const timeoutMs = getGoogleTimeoutMs();
	const ai = new GoogleGenAI({ apiKey });

	const conversation = normalizeConversation(messages).map((m) => ({
		role: m.role === 'assistant' ? 'model' : 'user',
		parts: [{ text: m.content }]
	}));

	if (conversation.length === 0) {
		throw new Error('No user message available for Google AI request.');
	}

	try {
		const responsePromise = ai.models.generateContent({
			model: modelId,
			contents: conversation,
			config: {
				systemInstruction: buildSystemPrompt(role),
				temperature: MODEL_OPTIONS.temperature
			}
		});

		const response = await Promise.race([
			responsePromise,
			new Promise<never>((_, reject) => {
				setTimeout(() => reject(new Error(`Google AI request timed out after ${timeoutMs}ms.`)), timeoutMs);
			})
		]);

		const payload = response as GeminiGenerateContentResponse;
		const directText = typeof payload.text === 'string' ? payload.text.trim() : '';
		const answer = directText ||
			payload.candidates?.[0]?.content?.parts
				?.map((part) => (typeof part.text === 'string' ? part.text : ''))
				.join('')
				.trim();

		if (!answer) {
			throw new Error('Google AI returned no usable output.');
		}

		return createSingleChunkResponse(answer);
	} catch (error) {
		if (error instanceof Error) {
			throw new Error(`Google AI (${modelId}) failed: ${error.message}`);
		}

		throw new Error(`Google AI (${modelId}) failed with an unknown error.`);
	}
}

function getLatestUserPrompt(messages: ChatMessage[]): string {
	for (let i = messages.length - 1; i >= 0; i--) {
		if (messages[i].role === 'user') {
			return messages[i].content.trim();
		}
	}

	return '';
}

function getRoleSpecificFallbackTail(role: ChatUserRole): string {
	if (role === 'student') {
		return 'Student context detected: I will focus on student actions and next steps you can perform in your portal.';
	}

	if (role === 'instructor') {
		return 'Instructor context detected: I will focus on review, approval, and oversight workflows.';
	}

	if (role === 'custodian') {
		return 'Custodian context detected: I will focus on preparation, inspection, inventory handling, and obligation processing.';
	}

	return 'To provide role-specific steps, please confirm your role: Student, Instructor, or Custodian.';
}

function buildLocalFallbackReply(userPrompt: string, role: ChatUserRole): string {
	const prompt = userPrompt.toLowerCase();

	if (/borrow|request|hiram|hulong|how to borrow/.test(prompt)) {
		return [
			'The standard borrow request flow in CHTM Cooks is as follows:',
			'',
			'1. Open the catalog and select the equipment you need.',
			'2. Set borrow date, return date, and purpose.',
			'3. Submit the request for instructor review.',
			'4. Wait for status to move to Ready for Pickup.',
			'5. Claim the items from the custodian and return them on schedule.',
			'',
			'For a more precise guide, share your role (Student, Instructor, or Custodian) and I can provide a role-specific checklist.'
		].join('\n');
	}

	if (/status|pending|ready|pickup|loan|return requested|unresolved/.test(prompt)) {
		return [
			'Request statuses are interpreted as follows:',
			'',
			'- Pending: waiting for instructor approval.',
			'- In Preparation: approved and being prepared by custodian.',
			'- Ready for Pickup: items can be claimed.',
			'- Active / On Loan: items are with the borrower.',
			'- Return Requested: return has been initiated.',
			'- Returned / Completed: request is closed.',
			'- Unresolved: damaged or missing item under replacement process.'
		].join('\n');
	}

	if (/available|availability|catalog|stock|inventory/.test(prompt)) {
		return [
			'To check equipment availability:',
			'',
			'1. Go to the catalog or inventory page.',
			'2. Search by item name or category.',
			'3. Review quantity and status indicators (low stock/out of stock).',
			'4. Submit only items currently available unless marked as constant items.'
		].join('\n');
	}

	if (/damaged|missing|replacement|obligation/.test(prompt)) {
		return [
			'If an item is damaged or missing after return inspection:',
			'',
			'1. The request may be marked Unresolved.',
			'2. A replacement obligation is created for the borrower.',
			'3. The borrower must complete the obligation before normal borrowing resumes.'
		].join('\n');
	}

	return [
		'I can assist with CHTM Cooks workflows, including borrowing, request statuses, returns, inventory checks, and replacement obligations.',
		'',
		getRoleSpecificFallbackTail(role),
		'',
		'Please specify what you need help with, for example:',
		'- How to submit a borrow request',
		'- What my request status means',
		'- How return inspection and replacement obligations work'
	].join('\n');
}

function createLocalFallbackResponse(messages: ChatMessage[], reason: string, role: ChatUserRole): Response {
	const latestPrompt = getLatestUserPrompt(messages);
	const responseText = buildLocalFallbackReply(latestPrompt, role);
	console.warn(`[AI Chat] Using local fallback response due to: ${reason}`);
	return createSingleChunkResponse(responseText);
}

function toResponseFromModelResult(result: unknown, modelId: string): Response {
	if (isBytezResultLike(result)) {
		if (result.error) {
			throw new Error(result.error);
		}

		const outputText = extractTextFromOutput(result.output);
		if (outputText) {
			return createSingleChunkResponse(outputText);
		}
	}

	throw new Error(`Model ${modelId} returned no usable output.`);
}

function isRateLimitError(error: unknown): boolean {
	if (!(error instanceof Error)) return false;
	const message = error.message.toLowerCase();
	return message.includes('rate limited') || message.includes('limited to 1 request at a time');
}

function isProviderBodyError(error: unknown): boolean {
	if (!(error instanceof Error)) return false;
	return error.message.toLowerCase().includes("reading 'body'");
}

function isModelQuarantined(modelId: ModelId): boolean {
	const state = modelFailureState.get(modelId);
	if (!state) return false;
	if (state.quarantinedUntil <= Date.now()) {
		modelFailureState.set(modelId, { count: 0, quarantinedUntil: 0 });
		return false;
	}
	return true;
}

function markModelSuccess(modelId: ModelId): void {
	modelFailureState.set(modelId, { count: 0, quarantinedUntil: 0 });
}

function markModelFailure(modelId: ModelId): void {
	const current = modelFailureState.get(modelId) ?? { count: 0, quarantinedUntil: 0 };
	const nextCount = current.count + 1;
	if (nextCount >= MODEL_FAILURE_THRESHOLD) {
		modelFailureState.set(modelId, {
			count: nextCount,
			quarantinedUntil: Date.now() + MODEL_QUARANTINE_MS
		});
		console.warn(`[AI Chat] Quarantining model ${modelId} for ${MODEL_QUARANTINE_MS / 60000} minutes due to repeated failures.`);
		return;
	}

	modelFailureState.set(modelId, { count: nextCount, quarantinedUntil: 0 });
}

export async function createAiChatResponse(messages: ChatMessage[], context?: ChatContext): Promise<Response> {
	return runInProviderQueue(async () => {
		const userRole = normalizeUserRole(context?.userRole);
		const normalizedMessages = normalizeMessages(messages, userRole);
		const googleApiKey = getGoogleApiKey();
		let lastError: unknown;

		if (googleApiKey) {
			try {
				console.log(`[AI Chat] Trying Google AI model: ${getGoogleModelId()} for role: ${userRole}`);
				return await createGoogleAiResponse(messages, googleApiKey, userRole);
			} catch (error) {
				console.warn('[AI Chat] Google AI failed, trying Bytez fallback...', error);
				lastError = error;
			}
		} else {
			console.log('[AI Chat] GEMINI_API_KEY/GOOGLE_API_KEY is not set. Skipping Google AI provider.');
		}

		if (!env.BYTEZ_API_KEY) {
			console.log('[AI Chat] BYTEZ_API_KEY is not set. Skipping Bytez provider.');
			if (ENABLE_LOCAL_FALLBACK) {
				return createLocalFallbackResponse(messages, 'providers-not-configured-or-failed', userRole);
			}

			throw new ChatServiceError('AI service is not configured. Set GEMINI_API_KEY (or GOOGLE_API_KEY) and optionally BYTEZ_API_KEY for fallback.', 503);
		}

		const sdk = getBytezClient();

		for (const modelId of MODEL_CASCADE) {
			if (isModelQuarantined(modelId)) {
				console.log(`[AI Chat] Skipping quarantined model: ${modelId}`);
				continue;
			}

			try {
				console.log(`[AI Chat] Trying model: ${modelId}`);
				const model = sdk.model(modelId);
				const result = await model.run(normalizedMessages, MODEL_OPTIONS);
				const response = toResponseFromModelResult(result, modelId);
				markModelSuccess(modelId);
				return response;
			} catch (error) {
				if (isProviderBodyError(error)) {
					markModelFailure(modelId);
					console.warn(`[AI Chat] Provider response shape issue on ${modelId}, trying next fallback model.`);
					lastError = error;
					continue;
				}

				if (isRateLimitError(error)) {
					console.warn(`[AI Chat] Rate limited on ${modelId}, retrying after backoff...`);
					await sleep(1200);

					try {
						const retryModel = sdk.model(modelId);
						const retryResult = await retryModel.run(normalizedMessages, MODEL_OPTIONS);
						return toResponseFromModelResult(retryResult, modelId);
					} catch (retryError) {
						if (isRateLimitError(retryError)) {
							markModelFailure(modelId);
							if (ENABLE_LOCAL_FALLBACK) {
								return createLocalFallbackResponse(messages, 'provider-rate-limited', userRole);
							}

							throw new ChatServiceError('AI service is currently busy. Please wait a few seconds and try again.', 429);
						}

						console.warn(`[AI Chat] Retry failed on ${modelId}, trying next fallback...`, retryError);
						markModelFailure(modelId);
						lastError = retryError;
						continue;
					}
				}

				console.warn(`[AI Chat] Model ${modelId} failed, trying next fallback...`, error);
				markModelFailure(modelId);
				lastError = error;
			}
		}

		console.error('[AI Chat] All models failed:', lastError);
		if (ENABLE_LOCAL_FALLBACK) {
			return createLocalFallbackResponse(messages, 'all-models-failed', userRole);
		}

		throw new ChatServiceError('AI service is temporarily unavailable. Please try again later.', 502);
	});
}

export function toChatServiceError(error: unknown): ChatServiceError {
	if (error instanceof ChatServiceError) {
		return error;
	}

	return new ChatServiceError('Unable to process AI chat request.', 500);
}
