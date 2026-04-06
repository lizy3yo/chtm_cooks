// Email service exports
export { getEmailTransporter, verifyEmailConnection, sendEmail } from './client';
export {
	emailVerificationTemplate,
	passwordResetTemplate,
	passwordResetSuccessTemplate,
	emailVerificationSuccessTemplate,
	borrowRequestUpdateTemplate
} from './templates';
export { sendVerificationEmail, sendVerificationSuccessEmail } from './verification';
export { sendPasswordResetEmail, sendPasswordResetSuccessEmail } from './passwordReset';
export { sendBorrowRequestLifecycleEmail, type BorrowRequestEmailPayload } from './borrowRequestNotifications';
