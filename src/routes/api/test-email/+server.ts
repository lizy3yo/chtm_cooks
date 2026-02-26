import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { sendPasswordResetEmail } from '$lib/server/services/email';
import { verifyEmailConnection } from '$lib/server/services/email';

/**
 * Test endpoint to diagnose email issues
 * POST /api/test-email
 */
export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();
		const { email, firstName, testType } = body;

		console.log(`[Test Email] Starting test: ${testType}`);

		if (testType === 'verify-connection') {
			// Test 1: Verify SMTP connection
			console.log('[Test Email] Testing SMTP connection...');
			const connectionOk = await verifyEmailConnection();
			
			return json({
				success: connectionOk,
				message: connectionOk 
					? 'SMTP connection successful' 
					: 'SMTP connection failed - check logs',
				testType: 'verify-connection'
			});
		}

		if (testType === 'send-test-email') {
			// Test 2: Send actual password reset email
			if (!email || !firstName) {
				return json(
					{ error: 'Email and firstName required for this test' },
					{ status: 400 }
				);
			}

			console.log(`[Test Email] Sending test password reset email to: ${email}`);
			
			// Generate a test token
			const testToken = 'test-token-' + Date.now();

			await sendPasswordResetEmail(email, firstName, testToken);

			return json({
				success: true,
				message: `Password reset email sent to ${email}`,
				testType: 'send-test-email',
				note: 'Check your email and server logs'
			});
		}

		return json(
			{ error: 'Invalid testType. Use "verify-connection" or "send-test-email"' },
			{ status: 400 }
		);

	} catch (error) {
		console.error('[Test Email] Error:', error);
		return json(
			{
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error',
				details: error
			},
			{ status: 500 }
		);
	}
};

/**
 * GET endpoint to check email configuration
 */
export const GET: RequestHandler = async () => {
	try {
		const { EMAIL_HOST, EMAIL_PORT, EMAIL_USER } = await import('$env/static/private');
		
		return json({
			configured: !!(EMAIL_HOST && EMAIL_PORT && EMAIL_USER),
			config: {
				host: EMAIL_HOST || 'NOT SET',
				port: EMAIL_PORT || 'NOT SET',
				user: EMAIL_USER || 'NOT SET',
				passwordSet: !!(await import('$env/static/private')).EMAIL_PASSWORD
			}
		});
	} catch (error) {
		return json(
			{
				error: 'Failed to check configuration',
				details: error instanceof Error ? error.message : 'Unknown error'
			},
			{ status: 500 }
		);
	}
};
