import { sendEmail } from './client';
import { passwordResetTemplate, passwordResetSuccessTemplate } from './templates';

/**
 * Send password reset email to user
 * @param email - User's email address
 * @param firstName - User's first name
 * @param resetToken - Password reset token
 * @returns Promise that resolves when email is sent
 */
export async function sendPasswordResetEmail(
	email: string,
	firstName: string,
	resetToken: string
): Promise<void> {
	try {
		console.log(`[Password Reset Email] Generating template for: ${email}`);
		const html = passwordResetTemplate(firstName, resetToken);

		console.log(`[Password Reset Email] Template generated, sending email...`);

		await sendEmail({
			to: email,
			subject: 'Reset Your CHTM Cooks Password',
			html
		});

		console.log(`[Password Reset Email] ✅ Password reset email sent to: ${email}`);
	} catch (error) {
		console.error(`[Password Reset Email] ❌ Failed to send password reset email to ${email}:`, error);
		if (error instanceof Error) {
			console.error(`[Password Reset Email] Error details: ${error.message}`);
		}
		throw new Error('Failed to send password reset email. Please try again later.');
	}
}

/**
 * Send password reset success notification
 * @param email - User's email address
 * @param firstName - User's first name
 * @returns Promise that resolves when email is sent
 */
export async function sendPasswordResetSuccessEmail(
	email: string,
	firstName: string
): Promise<void> {
	try {
		const html = passwordResetSuccessTemplate(firstName);

		await sendEmail({
			to: email,
			subject: 'Password Reset Successful - CHTM Cooks',
			html
		});

		console.log(`✅ Password reset success email sent to: ${email}`);
	} catch (error) {
		console.error(`❌ Failed to send password reset success email to ${email}:`, error);
		// Don't throw here as this is just a notification
	}
}
