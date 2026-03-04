/**
 * Cloudinary Storage Provider
 * Enterprise-grade image storage with automatic optimization
 */

import { v2 as cloudinary, type UploadApiResponse } from 'cloudinary';
import type { StorageProvider, UploadResult, UploadOptions, DeleteOptions } from './types';
import { logger } from '$lib/server/utils/logger';

export class CloudinaryProvider implements StorageProvider {
	public readonly name = 'Cloudinary';
	private isConfigured = false;

	constructor(config: { cloudName: string; apiKey: string; apiSecret: string }) {
		try {
			cloudinary.config({
				cloud_name: config.cloudName,
				api_key: config.apiKey,
				api_secret: config.apiSecret,
				secure: true
			});
			this.isConfigured = true;
			logger.info('Cloudinary provider initialized', { cloudName: config.cloudName });
		} catch (error) {
			logger.error('Failed to initialize Cloudinary', { error });
			throw new Error('Cloudinary configuration failed');
		}
	}

	/**
	 * Upload image to Cloudinary with automatic optimization
	 */
	async upload(file: File, options: UploadOptions = {}): Promise<UploadResult> {
		if (!this.isConfigured) {
			throw new Error('Cloudinary not configured');
		}

		try {
			// Convert File to Buffer
			const arrayBuffer = await file.arrayBuffer();
			const buffer = Buffer.from(arrayBuffer);

			// Create upload promise
			const uploadResult = await new Promise<UploadApiResponse>((resolve, reject) => {
				const uploadStream = cloudinary.uploader.upload_stream(
					{
						folder: options.folder || 'inventory',
						resource_type: 'image',
						allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
						transformation: [
							{
								quality: 'auto:good', // Automatic quality optimization
								fetch_format: 'auto' // Automatic format selection (WebP, AVIF)
							}
						],
						tags: options.tags || ['inventory'],
						use_filename: false,
						unique_filename: true
					},
					(error, result) => {
						if (error) reject(error);
						else if (result) resolve(result);
						else reject(new Error('Upload failed without error'));
					}
				);

				uploadStream.end(buffer);
			});

			logger.info('Image uploaded to Cloudinary', {
				publicId: uploadResult.public_id,
				format: uploadResult.format,
				size: uploadResult.bytes
			});

			return {
				success: true,
				url: uploadResult.secure_url,
				publicId: uploadResult.public_id,
				size: uploadResult.bytes,
				format: uploadResult.format,
				provider: this.name
			};
		} catch (error) {
			logger.error('Cloudinary upload failed', { error });
			throw new Error(`Failed to upload to Cloudinary: ${error}`);
		}
	}

	/**
	 * Delete image from Cloudinary
	 */
	async delete(options: DeleteOptions): Promise<boolean> {
		if (!this.isConfigured) {
			throw new Error('Cloudinary not configured');
		}

		if (!options.publicId) {
			throw new Error('publicId is required for Cloudinary delete');
		}

		try {
			const result = await cloudinary.uploader.destroy(options.publicId);
			
			if (result.result === 'ok') {
				logger.info('Image deleted from Cloudinary', { publicId: options.publicId });
				return true;
			}

			logger.warn('Failed to delete image from Cloudinary', { 
				publicId: options.publicId,
				result 
			});
			return false;
		} catch (error) {
			logger.error('Cloudinary delete error', { error, publicId: options.publicId });
			return false;
		}
	}

	/**
	 * Check if Cloudinary is accessible
	 */
	async healthCheck(): Promise<boolean> {
		if (!this.isConfigured) {
			return false;
		}

		try {
			// Ping Cloudinary API
			await cloudinary.api.ping();
			return true;
		} catch (error) {
			logger.error('Cloudinary health check failed', { error });
			return false;
		}
	}
}
