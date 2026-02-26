// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
import type { JWTPayload } from '$lib/server/utils/jwt';

declare global {
	namespace App {
		interface Error {
			message: string;
			code?: string;
			requestId?: string;
		}
		interface Locals {
			requestId: string;
			startTime: number;
			userId?: string;
			userRole?: string;
			user?: JWTPayload; // Cookie-based authenticated user
		}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
