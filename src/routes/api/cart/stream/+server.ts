import type { RequestHandler } from './$types';
import { getDatabase } from '$lib/server/db/mongodb';
import { ObjectId } from 'mongodb';
import { logger } from '$lib/server/utils/logger';

/**
 * SSE endpoint for real-time cart updates
 * Streams cart changes to connected clients
 */

const HEARTBEAT_INTERVAL_MS = 30000; // 30 seconds
const CART_COLLECTION = 'student_carts';

/**
 * Get authenticated user from session
 */
function getAuthenticatedUser(event: any): { userId: string; role: string } | null {
	const user = event.locals.user;
	if (!user || !user.userId) {
		return null;
	}
	return { userId: user.userId, role: user.role };
}

/**
 * GET /api/cart/stream
 * Server-Sent Events endpoint for real-time cart updates
 */
export const GET: RequestHandler = async (event) => {
	const user = getAuthenticatedUser(event);
	
	if (!user) {
		return new Response('Unauthorized', { status: 401 });
	}

	if (user.role !== 'student') {
		return new Response('Forbidden: Only students can access cart stream', { status: 403 });
	}

	const studentId = new ObjectId(user.userId);

	logger.info('[CART-SSE] Client connected', {
		userId: user.userId,
		userAgent: event.request.headers.get('user-agent')
	});

	// Create SSE stream
	const stream = new ReadableStream({
		async start(controller) {
			const encoder = new TextEncoder();

			// Send initial connection message
			const sendEvent = (eventType: string, data: any) => {
				const message = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
				controller.enqueue(encoder.encode(message));
			};

			sendEvent('connected', {
				message: 'Cart stream connected',
				timestamp: new Date().toISOString()
			});

			// Heartbeat to keep connection alive
			const heartbeat = setInterval(() => {
				try {
					sendEvent('heartbeat', { timestamp: new Date().toISOString() });
				} catch (error) {
					logger.error('[CART-SSE] Heartbeat error', { error, userId: user.userId });
					clearInterval(heartbeat);
				}
			}, HEARTBEAT_INTERVAL_MS);

			// Watch for cart changes using MongoDB Change Streams
			let changeStream: any = null;

			try {
				const db = await getDatabase();
				const cartCollection = db.collection(CART_COLLECTION);

				// Create change stream for this specific student's cart
				changeStream = cartCollection.watch(
					[
						{
							$match: {
								'fullDocument.studentId': studentId,
								operationType: { $in: ['update', 'replace', 'insert'] }
							}
						}
					],
					{
						fullDocument: 'updateLookup'
					}
				);

				logger.info('[CART-SSE] Change stream started', { userId: user.userId });

				// Listen for changes
				changeStream.on('change', (change: any) => {
					try {
						logger.info('[CART-SSE] Cart change detected', {
							userId: user.userId,
							operationType: change.operationType
						});

						const cart = change.fullDocument;

						if (cart) {
							// Convert cart items to response format
							const items = cart.items.map((item: any) => ({
								itemId: item.itemId.toString(),
								name: item.name,
								quantity: item.quantity,
								maxQuantity: item.maxQuantity,
								categoryId: item.categoryId?.toString(),
								picture: item.picture,
								addedAt: item.addedAt?.toISOString(),
								updatedAt: item.updatedAt?.toISOString()
							}));

							sendEvent('cart-updated', {
								items,
								updatedAt: cart.updatedAt?.toISOString() || new Date().toISOString(),
								timestamp: new Date().toISOString()
							});
						}
					} catch (error) {
						logger.error('[CART-SSE] Error processing change', {
							error,
							userId: user.userId
						});
					}
				});

				changeStream.on('error', (error: any) => {
					logger.error('[CART-SSE] Change stream error', {
						error,
						userId: user.userId
					});
				});

			} catch (error) {
				logger.error('[CART-SSE] Failed to setup change stream', {
					error,
					userId: user.userId
				});
			}

			// Cleanup on client disconnect
			const cleanup = () => {
				logger.info('[CART-SSE] Client disconnected', { userId: user.userId });
				clearInterval(heartbeat);
				if (changeStream) {
					changeStream.close().catch((err: any) => {
						logger.error('[CART-SSE] Error closing change stream', { error: err });
					});
				}
				try {
					controller.close();
				} catch (error) {
					// Controller might already be closed
				}
			};

			// Handle client disconnect
			event.request.signal.addEventListener('abort', cleanup, { once: true });
		},

		cancel() {
			logger.info('[CART-SSE] Stream cancelled', { userId: user.userId });
		}
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache, no-transform',
			'Connection': 'keep-alive',
			'X-Accel-Buffering': 'no' // Disable nginx buffering
		}
	});
};
