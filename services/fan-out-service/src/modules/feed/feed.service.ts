import { trace, context, SpanStatusCode } from '@opentelemetry/api';
import { type GetFeedResponse, type FeedPost } from '@news-feed/contracts';
import { env } from '@/config/env';
import { logger } from '@/lib/logger';
import { isRedisDown } from '@/db/redis';
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

const PAGE_SIZE = 10;
const CACHE_TTL_SECONDS = 300;

class FeedService {
	async getFeed(userId: string, cursor: string | null): Promise<GetFeedResponse> {
		const span = tracer.startSpan('feed.getFeed', { attributes: { 'user.id': userId } });
		return context.with(trace.setSpan(context.active(), span), async () => {
			try {
				feedRequestsTotal.inc({ service: env.SERVICE_NAME });
				if (cursor) {
					return await this.readFromMonolith(userId, cursor);
				}
				return await this.readFirstPage(userId);
			} catch (error) {
				span.recordException(error as Error);
				span.setStatus({ code: SpanStatusCode.ERROR, message: (error as Error).message });
				throw error;
			} finally {
				span.end();
			}
		});
	}

	private async readFirstPage(userId: string): Promise<GetFeedResponse> {
		try {
			const cached = await feedCache.getFeed(userId);
			if (cached) {
				feedCacheHitsTotal.inc({ service: env.SERVICE_NAME });
				trace.getActiveSpan()?.setAttribute('feed.cache_hit', true);
				return cached;
			}
			feedCacheMissesTotal.inc({ service: env.SERVICE_NAME });
			trace.getActiveSpan()?.setAttribute('feed.cache_hit', false);
			const page = await this.buildFirstPage(userId);
			await feedCache.setFeed(userId, page, CACHE_TTL_SECONDS);
			return page;
		} catch (error) {
			const isRedisDownError = isRedisDown(error);
			logger.error(
				{ err: error, userId },
				isRedisDownError
					? 'redis unavailable while reading first page'
					: 'error reading first page',
			);
			if (isRedisDownError) {
				return this.readFromMonolith(userId, null);
			} else {
				throw error;
			}
		}
	}

	private async buildFirstPage(userId: string): Promise<GetFeedResponse> {
		const endTimer = feedBuildDurationSeconds.startTimer({ service: env.SERVICE_NAME });
		try {
			const followingIds = await monolithClient.getFollowing(userId);
			trace.getActiveSpan()?.setAttribute('following.count', followingIds.length);
			if (followingIds.length === 0) {
				return { posts: [], nextCursor: null };
			}
			const { posts, nextCursor } = await monolithClient.getPostsByAuthors(
				followingIds,
				PAGE_SIZE,
				null,
			);
			const enriched = await this.extendPostsWithAuthor(posts);
			trace.getActiveSpan()?.setAttribute('posts.count', enriched.length);
			return { posts: enriched, nextCursor };
		} catch (error) {
			logger.error({ err: error, userId }, 'error building first page');
			throw error;
		} finally {
			endTimer();
		}
	}

	private async readFromMonolith(userId: string, cursor: string | null): Promise<GetFeedResponse> {
		const followingIds = await monolithClient.getFollowing(userId);
		trace.getActiveSpan()?.setAttribute('following.count', followingIds.length);
		if (followingIds.length === 0) {
			return { posts: [], nextCursor: null };
		}
		const { posts, nextCursor } = await monolithClient.getPostsByAuthors(
			followingIds,
			PAGE_SIZE,
			cursor,
		);
		const extendedPosts = await this.extendPostsWithAuthor(posts);
		trace.getActiveSpan()?.setAttribute('posts.count', extendedPosts.length);
		return { posts: extendedPosts, nextCursor };
	}

	private async extendPostsWithAuthor(posts: MonolithPost[]): Promise<FeedPost[]> {
		if (posts.length === 0) {
			return [];
		}
		const authorIds = [...new Set(posts.map(p => p.userId))];
		const users = await monolithClient.getUsers(authorIds);
		const usersMap = new Map(users.map(user => [user.id, user]));
		return posts.map(post => this.toFeedPost(post, usersMap.get(post.userId)));
	}

	private toFeedPost(p: MonolithPost, author?: MonolithUser): FeedPost {
		return {
			id: p.id,
			userId: p.userId,
			content: p.content,
			createdAt: p.createdAt,
			author: author
				? { name: author.name, avatarUrl: author.avatarUrl, createdAt: author.createdAt }
				: undefined,
		};
	}
}

export const feedService = new FeedService();
