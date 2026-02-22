import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import {
	EMAIL_HOST,
	EMAIL_PORT,
	EMAIL_USER,
	EMAIL_PASSWORD,
	EMAIL_FROM
} from '$env/static/private';

let transporter: Transporter | null = null;

/**
 * Get or create nodemailer transporter instance (singleton pattern)
 * @returns Configured nodemailer transporter
 */
export function getEmailTransporter(): Transporter {
	if (transporter) {
		return transporter;
	}

	// Validate email configuration
	if (!EMAIL_HOST || !EMAIL_PORT || !EMAIL_USER || !EMAIL_PASSWORD) {
		throw new Error('Email configuration is incomplete. Please check your environment variables.');
	}

	// Create transporter with Gmail SMTP
	transporter = nodemailer.createTransport({
		host: EMAIL_HOST,
		port: parseInt(EMAIL_PORT),
		secure: false, // true for 465, false for other ports
		auth: {
			user: EMAIL_USER,
			pass: EMAIL_PASSWORD
		},
		// Additional options for better reliability
		pool: true, // Use pooled connections
		maxConnections: 5,
		maxMessages: 100,
		rateDelta: 1000, // Time between messages in ms
		rateLimit: 5 // Max messages per rateDelta
	});

	return transporter;
}

/**
 * Verify email transporter configuration
 * @returns Promise that resolves to true if connection is successful
 */
export async function verifyEmailConnection(): Promise<boolean> {
	try {
		const transporter = getEmailTransporter();
		await transporter.verify();
		console.log('✅ Email server connection verified');
		return true;
	} catch (error) {
		console.error('❌ Email server connection failed:', error);
		return false;
	}
}

/**
 * Send an email using the configured transporter
 * @param options - Email options (to, subject, html, text)
 * @returns Promise that resolves to the send result
 */
export async function sendEmail(options: {
	to: string;
	subject: string;
	html: string;
	text?: string;
}) {
	try {
		const transporter = getEmailTransporter();

		const info = await transporter.sendMail({
			from: EMAIL_FROM || `"CHTM Cooks" <${EMAIL_USER}>`,
			to: options.to,
			subject: options.subject,
			html: options.html,
			text: options.text || options.html.replace(/<[^>]*>/g, '') // Strip HTML for text version
		});

		console.log('✅ Email sent successfully:', info.messageId);
		return {
			success: true,
			messageId: info.messageId
		};
	} catch (error) {
		console.error('❌ Failed to send email:', error);
		throw error;
	}
}
