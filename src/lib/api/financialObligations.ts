import { browser } from '$app/environment';

export type ObligationType = 'missing' | 'damaged';
export type ObligationStatus = 'pending' | 'paid' | 'replaced' | 'waived';
export type ResolutionType = 'payment' | 'replacement' | 'waiver';

export interface FinancialObligation {
	id: string;
	borrowRequestId: string;
	studentId: string;
	studentName?: string;
	studentEmail?: string;
	itemId: string;
	itemName: string;
	itemCategory?: string;
	quantity: number;
	type: ObligationType;
	status: ObligationStatus;
	amount: number;
	amountPaid: number;
	balance: number;
	resolutionType?: ResolutionType;
	resolutionDate?: string;
	resolutionNotes?: string;
	paymentReference?: string;
	incidentDate: string;
	incidentNotes?: string;
	dueDate: string;
	createdAt: string;
	updatedAt: string;
}

export interface FinancialObligationsListResponse {
	obligations: FinancialObligation[];
	total: number;
	page: number;
	limit: number;
	pages: number;
}

export interface ResolveObligationRequest {
	resolutionType: ResolutionType;
	amountPaid?: number;
	resolutionNotes?: string;
	paymentReference?: string;
}

interface ApiError {
	error?: string;
	message?: string;
}

function getFetchOptions(method: string, body?: unknown): RequestInit {
	const options: RequestInit = {
		method,
		credentials: 'include',
		headers: {
			'Content-Type': 'application/json'
		}
	};

	if (body !== undefined) {
		options.body = JSON.stringify(body);
	}

	return options;
}

async function handleResponse<T>(response: Response): Promise<T> {
	const payload = (await response.json().catch(() => ({}))) as T & ApiError;

	if (!response.ok) {
		const message = payload.message || payload.error || `Request failed with status ${response.status}`;
		throw new Error(message);
	}

	return payload;
}

/**
 * Financial Obligations API Client
 * Industry-standard client for managing financial obligations
 */
export const financialObligationsAPI = {
	/**
	 * Get financial obligations with optional filters
	 */
	async getObligations(params: {
		status?: ObligationStatus;
		studentId?: string;
		page?: number;
		limit?: number;
	} = {}): Promise<FinancialObligationsListResponse> {
		try {
			const searchParams = new URLSearchParams();

			if (params.status) searchParams.set('status', params.status);
			if (params.studentId) searchParams.set('studentId', params.studentId);
			if (params.page) searchParams.set('page', params.page.toString());
			if (params.limit) searchParams.set('limit', params.limit.toString());

			const query = searchParams.toString();
			const url = `/api/financial-obligations${query ? `?${query}` : ''}`;

			const response = await fetch(url, getFetchOptions('GET'));
			return await handleResponse<FinancialObligationsListResponse>(response);
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to fetch obligations';
			throw new Error(message);
		}
	},

	/**
	 * Get a specific financial obligation
	 */
	async getObligation(id: string): Promise<{ obligation: FinancialObligation }> {
		try {
			const response = await fetch(`/api/financial-obligations/${id}`, getFetchOptions('GET'));
			return await handleResponse<{ obligation: FinancialObligation }>(response);
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to fetch obligation';
			throw new Error(message);
		}
	},

	/**
	 * Resolve a financial obligation (payment, replacement, or waiver)
	 */
	async resolveObligation(
		id: string,
		resolution: ResolveObligationRequest
	): Promise<{ success: boolean; message: string }> {
		try {
			const response = await fetch(`/api/financial-obligations/${id}`, getFetchOptions('PATCH', resolution));
			return await handleResponse<{ success: boolean; message: string }>(response);
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to resolve obligation';
			throw new Error(message);
		}
	}
};
