import { sendEmail } from './client';
import { borrowRequestUpdateTemplate } from './templates';
import QRCode from 'qrcode';
import { v2 as cloudinary } from 'cloudinary';
import { env } from '$env/dynamic/private';
import { logger } from '$lib/server/utils/logger';

export interface BorrowRequestEmailPayload {
	to: string;
	firstName: string;
	title: string;
	summary: string;
	requestCode: string;
	statusLabel: string;
	roleLabel: string;
	ctaPath: string;
	items: string[];
	notes?: string;
	qrRawValue?: string;
	qrCaption?: string;
}

function configureCloudinary(): boolean {
	const cloudName = env.CLOUDINARY_CLOUD_NAME || '';
	const apiKey = env.CLOUDINARY_API_KEY || '';
	const apiSecret = env.CLOUDINARY_API_SECRET || '';

	if (!cloudName || !apiKey || !apiSecret) {
		return false;
	}

	cloudinary.config({
		cloud_name: cloudName,
		api_key: apiKey,
		api_secret: apiSecret,
		secure: true
	});

	return true;
}

function toQrPublicId(rawValue: string): string {
	const normalized = rawValue.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
	return `email-qr/${normalized || 'borrow-request'}`;
}

async function buildQrImageUrl(rawValue: string): Promise<string | undefined> {
	if (!configureCloudinary()) {
		return `https://api.qrserver.com/v1/create-qr-code/?size=320x320&margin=10&data=${encodeURIComponent(rawValue)}`;
	}

	const dataUrl = await QRCode.toDataURL(rawValue, {
		width: 320,
		margin: 1,
		color: {
			dark: '#9D174D',
			light: '#FFFFFF'
		}
	});

	const folderBase = env.CLOUDINARY_FOLDER || 'chtm_cooks';
	const publicId = toQrPublicId(rawValue);

	const uploaded = await cloudinary.uploader.upload(dataUrl, {
		folder: `${folderBase}/emails`,
		public_id: publicId,
		overwrite: true,
		resource_type: 'image',
		format: 'png',
		tags: ['email', 'borrow-request', 'qr']
	});

	return uploaded.secure_url;
}

export async function sendBorrowRequestLifecycleEmail(payload: BorrowRequestEmailPayload): Promise<void> {
	let qrImageUrl: string | undefined;
	if (payload.qrRawValue) {
		try {
			qrImageUrl = await buildQrImageUrl(payload.qrRawValue);
		} catch (error) {
			logger.warn('Failed to upload QR code to Cloudinary for email', {
				error: error instanceof Error ? error.message : String(error),
				requestCode: payload.requestCode
			});
			qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=320x320&margin=10&data=${encodeURIComponent(payload.qrRawValue)}`;
		}
	}

	const html = borrowRequestUpdateTemplate({
		firstName: payload.firstName,
		title: payload.title,
		summary: payload.summary,
		requestCode: payload.requestCode,
		statusLabel: payload.statusLabel,
		roleLabel: payload.roleLabel,
		ctaPath: payload.ctaPath,
		items: payload.items,
		notes: payload.notes,
		qrImageUrl,
		qrCaption: payload.qrCaption
	});

	await sendEmail({
		to: payload.to,
		subject: `CHTM Cooks Update: ${payload.title}`,
		html
	});
}
