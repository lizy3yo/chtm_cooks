/**
 * Storage Service
 * Enterprise-grade image storage abstraction with automatic provider selection
 * 
 * Features:
 * - Cloudinary integration with automatic optimization
 * - Automatic fallback to local storage
 * - Environment-based configuration
 * - Health monitoring
 * - Industry-standard error handling
 */

import type { StorageProvider, StorageConfig, UploadResult, UploadOptions, DeleteOptions } from './types';
import { CloudinaryProvider } from './cloudinaryProvider';
import { LocalStorageProvider } from './localProvider';
import { logger } from '$lib/server/utils/logger';
import { env } from '$env/dynamic/private';

class StorageService {
	private provider: StorageProvider | null = null;
	private config: StorageConfig;
	private initialized = false;

	constructor() {
		this.config = this.loadConfig();
		this.initialize();
	}

	/**
	 * Load storage configuration from environment variables
	 */
	private loadConfig(): StorageConfig {
		const providerType = env.STORAGE_PROVIDER || 'local';

		const config: StorageConfig = {
			provider: providerType as 'cloudinary' | 'local',
			cloudinary: {
				cloudName: env.CLOUDINARY_CLOUD_NAME || '',
				apiKey: env.CLOUDINARY_API_KEY || '',
				apiSecret: env.CLOUDINARY_API_SECRET || '',
				folder: env.CLOUDINARY_FOLDER || 'inventory'
			},
			local: {
				uploadDir: 'static/uploads/inventory',
				publicPath: '/uploads/inventory'
			}
		};

		return config;
	}

	/**
	 * Initialize storage provider based on configuration
	 */
	private initialize(): void {
		try {
			// Try to initialize configured provider
			if (this.config.provider === 'cloudinary' && this.isCloudinaryConfigured()) {
				this.provider = new CloudinaryProvider({
					cloudName: this.config.cloudinary!.cloudName,
					apiKey: this.config.cloudinary!.apiKey,
					apiSecret: this.config.cloudinary!.apiSecret
				});
				logger.info('Storage provider initialized', { provider: 'Cloudinary' });
			} else {
				// Fallback to local storage
				this.provider = new LocalStorageProvider({
					uploadDir: this.config.local!.uploadDir,
					publicPath: this.config.local!.publicPath
				});
				
				if (this.config.provider === 'cloudinary') {
					logger.warn('Cloudinary not configured, falling back to local storage');
				} else {
					logger.info('Storage provider initialized', { provider: 'Local Storage' });
				}
			}

			this.initialized = true;
		} catch (error) {
			logger.error('Failed to initialize storage provider', { error });
			
			// Final fallback to local storage
			this.provider = new LocalStorageProvider({
				uploadDir: this.config.local!.uploadDir,
				publicPath: this.config.local!.publicPath
			});
			this.initialized = true;
		}
	}

	/**
	 * Check if Cloudinary credentials are provided
	 */
	private isCloudinaryConfigured(): boolean {
		return !!(
			this.config.cloudinary?.cloudName &&
			this.config.cloudinary?.apiKey &&
			this.config.cloudinary?.apiSecret
		);
	}

	/**
	 * Upload file with validation
	 */
	async upload(file: File, options: UploadOptions = {}): Promise<UploadResult> {
		if (!this.initialized || !this.provider) {
			throw new Error('Storage service not initialized');
		}

		// Validate file
		this.validateFile(file);

		// Set folder path for Cloudinary
		if (this.provider.name === 'Cloudinary') {
			const baseFolder = this.config.cloudinary?.folder; // e.g., 'chtm_cooks'
			const subFolder = options.folder || 'inventory'; // e.g., 'inventory'
			
			// Combine base folder with subfolder: chtm_cooks/inventory
			if (baseFolder) {
				options.folder = `${baseFolder}/${subFolder}`;
			} else {
				options.folder = subFolder;
			}
		} else {
			options.folder = options.folder || '';
		}

		try {
			// Upload using configured provider
			const result = await this.provider.upload(file, options);
			return result;
		} catch (error) {
			logger.error('Storage upload error', { 
				error, 
				provider: this.provider.name,
				filename: file.name 
			});

			// If Cloudinary fails, try local storage as fallback
			if (this.provider.name === 'Cloudinary') {
				logger.warn('Attempting fallback to local storage');
				const localProvider = new LocalStorageProvider({
					uploadDir: this.config.local!.uploadDir,
					publicPath: this.config.local!.publicPath
				});
				return await localProvider.upload(file, options);
			}

			throw error;
		}
	}

	/**
	 * Delete file
	 */
	async delete(options: DeleteOptions): Promise<boolean> {
		if (!this.initialized || !this.provider) {
			throw new Error('Storage service not initialized');
		}

		try {
			return await this.provider.delete(options);
		} catch (error) {
			logger.error('Storage delete error', { error, provider: this.provider.name });
			return false;
		}
	}

	/**
	 * Validate uploaded file
	 */
	private validateFile(file: File): void {
		// Max file size: 10MB
		const MAX_SIZE = 10 * 1024 * 1024;
		if (file.size > MAX_SIZE) {
			throw new Error(`File size exceeds maximum limit of ${MAX_SIZE / 1024 / 1024}MB`);
		}

		// Allowed file types
		const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
		if (!ALLOWED_TYPES.includes(file.type)) {
			throw new Error('Invalid file type. Only JPEG, PNG, and WebP images are allowed.');
		}
	}

	/**
	 * Get current provider name
	 */
	getProviderName(): string {
		return this.provider?.name || 'Unknown';
	}

	/**
	 * Check provider health
	 */
	async healthCheck(): Promise<boolean> {
		if (!this.initialized || !this.provider) {
			return false;
		}

		return await this.provider.healthCheck();
	}
}

// Export singleton instance
export const storageService = new StorageService();
