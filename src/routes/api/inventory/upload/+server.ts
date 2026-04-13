import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getUserFromToken } from '$lib/server/middleware/auth/verify';
import { rateLimit, RateLimitPresets } from '$lib/server/middleware/rateLimit';
import { logger } from '$lib/server/utils/logger';
import { storageService } from '$lib/server/services/storage';

/**
 * POST /api/inventory/upload
 * Upload an inventory item image
 */
export const POST: RequestHandler = async (event) => {
	const { request, getClientAddress } = event;
	
	// Apply rate limiting
	const rateLimitResult = await rateLimit(event, RateLimitPresets.INVENTORY_IMAGE_UPLOAD);
	if (rateLimitResult instanceof Response) {
		return rateLimitResult;
	}

	try {
		// Verify authentication via cookie
		const decoded = getUserFromToken(event);
		
		if (!decoded) {
			return json({ error: 'Unauthorized' }, { status: 401 });
		}

		// Only custodians and superadmins can upload images
		if (!['custodian', 'superadmin'].includes(decoded.role)) {
			return json({ error: 'Forbidden: Insufficient permissions' }, { status: 403 });
		}

		// Parse multipart form data
		const formData = await request.formData();
		const file = formData.get('file') as File;

		if (!file) {
			return json({ error: 'No file provided' }, { status: 400 });
		}

		// Upload using storage service (handles validation automatically)
		const uploadResult = await storageService.upload(file, {
			folder: 'inventory',
			tags: ['inventory-item']
		});

		logger.info('Image uploaded', {
			userId: decoded.userId,
			provider: uploadResult.provider,
			size: uploadResult.size,
			format: uploadResult.format,
			url: uploadResult.url
		});

		return json({ 
			success: uploadResult.success,
			url: uploadResult.url,
			publicId: uploadResult.publicId,
			filename: uploadResult.filename,
			provider: uploadResult.provider
		}, { status: 201 });

	} catch (error) {
		logger.error('Error uploading image', { error });
		const message = error instanceof Error ? error.message : 'Failed to upload image';
		const isValidationError =
			message.toLowerCase().includes('file size exceeds') ||
			message.toLowerCase().includes('invalid file type') ||
			message.toLowerCase().includes('no file provided');
		return json({ error: message }, { status: isValidationError ? 400 : 500 });
	}
};
