import { env } from '@/config/env';
import { withRetry } from '@/lib/retry';
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

type Method = 'GET' | 'POST';

async function request<T>(path: string, method: Method = 'GET', body?: unknown): Promise<T> {
	return withRetry(async () => {
		const res = await fetch(`${env.MONOLITH_URL}${path}`, {
			method,
			headers: {
				'Content-Type': 'application/json',
				// INFO: temp svc to svc auth
				'x-internal-api-key': env.INTERNAL_API_KEY,
				'x-correlation-id': requestContext.getStore()?.correlationId ?? '',
			},
			body: body ? JSON.stringify(body) : undefined,
		});
		if (!res.ok) throw new Error(`monolith ${method} ${path} -> ${res.status}`);
		return (await res.json()) as T;
	});
}

export const monolithClient = {
	getFollowing: (userId: string) => request<string[]>(`/internal/follows/${userId}/following`),
	getFollowers: (userId: string) => request<string[]>(`/internal/follows/${userId}/followers`),
	getPostsByAuthors: (ids: string[]) =>
		request<MonolithPost[]>('/internal/posts/by-authors', 'POST', { ids: ids }),
	getUsers: (ids: string[]) => request<MonolithUser[]>('/internal/users', 'POST', { ids }),
};
