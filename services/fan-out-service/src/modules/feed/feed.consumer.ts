import { trace, context, SpanStatusCode } from '@opentelemetry/api';
import {
	postCreatedEvent,
	postDeletedEvent,
	userDeletedEvent,
	followChangedEvent,
} from '@news-feed/contracts';
import { isRedisDown } from '@/db/redis';
import { logger } from '@/lib/logger';
import { feedCache } from './feed.cache';
import { monolithClient } from '@/modules/monolith-client/monolith.client';

const tracer = trace.getTracer('feed-service');

async function invalidateSafely(
	userIds: string[],
	logContext: Record<string, unknown>,
): Promise<void> {
	try {
		await feedCache.invalidateFeeds(userIds);
		trace.getActiveSpan()?.setAttribute('feed.invalidated_count', userIds.length);
		logger.info(logContext, 'Invalidated cached feeds');
	} catch (error) {
		if (isRedisDown(error)) {
			logger.warn({ err: error, ...logContext }, 'redis unavailable skipping feed invalidation');
			return;
		}
		throw error;
	}
}

export async function onPostCreated(raw: string): Promise<void> {
	const span = tracer.startSpan('feed.onPostCreated');
	return context.with(trace.setSpan(context.active(), span), async () => {
		try {
			const message = postCreatedEvent.parse(JSON.parse(raw));
			span.setAttribute('post.id', message.postId);
			span.setAttribute('user.id', message.userId);
			const followers = await monolithClient.getFollowers(message.userId);
			span.setAttribute('followers.count', followers.length);
			await invalidateSafely(followers, { postId: message.postId, reason: 'post_created' });
		} catch (error) {
			span.recordException(error as Error);
			span.setStatus({ code: SpanStatusCode.ERROR, message: (error as Error).message });
			throw error;
		} finally {
			span.end();
		}
	});
}

export async function onPostDeleted(raw: string): Promise<void> {
	const span = tracer.startSpan('feed.onPostDeleted');
	return context.with(trace.setSpan(context.active(), span), async () => {
		try {
			const message = postDeletedEvent.parse(JSON.parse(raw));
			span.setAttribute('post.id', message.postId);
			span.setAttribute('user.id', message.userId);
			const followers = await monolithClient.getFollowers(message.userId);
			span.setAttribute('followers.count', followers.length);
			await invalidateSafely(followers, { postId: message.postId, reason: 'post_deleted' });
		} catch (error) {
			span.recordException(error as Error);
			span.setStatus({ code: SpanStatusCode.ERROR, message: (error as Error).message });
			throw error;
		} finally {
			span.end();
		}
	});
}

export async function onFollowChanged(raw: string): Promise<void> {
	const span = tracer.startSpan('feed.onFollowChanged');
	return context.with(trace.setSpan(context.active(), span), async () => {
		try {
			const message = followChangedEvent.parse(JSON.parse(raw));
			span.setAttribute('follower.id', message.followerId);
			span.setAttribute('follow.action', message.action);
			await invalidateSafely([message.followerId], {
				followerId: message.followerId,
				action: message.action,
				reason: 'follow_changed',
			});
		} catch (error) {
			span.recordException(error as Error);
			span.setStatus({ code: SpanStatusCode.ERROR, message: (error as Error).message });
			throw error;
		} finally {
			span.end();
		}
	});
}

export async function onUserDeleted(raw: string): Promise<void> {
	const span = tracer.startSpan('feed.onUserDeleted');
	return context.with(trace.setSpan(context.active(), span), async () => {
		try {
			const message = userDeletedEvent.parse(JSON.parse(raw));
			span.setAttribute('user.id', message.userId);
			span.setAttribute('followers.count', message.followerIds.length);
			await invalidateSafely([message.userId, ...message.followerIds], {
				userId: message.userId,
				reason: 'user_deleted',
			});
		} catch (error) {
			span.recordException(error as Error);
			span.setStatus({ code: SpanStatusCode.ERROR, message: (error as Error).message });
			throw error;
		} finally {
			span.end();
		}
	});
}
