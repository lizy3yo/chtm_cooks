import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import { dev } from '$app/environment';
import path from 'path';

/**
 * Custom log levels with priority
 */
const logLevels = {
	error: 0,
	warn: 1,
	info: 2,
	http: 3,
	debug: 4
};

/**
 * Custom colors for log levels
 */
const logColors = {
	error: 'red',
	warn: 'yellow',
	info: 'green',
	http: 'magenta',
	debug: 'blue'
};

// Add colors to winston
winston.addColors(logColors);

/**
 * Custom format for console output
 */
const consoleFormat = winston.format.combine(
	winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
	winston.format.colorize({ all: true }),
	winston.format.printf((info) => {
		const { timestamp, level, message, requestId, userId, ...meta } = info;

		let logMessage = `[${timestamp}] ${level}: ${message}`;

		// Add request ID if present
		if (requestId) {
			logMessage += ` | RequestID: ${requestId}`;
		}

		// Add user ID if present
		if (userId) {
			logMessage += ` | UserID: ${userId}`;
		}

		// Add metadata if present
		if (Object.keys(meta).length > 0) {
			logMessage += `\n${JSON.stringify(meta, null, 2)}`;
		}

		return logMessage;
	})
);

/**
 * JSON format for file output
 */
const fileFormat = winston.format.combine(
	winston.format.timestamp(),
	winston.format.errors({ stack: true }),
	winston.format.json()
);

/**
 * Create daily rotate file transport
 */
function createRotateTransport(level: string, filename: string) {
	return new DailyRotateFile({
		level,
		filename: path.join('logs', `${filename}-%DATE%.log`),
		datePattern: 'YYYY-MM-DD',
		maxSize: '20m', // Max file size before rotation
		maxFiles: '14d', // Keep logs for 14 days
		format: fileFormat,
		zippedArchive: true // Compress old logs
	});
}

/**
 * Create Winston logger instance
 */
function createLogger() {
	const transports: winston.transport[] = [];

	// Console transport (always enabled in development)
	if (dev) {
		transports.push(
			new winston.transports.Console({
				format: consoleFormat,
				level: 'debug'
			})
		);
	} else {
		// In production, console with less verbosity
		transports.push(
			new winston.transports.Console({
				format: fileFormat,
				level: 'info'
			})
		);
	}

	// File transports (production)
	if (!dev) {
		// Error logs
		transports.push(
			createRotateTransport('error', 'error')
		);

		// Warning logs
		transports.push(
			createRotateTransport('warn', 'warn')
		);

		// Combined logs (info and above)
		transports.push(
			createRotateTransport('info', 'combined')
		);

		// HTTP logs (all requests)
		transports.push(
			createRotateTransport('http', 'http')
		);
	}

	return winston.createLogger({
		levels: logLevels,
		level: dev ? 'debug' : 'info',
		transports,
		// Don't exit on handled exceptions
		exitOnError: false,
		// Handle uncaught exceptions
		exceptionHandlers: dev
			? []
			: [createRotateTransport('error', 'exceptions')],
		// Handle unhandled promise rejections
		rejectionHandlers: dev
			? []
			: [createRotateTransport('error', 'rejections')]
	});
}

// Create and export logger instance
export const logger = createLogger();

/**
 * Log request information
 */
export function logRequest(
	method: string,
	url: string,
	statusCode: number,
	responseTime: number,
	requestId?: string,
	userId?: string
) {
	const level = statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'http';

	logger.log(level, `${method} ${url} ${statusCode}`, {
		requestId,
		userId,
		method,
		url,
		statusCode,
		responseTime: `${responseTime}ms`
	});
}

/**
 * Log error with context
 */
export function logError(
	error: Error,
	context?: {
		requestId?: string;
		userId?: string;
		method?: string;
		url?: string;
		[key: string]: unknown;
	}
) {
	logger.error(error.message, {
		error: {
			name: error.name,
			message: error.message,
			stack: error.stack
		},
		...context
	});
}

/**
 * Log info message
 */
export function logInfo(message: string, meta?: Record<string, unknown>) {
	logger.info(message, meta);
}

/**
 * Log warning message
 */
export function logWarn(message: string, meta?: Record<string, unknown>) {
	logger.warn(message, meta);
}

/**
 * Log debug message (only in development)
 */
export function logDebug(message: string, meta?: Record<string, unknown>) {
	if (dev) {
		logger.debug(message, meta);
	}
}

/**
 * Create child logger with default metadata
 */
export function createChildLogger(defaultMeta: Record<string, unknown>) {
	return logger.child(defaultMeta);
}
