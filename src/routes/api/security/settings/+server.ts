/**
 * Security Settings API
 *
 * GET  /api/security/settings  — Fetch current security settings (superadmin only)
 * PUT  /api/security/settings  — Update security settings (superadmin only)
 *
 * Manages:
 *  - IP blacklist (blockedIPs)
 *  - 2FA enforcement flag
 *  - Session timeout
 */

import { json } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { getDatabase } from '$lib/server/db/mongodb';
import { requireRole } from '$lib/server/middleware/auth/verify';
import {
	type SecuritySettingsDocument,
	DEFAULT_SECURITY_SETTINGS
} from '$lib/server/models/SecuritySettings';

const COLLECTION = 'security_settings';

/** Fetch or initialise the singleton settings document */
async function getSettings(): Promise<SecuritySettingsDocument> {
	const db = await getDatabase();
	const doc = await db
		.collection<SecuritySettingsDocument>(COLLECTION)
		.findOne({ key: 'global' });

	if (!doc) {
		// First-time initialisation
		const defaults = { ...DEFAULT_SECURITY_SETTINGS, updatedAt: new Date() };
		await db.collection<SecuritySettingsDocument>(COLLECTION).insertOne(defaults);
		return defaults as SecuritySettingsDocument;
	}

	return doc;
}

export const GET = async (event: RequestEvent) => {
	try {
		requireRole(event, ['superadmin']);
	} catch {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	try {
		const settings = await getSettings();
		return json({
			blockedIPs: settings.blockedIPs,
			require2FA: settings.require2FA,
			sessionTimeoutMinutes: settings.sessionTimeoutMinutes,
			updatedAt: settings.updatedAt.toISOString()
		});
	} catch (error) {
		console.error('[security/settings] GET error:', error);
		return json({ error: 'Failed to retrieve security settings' }, { status: 500 });
	}
};

export const PUT = async (event: RequestEvent) => {
	let user;
	try {
		user = requireRole(event, ['superadmin']);
	} catch {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	try {
		const body = await event.request.json();

		// Validate and sanitise each field independently so partial updates work
		const update: Partial<SecuritySettingsDocument> = { updatedAt: new Date(), updatedBy: user.email };

		if (Array.isArray(body.blockedIPs)) {
			// Validate each entry is a plausible IP / CIDR string
			const ipPattern = /^[\d.:a-fA-F/]+$/;
			const sanitised = (body.blockedIPs as unknown[])
				.filter((ip): ip is string => typeof ip === 'string' && ipPattern.test(ip.trim()))
				.map((ip) => ip.trim());
			update.blockedIPs = [...new Set(sanitised)]; // deduplicate
		}

		if (typeof body.require2FA === 'boolean') {
			update.require2FA = body.require2FA;
		}

		if (typeof body.sessionTimeoutMinutes === 'number') {
			const allowed = [15, 30, 60, 120, 480];
			if (!allowed.includes(body.sessionTimeoutMinutes)) {
				return json({ error: 'Invalid session timeout value' }, { status: 400 });
			}
			update.sessionTimeoutMinutes = body.sessionTimeoutMinutes;
		}

		const db = await getDatabase();
		await db.collection<SecuritySettingsDocument>(COLLECTION).updateOne(
			{ key: 'global' },
			{ $set: update },
			{ upsert: true }
		);

		const updated = await getSettings();
		return json({
			blockedIPs: updated.blockedIPs,
			require2FA: updated.require2FA,
			sessionTimeoutMinutes: updated.sessionTimeoutMinutes,
			updatedAt: updated.updatedAt.toISOString()
		});
	} catch (error) {
		console.error('[security/settings] PUT error:', error);
		return json({ error: 'Failed to update security settings' }, { status: 500 });
	}
};
