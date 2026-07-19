import { trace } from '@opentelemetry/api';
import { env } from '@/config/env';
import { withRetry } from '@/lib/retry';
import { ValidationError } from '@/lib/errors';
import { requestContext } from '@/middleware/context';

export type MonolithPost = {
	id: string;
	userId: string;
	content: string;
	createdAt: string;
	updatedAt: string;
};
export type MonolithUser = {
	id: string;
	name: string;
	email: string;
	avatarUrl: string;
	createdAt: string;
};

export type PostsByAuthorsResult = {
	posts: MonolithPost[];
	nextCursor: string | null;
};

type Method = 'GET' | 'POST';

const REQUEST_TIMEOUT_MS = 3_000;

async function request<T>(path: string, method: Method = 'GET', body?: unknown): Promise<T> {
	const upstream = `${env.MONOLITH_URL}${path}`;
	trace.getActiveSpan()?.setAttribute('monolith.upstream', upstream);
	return withRetry(async () => {
		const res = await fetch(upstream, {
			method,
			headers: {
				'Content-Type': 'application/json',
				// INFO: temp svc to svc auth
				'x-internal-api-key': env.INTERNAL_API_KEY,
				'x-correlation-id': requestContext.getStore()?.correlationId ?? '',
			},
			body: body ? JSON.stringify(body) : undefined,
			signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
		});
		if (!res.ok) {
			if (res.status >= 400 && res.status < 500) {
				throw new ValidationError(`monolith ${method} ${path} -> ${res.status}`);
			}
			throw new Error(`monolith ${method} ${path} -> ${res.status}`);
		}

		return (await res.json()) as T;
	});
}

export const monolithClient = {
	getFollowing: (userId: string) => request<string[]>(`/internal/follows/${userId}/following`),
	getFollowers: (userId: string) => request<string[]>(`/internal/follows/${userId}/followers`),
	getPostsByAuthors: (ids: string[], limit: number, cursor: string | null) =>
		request<PostsByAuthorsResult>('/internal/posts/by-authors', 'POST', { ids, limit, cursor }),
	getUsers: (ids: string[]) => request<MonolithUser[]>('/internal/users', 'POST', { ids }),
};
