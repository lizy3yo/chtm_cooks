import type { ObjectId } from 'mongodb';

export enum UserRole {
	STUDENT = 'student',
	CUSTODIAN = 'custodian',
	INSTRUCTOR = 'instructor',
	SUPERADMIN = 'superadmin'
}

export interface User {
	_id?: ObjectId;
	email: string;
	password: string;
	role: UserRole;
	firstName: string;
	lastName: string;
	isActive: boolean;
	createdAt: Date;
	updatedAt: Date;
	lastLogin?: Date;
	// Student-specific fields
	yearLevel?: string;
	block?: string;
	agreedToTerms?: boolean;
}

export interface UserResponse {
	id: string;
	email: string;
	role: UserRole;
	firstName: string;
	lastName: string;
	isActive: boolean;
	createdAt: Date;
	// Student-specific fields
	yearLevel?: string;
	block?: string;
	agreedToTerms?: boolean;
}

export interface LoginRequest {
	email: string;
	password: string;
}

export interface RegisterRequest {
	email: string;
	password: string;
	role: UserRole;
	firstName: string;
	lastName: string;
	// Student-specific fields (required only when role is STUDENT)
	yearLevel?: string;
	block?: string;
	agreedToTerms?: boolean;
}

export interface AuthResponse {
	user: UserResponse;
	accessToken: string;
	refreshToken: string;
}
