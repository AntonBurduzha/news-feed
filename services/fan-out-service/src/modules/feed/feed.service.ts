import { trace, context, SpanStatusCode } from '@opentelemetry/api';
import type { GetFeedResponse, FeedPost } from '@news-feed/contracts';
import { env } from '@/config/env';
import {
	feedRequestsTotal,
	feedCacheHitsTotal,
	feedCacheMissesTotal,
	feedBuildDurationSeconds,
} from '@/lib/metrics';
import { feedCache } from './feed.cache';
import {
	monolithClient,
	type MonolithUser,
	type MonolithPost,
} from '@/modules/monolith-client/monolith.client';

const tracer = trace.getTracer('feed-service');

const encodeCursor = (score: number) => Buffer.from(String(score)).toString('base64');
const decodeCursor = (c: string | null) => (c ? Number(Buffer.from(c, 'base64').toString()) : null);

class FeedService {
	private readonly userCache = new Map<string, MonolithUser>();
	async getFeed(userId: string, limit: number, cursor: string | null): Promise<GetFeedResponse> {
		const span = tracer.startSpan('feed.getFeed', { attributes: { 'user.id': userId, limit } });
		return context.with(trace.setSpan(context.active(), span), async () => {
			try {
				feedRequestsTotal.inc({ service: env.SERVICE_NAME });
				const cursorScore = decodeCursor(cursor);

				const hasFeed = await feedCache.hasFeed(userId);
				if (hasFeed) {
					feedCacheHitsTotal.inc({ service: env.SERVICE_NAME });
					return this.readPageFromCache(userId, limit, cursorScore);
				}

				feedCacheMissesTotal.inc({ service: env.SERVICE_NAME });
				await this.buildFeed(userId);
				return this.readPageFromCache(userId, limit, cursorScore);
			} catch (error) {
				span.recordException(error as Error);
				span.setStatus({ code: SpanStatusCode.ERROR, message: (error as Error).message });
				throw error;
			} finally {
				span.end();
			}
		});
	}

	private async buildFeed(userId: string): Promise<void> {
		const endTimer = feedBuildDurationSeconds.startTimer({ service: env.SERVICE_NAME });
		try {
			const followingIds = await monolithClient.getFollowing(userId);
			if (followingIds.length === 0) {
				await feedCache.buildFeed(userId, [], 300);
				return;
			}

			const posts = await monolithClient.getPostsByAuthors(followingIds);
			const users = await monolithClient.getUsers(followingIds);
			for (const user of users) {
				this.userCache.set(user.id, user);
			}
			const items = posts.map((p: MonolithPost) => {
				const user = this.userCache.get(p.userId);
				return {
					postId: p.id,
					createdAtMs: Date.parse(p.createdAt),
					payload: JSON.stringify({
						...p,
						author: user ? { name: user.name, avatarUrl: user.avatarUrl } : null,
					}),
				};
			});
			await feedCache.buildFeed(userId, items, 300);
		} finally {
			endTimer();
		}
	}

	private async readPageFromCache(
		userId: string,
		limit: number,
		cursorScore: number | null = null,
	): Promise<GetFeedResponse> {
		const { postIds, scores } = await feedCache.readPage(userId, limit, cursorScore);
		if (postIds.length === 0) return { posts: [], nextCursor: null };

		const rawPosts = await feedCache.getPosts(postIds);
		const posts: FeedPost[] = rawPosts
			.filter((v): v is string => v !== null)
			.map(v => JSON.parse(v) as FeedPost);

		const lastScore = scores[scores.length - 1];
		const nextCursor = posts.length === limit ? encodeCursor(lastScore) : null;
		return { posts, nextCursor };
	}
}

export const feedService = new FeedService();
