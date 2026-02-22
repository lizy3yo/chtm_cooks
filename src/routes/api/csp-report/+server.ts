/**
 * CSP Report Endpoint
 * Receives Content Security Policy violation reports
 * 
 * POST /api/csp-report
 * 
 * Browsers automatically send violation reports here when:
 * - A resource is blocked by CSP
 * - An inline script/style violates CSP
 * - eval() or similar is blocked
 * 
 * To enable CSP reporting, add to your security config:
 * report-uri /api/csp-report
 * 
 * Reports are logged and can be sent to monitoring services
 */

import type { RequestHandler } from './$types';
import { handleCSPReport } from '$lib/server/middleware/security';

/**
 * Handle CSP violation reports
 */
export const POST: RequestHandler = async ({ request }) => {
	return handleCSPReport(request);
};
