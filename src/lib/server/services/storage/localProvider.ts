/**
 * Local Storage Provider
 * Fallback storage for development and when cloud storage is unavailable
 */

import type { StorageProvider, UploadResult, UploadOptions, DeleteOptions } from './types';
import { logger } from '$lib/server/utils/logger';
import { writeFile, mkdir, unlink, access } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import crypto from 'crypto';

export class LocalStorageProvider implements StorageProvider {
	public readonly name = 'Local Storage';
	private uploadDir: string;
	private publicPath: string;

	constructor(config: { uploadDir: string; publicPath: string }) {
		this.uploadDir = config.uploadDir;
		this.publicPath = config.publicPath;
		logger.info('Local storage provider initialized', { uploadDir: this.uploadDir });
	}

	/**
	 * Upload file to local filesystem
	 */
	async upload(file: File, options: UploadOptions = {}): Promise<UploadResult> {
		try {
			// Ensure upload directory exists
			const fullUploadDir = path.join(this.uploadDir, options.folder || '');
			if (!existsSync(fullUploadDir)) {
				await mkdir(fullUploadDir, { recursive: true });
			}

			// Generate unique filename
			const ext = path.extname(file.name);
			const hash = crypto.randomBytes(16).toString('hex');
			const timestamp = Date.now();
			const filename = options.filename || `${timestamp}-${hash}${ext}`;
			const filepath = path.join(fullUploadDir, filename);

			// Convert file to buffer and save
			const arrayBuffer = await file.arrayBuffer();
			const buffer = Buffer.from(arrayBuffer);
			await writeFile(filepath, buffer);

			// Construct public URL
			const folderPath = options.folder ? `${options.folder}/` : '';
			const publicUrl = `${this.publicPath}/${folderPath}${filename}`;

			logger.info('Image uploaded to local storage', {
				filename,
				size: file.size,
				path: filepath
			});

			return {
				success: true,
				url: publicUrl,
				filename,
				size: file.size,
				format: ext.replace('.', ''),
				provider: this.name
			};
		} catch (error) {
			logger.error('Local storage upload failed', { error });
			throw new Error(`Failed to upload to local storage: ${error}`);
		}
	}

	/**
	 * Delete file from local filesystem
	 */
	async delete(options: DeleteOptions): Promise<boolean> {
		if (!options.filepath) {
			throw new Error('filepath is required for local storage delete');
		}

		try {
			// Check if file exists
			await access(options.filepath);
			
			// Delete file
			await unlink(options.filepath);
			
			logger.info('Image deleted from local storage', { filepath: options.filepath });
			return true;
		} catch (error) {
			logger.error('Local storage delete error', { error, filepath: options.filepath });
			return false;
		}
	}

	/**
	 * Check if local storage is accessible
	 */
	async healthCheck(): Promise<boolean> {
		try {
			// Ensure upload directory exists and is writable
			if (!existsSync(this.uploadDir)) {
				await mkdir(this.uploadDir, { recursive: true });
			}
			return true;
		} catch (error) {
			logger.error('Local storage health check failed', { error });
			return false;
		}
	}
}
