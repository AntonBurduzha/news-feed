import httpStatus from 'http-status';

export class AppError extends Error {
	public readonly statusCode: number;
	public readonly details?: unknown;

	constructor(
		message: string,
		statusCode: number = httpStatus.INTERNAL_SERVER_ERROR,
		details?: unknown,
	) {
		super(message);
		this.name = this.constructor.name;
		this.statusCode = statusCode;
		this.details = details;
		Error.captureStackTrace(this, this.constructor);
	}
}

export class NotFoundError extends AppError {
	constructor(message = 'Resource not found') {
		super(message, httpStatus.NOT_FOUND);
	}
}

export class ValidationError extends AppError {
	constructor(message = 'Validation failed', details?: unknown) {
		super(message, httpStatus.BAD_REQUEST, details);
	}
}

export function normalizeError(error: unknown): Error {
	if (error instanceof Error) {
		return error;
	}

	return new Error(typeof error === 'string' ? error : 'Unknown error');
}
