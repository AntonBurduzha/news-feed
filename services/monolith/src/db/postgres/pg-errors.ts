const UNIQUE_VIOLATION = '23505';

type PgError = { code?: unknown; constraint?: unknown };

export function isUniqueViolation(error: unknown, constraint?: string): boolean {
	if (typeof error !== 'object' || error === null) {
		return false;
	}
	const { code, constraint: violated } = error as PgError;
	if (code !== UNIQUE_VIOLATION) {
		return false;
	}
	return constraint === undefined || violated === constraint;
}
