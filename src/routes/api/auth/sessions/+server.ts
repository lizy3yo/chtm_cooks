import { json } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { rememberMeService } from '$lib/server/services/auth';
import { verifyAccessToken } from '$lib/server/utils/jwt';

/**
 * Sessions Management Endpoint
 * 
 * GET: Get all active sessions for the authenticated user
 * DELETE: Revoke a specific session
 */

/**
 * Get all active sessions for the user
 */
export const GET = async (event: RequestEvent) => {
	try {
		// Get and verify access token
		const authHeader = event.request.headers.get('Authorization');
		if (!authHeader?.startsWith('Bearer ')) {
			return json({ error: 'Unauthorized' }, { status: 401 });
		}
		
		const token = authHeader.substring(7);
		let payload;
		
		try {
			payload = verifyAccessToken(token);
		} catch (error) {
			return json({ error: 'Invalid or expired token' }, { status: 401 });
		}
		
		// Get sessions for user
		const sessions = await rememberMeService.getUserSessions(payload.userId);
		
		return json({ sessions }, { status: 200 });
	} catch (error) {
		console.error('Get sessions error:', error);
		return json({ error: 'Failed to retrieve sessions' }, { status: 500 });
	}
};

/**
 * Revoke a specific session
 */
export const DELETE = async (event: RequestEvent) => {
	try {
		const { request } = event;
		
		// Get and verify access token
		const authHeader = request.headers.get('Authorization');
		if (!authHeader?.startsWith('Bearer ')) {
			return json({ error: 'Unauthorized' }, { status: 401 });
		}
		
		const token = authHeader.substring(7);
		let payload;
		
		try {
			payload = verifyAccessToken(token);
		} catch (error) {
			return json({ error: 'Invalid or expired token' }, { status: 401 });
		}
		
		const body = await request.json();
		if (!body.sessionId) {
			return json({ error: 'Session ID required' }, { status: 400 });
		}
		
		// Revoke the session
		const success = await rememberMeService.revokeToken(
			body.sessionId,
			'Revoked by user'
		);
		
		if (!success) {
			return json({ error: 'Session not found' }, { status: 404 });
		}
		
		return json(
			{ success: true, message: 'Session revoked successfully' },
			{ status: 200 }
		);
	} catch (error) {
		console.error('Revoke session error:', error);
		return json({ error: 'Failed to revoke session' }, { status: 500 });
	}
};
