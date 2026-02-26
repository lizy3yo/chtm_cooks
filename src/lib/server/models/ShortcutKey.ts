import type { ObjectId } from 'mongodb';

export interface ShortcutKey {
	_id?: ObjectId;
	userId: ObjectId;
	shortcutKeyHash: string; // Hashed combination of shortcut type and device fingerprint
	deviceFingerprint: string;
	shortcutType: 'STAFF' | 'SUPERADMIN';
	isActive: boolean;
	lastUsed?: Date;
	usageCount: number;
	createdAt: Date;
	expiresAt?: Date;
	createdBy: ObjectId;
	revokedAt?: Date;
	revokedBy?: ObjectId;
	revokeReason?: string;
}

export interface CreateShortcutKeyRequest {
	userId: string;
	shortcutType: 'STAFF' | 'SUPERADMIN';
	deviceFingerprint: string;
	expiresInDays?: number; // Optional expiration
}

export interface ShortcutKeyResponse {
	id: string;
	userId: string;
	shortcutType: 'STAFF' | 'SUPERADMIN';
	isActive: boolean;
	lastUsed?: Date;
	usageCount: number;
	createdAt: Date;
	expiresAt?: Date;
}