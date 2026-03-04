/**
 * Storage Service Types
 * Defines interfaces for storage provider abstraction
 */

export interface UploadResult {
	success: boolean;
	url: string;
	publicId?: string;
	filename?: string;
	size: number;
	format: string;
	provider: string;
}

export interface UploadOptions {
	folder?: string;
	filename?: string;
	transformation?: unknown;
	tags?: string[];
}

export interface DeleteOptions {
	publicId?: string;
	filepath?: string;
}

export interface StorageProvider {
	name: string;
	upload(file: File, options?: UploadOptions): Promise<UploadResult>;
	delete(options: DeleteOptions): Promise<boolean>;
	healthCheck(): Promise<boolean>;
}

export interface StorageConfig {
	provider: 'cloudinary' | 'local';
	cloudinary?: {
		cloudName: string;
		apiKey: string;
		apiSecret: string;
		folder?: string;
	};
	local?: {
		uploadDir: string;
		publicPath: string;
	};
}
