/**
 * Failed Logins API
 *
 * GET /api/security/failed-logins
 *   Returns failed login attempts from the last 24 hours.
 *   Superadmin only.
 *
 * DELETE /api/security/failed-logins
 *   Clears all failed login records (audit purge).
 *   Superadmin only.
 */

import { json } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { getDatabase } from '$lib/server/db/mongodb';
import { requireRole } from '$lib/server/middleware/auth/verify';
import type { FailedLoginAttempt } from '$lib/server/models/SecuritySettings';

const WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours

export const GET = async (event: RequestEvent) => {
try {
requireRole(event, ['superadmin']);
} catch {
return json({ error: 'Unauthorized' }, { status: 401 });
}

try {
const db = await getDatabase();
const since = new Date(Date.now() - WINDOW_MS);

const attempts = await db
.collection<FailedLoginAttempt>('failed_logins')
.find({ occurredAt: { $gte: since } })
.sort({ occurredAt: -1 })
.limit(200)
.toArray();

const result = attempts.map((a) => ({
id: a._id!.toString(),
ip: a.ip,
attemptedUser: a.email,
reason: a.reason,
risk: a.risk,
timestamp: a.occurredAt.toISOString(),
userAgent: a.userAgent ?? null
}));

return json({ failedLogins: result, total: result.length });
} catch (error) {
console.error('[security/failed-logins] GET error:', error);
return json({ error: 'Failed to retrieve failed login attempts' }, { status: 500 });
}
};

export const DELETE = async (event: RequestEvent) => {
try {
requireRole(event, ['superadmin']);
} catch {
return json({ error: 'Unauthorized' }, { status: 401 });
}

try {
const db = await getDatabase();
const result = await db.collection('failed_logins').deleteMany({});
return json({ deleted: result.deletedCount });
} catch (error) {
console.error('[security/failed-logins] DELETE error:', error);
return json({ error: 'Failed to clear failed login records' }, { status: 500 });
}
};
