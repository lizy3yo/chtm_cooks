import { sendEmail } from './client';
import { emailVerificationTemplate, emailVerificationSuccessTemplate } from './templates';

/**
 * Send email verification email to user
 * @param email - User's email address
 * @param firstName - User's first name
 * @param verificationToken - Verification token
 * @returns Promise that resolves when email is sent
 */
export async function sendVerificationEmail(
	email: string,
	firstName: string,
	verificationToken: string
): Promise<void> {
	try {
		const html = emailVerificationTemplate(firstName, verificationToken);

		await sendEmail({
			to: email,
			subject: 'Verify Your CHTM Cooks Account',
			html
		});

		console.log(`✅ Verification email sent to: ${email}`);
	} catch (error) {
		console.error(`❌ Failed to send verification email to ${email}:`, error);
		throw new Error('Failed to send verification email. Please try again later.');
	}
}

/**
 * Send email verification success notification
 * @param email - User's email address
 * @param firstName - User's first name
 * @returns Promise that resolves when email is sent
 */
export async function sendVerificationSuccessEmail(
	email: string,
	firstName: string
): Promise<void> {
	try {
		const html = emailVerificationSuccessTemplate(firstName);

		await sendEmail({
			to: email,
			subject: 'Email Verified - Welcome to CHTM Cooks! 🎉',
			html
		});

		console.log(`✅ Verification success email sent to: ${email}`);
	} catch (error) {
		console.error(`❌ Failed to send verification success email to ${email}:`, error);
		// Don't throw here as this is just a notification
	}
}
