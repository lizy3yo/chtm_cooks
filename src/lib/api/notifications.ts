export type NotificationType =
	| 'borrow_request_submitted'
	| 'borrow_request_pending_review'
	| 'borrow_request_approved'
	| 'borrow_request_rejected'
	| 'borrow_request_ready_for_pickup'
	| 'borrow_request_picked_up'
	| 'borrow_request_return_initiated'
	| 'borrow_request_returned'
	| 'borrow_request_missing'
	| 'borrow_request_item_issue'
	| 'borrow_request_cancelled'
	| 'borrow_request_reminder';

export interface NotificationRecord {
	id: string;
	userId: string;
	audienceRole: 'student' | 'instructor' | 'custodian' | 'superadmin';
	type: NotificationType;
	title: string;
	message: string;
	link?: string;
	borrowRequestId?: string;
	metadata?: Record<string, unknown>;
	isRead: boolean;
	readAt?: string;
	createdAt: string;
	updatedAt: string;
}

export interface NotificationListResponse {
	notifications: NotificationRecord[];
	unreadCount: number;
}

import { getApiErrorMessage } from './session';

interface ApiError {
	error?: string;
	message?: string;
}

async function handleResponse<T>(response: Response): Promise<T> {
	const payload = (await response.json().catch(() => ({}))) as T & ApiError;
	if (!response.ok) {
		throw new Error(
			await getApiErrorMessage(response, payload.message || payload.error || `Request failed with status ${response.status}`)
		);
	}
	return payload;
}

export const notificationsAPI = {
	async list(limit = 25, skip = 0): Promise<NotificationListResponse> {
		const query = new URLSearchParams({ limit: String(limit), skip: String(skip) });
		const response = await fetch(`/api/notifications?${query.toString()}`, {
			credentials: 'include'
		});
		return handleResponse<NotificationListResponse>(response);
	},

	async markAsRead(id: string): Promise<void> {
		const response = await fetch(`/api/notifications/${id}/read`, {
			method: 'POST',
			credentials: 'include'
		});
		await handleResponse<{ success: boolean }>(response);
	},

	async markAllAsRead(): Promise<number> {
		const response = await fetch('/api/notifications', {
			method: 'PATCH',
			credentials: 'include'
		});
		const payload = await handleResponse<{ success: boolean; markedCount: number }>(response);
		return payload.markedCount;
	}
};
