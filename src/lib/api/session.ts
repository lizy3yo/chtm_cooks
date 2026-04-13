import { browser } from '$app/environment';
import { authStore } from '$lib/stores/auth';

let sessionExpiryPromise: Promise<void> | null = null;

async function triggerLogout(message: string): Promise<void> {
	if (!browser) return;

	if (!sessionExpiryPromise) {
		sessionExpiryPromise = (async () => {
			try {
				authStore.setError(message);
				await authStore.logout();
			} catch {
				// Ignore logout failures when the session is already gone.
			}
		})().finally(() => {
			sessionExpiryPromise = null;
		});
	}

	await sessionExpiryPromise;
}

export async function getApiErrorMessage(response: Response, fallbackMessage: string): Promise<string> {
	const payload = (await response.json().catch(() => ({}))) as { error?: string; message?: string };

	if (response.status === 401) {
		const message = 'Session expired. Please sign in again.';
		await triggerLogout(message);
		return message;
	}

	return payload.message || payload.error || fallbackMessage;
}
