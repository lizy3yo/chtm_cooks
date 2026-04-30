/**
 * Offline-First Donations API
 * 
 * Wraps existing donations API with offline capabilities
 */

import { offlineFetch } from './offlineFirst';
import { donationsAPI, type DonationRecord, type CreateDonationInput } from '../donations';

export const donationsOfflineAPI = {
	/**
	 * List donations with offline support
	 */
	async list(params: {
		status?: 'pending' | 'approved' | 'rejected';
		search?: string;
		page?: number;
		limit?: number;
	} = {}): Promise<{ donations: DonationRecord[]; total: number; page: number; limit: number; pages: number }> {
		try {
			const query = new URLSearchParams();
			if (params.status) query.set('status', params.status);
			if (params.search) query.set('search', params.search);
			if (params.page) query.set('page', params.page.toString());
			if (params.limit) query.set('limit', params.limit.toString());

			const url = `/api/donations${query.toString() ? `?${query.toString()}` : ''}`;

			const data = await offlineFetch<{ donations: DonationRecord[]; total: number; page: number; limit: number; pages: number }>(url, {
				strategy: 'cache-first',
				cacheTable: 'donations',
				method: 'GET'
			});

			return data;
		} catch (error) {
			console.error('[DonationsOffline] List failed:', error);
			throw error;
		}
	},

	/**
	 * Get donation by ID with offline support
	 */
	async getById(id: string): Promise<DonationRecord> {
		try {
			const data = await offlineFetch<DonationRecord>(`/api/donations/${id}`, {
				strategy: 'cache-first',
				cacheTable: 'donations',
				method: 'GET'
			});

			return data;
		} catch (error) {
			console.error('[DonationsOffline] GetById failed:', error);
			throw error;
		}
	},

	/**
	 * Create donation with offline support
	 */
	async create(payload: CreateDonationInput): Promise<DonationRecord> {
		try {
			const data = await offlineFetch<DonationRecord>('/api/donations', {
				method: 'POST',
				body: JSON.stringify(payload),
				queueIfOffline: true,
				actionType: 'CREATE_DONATION',
				cacheTable: 'donations'
			});

			donationsAPI.invalidateCache();
			return data;
		} catch (error) {
			console.error('[DonationsOffline] Create failed:', error);
			throw error;
		}
	},

	/**
	 * Approve donation with offline support
	 */
	async approve(id: string): Promise<DonationRecord> {
		try {
			const data = await offlineFetch<DonationRecord>(`/api/donations/${id}/approve`, {
				method: 'POST',
				queueIfOffline: true,
				actionType: 'UPDATE_REQUEST',
				cacheTable: 'donations'
			});

			donationsAPI.invalidateCache();
			return data;
		} catch (error) {
			console.error('[DonationsOffline] Approve failed:', error);
			throw error;
		}
	},

	/**
	 * Reject donation with offline support
	 */
	async reject(id: string, reason: string): Promise<DonationRecord> {
		try {
			const data = await offlineFetch<DonationRecord>(`/api/donations/${id}/reject`, {
				method: 'POST',
				body: JSON.stringify({ reason }),
				queueIfOffline: true,
				actionType: 'UPDATE_REQUEST',
				cacheTable: 'donations'
			});

			donationsAPI.invalidateCache();
			return data;
		} catch (error) {
			console.error('[DonationsOffline] Reject failed:', error);
			throw error;
		}
	},

	/**
	 * Invalidate cache
	 */
	invalidateCache(): void {
		donationsAPI.invalidateCache();
	},

	/**
	 * Subscribe to real-time changes
	 */
	subscribeToChanges(callback: (event: any) => void): () => void {
		return donationsAPI.subscribeToChanges(callback);
	}
};
