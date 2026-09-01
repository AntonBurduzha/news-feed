import { trace, context, SpanStatusCode } from '@opentelemetry/api';
import { KafkaTopics, encodePaginationCursor, decodePaginationCursor } from '@news-feed/contracts';
import { env } from '@/config/env';
import { logger } from '@/lib/logger';
import { withTransaction } from '@/db/postgres';
import { NotFoundError, ValidationError } from '@/lib/errors';
import { createOwnershipGuard, type OwnershipGuard } from '@/lib/ownership';
import { postsCreatedTotal, postsDeletedTotal } from '@/lib/metrics';
import { requestContext } from '@/middleware/context';
import { postsRepository } from '@/modules/posts/posts.repository';
import { messagesOutboxRepository } from '@/modules/messages-outbox/messages-outbox.repository';
import type { CreateMessageOutboxInput } from '@/modules/messages-outbox/messages-outbox.types';
import { userService } from '@/modules/users/users.service';
import type { UpdatePostInput, Post, PostRow, GetPostsResult } from './posts.types';
import type { UsersPort } from './posts.ports';

const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 10;

function parseCursor(cursor: string | null | undefined) {
	if (!cursor) return { createdAt: null, id: null };
	try {
		const decoded = decodePaginationCursor(cursor);
		return { createdAt: decoded.createdAt, id: decoded.id };
	} catch {
		throw new ValidationError('Invalid pagination cursor');
	}
}

function normalizeLimit(limit?: number): number {
	if (limit === undefined || !Number.isFinite(limit)) {
		return DEFAULT_PAGE_SIZE;
	}
	return Math.min(Math.max(Math.trunc(limit), 1), MAX_PAGE_SIZE);
}

function toPageResult(rows: PostRow[], limit: number): GetPostsResult {
	const hasMore = rows.length > limit;
	const page = hasMore ? rows.slice(0, limit) : rows;
	const last = page[page.length - 1];
	const nextCursor =
		hasMore && last
			? encodePaginationCursor({
					createdAt: new Date(last.created_at).toISOString(),
					id: last.id,
				})
			: null;
	return { posts: page.map(mapPost), nextCursor };
}

function mapPost(row: PostRow): Post {
	return {
		id: row.id,
		userId: row.user_id,
		content: row.content,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

class PostService {
	private readonly postRepository;
	private readonly messagesOutboxRepository;
	private readonly usersPort: UsersPort;
	private readonly assertOwnership: OwnershipGuard<PostRow>;
	constructor(usersPort: UsersPort) {
		this.usersPort = usersPort;
		this.postRepository = postsRepository;
		this.messagesOutboxRepository = messagesOutboxRepository;
		this.assertOwnership = createOwnershipGuard({
			resource: 'Post',
			findById: id => this.postRepository.findById(id),
			ownerOf: row => row.user_id,
		});
	}

	async createPost(input: { userId: string; content: string }): Promise<Post> {
		const tracer = trace.getTracer('posts-service');
		const span = tracer.startSpan('posts.createPost', {
			attributes: { 'user.id': input.userId },
		});

		return context.with(trace.setSpan(context.active(), span), async (): Promise<Post> => {
			try {
				const user = await this.usersPort.getUser(input.userId);
				if (!user) {
					throw new NotFoundError(`User ${input.userId} was not found`);
				}
				const result: Post = await withTransaction(async client => {
					const newPost = await this.postRepository.create(input, client);
					const mappedPost = mapPost(newPost);
					const correlationId = requestContext.getStore()?.correlationId ?? '';

					const spanContext = trace.getActiveSpan()?.spanContext();
					const traceId = spanContext?.traceId;

					const postCreatedMsg: CreateMessageOutboxInput = {
						topic: KafkaTopics.PostCreatedV1,
						payload: {
							key: mappedPost.id,
							value: JSON.stringify({
								v: 1,
								postId: mappedPost.id,
								userId: mappedPost.userId,
								createdAt: new Date().toISOString(),
							}),
						},
						correlationId,
						traceId,
					};
					await this.messagesOutboxRepository.create(postCreatedMsg, client);
					return mappedPost;
				});
				postsCreatedTotal.inc({ service: env.SERVICE_NAME });
				logger.info({ postId: result.id, userId: result.userId }, 'Post created');
				return result;
			} catch (error) {
				span.recordException(error as Error);
				span.setStatus({ code: SpanStatusCode.ERROR, message: (error as Error).message });
				throw error;
			} finally {
				span.end();
			}
		});
	}

	async getPost(id: string): Promise<Post> {
		const post = await this.postRepository.findById(id);
		if (!post) {
			throw new NotFoundError(`Post ${id} was not found`);
		}
		return mapPost(post);
	}

	async getPostsByAuthors(
		ids: string[],
		limit: number,
		cursor: string | null,
	): Promise<GetPostsResult> {
		const tracer = trace.getTracer('posts-service');
		const span = tracer.startSpan('posts.getPostsByAuthors', {
			attributes: { 'author.ids': ids.join(',') },
		});
		if (ids.length === 0) {
			span.end();
			return { posts: [], nextCursor: null };
		}
		return context.with(trace.setSpan(context.active(), span), async () => {
			try {
				const safeLimit = normalizeLimit(limit);
				const cursorParams = parseCursor(cursor);
				const rows = await this.postRepository.findByAuthors(ids, safeLimit + 1, cursorParams);
				return toPageResult(rows, safeLimit);
			} catch (error) {
				span.recordException(error as Error);
				span.setStatus({ code: SpanStatusCode.ERROR, message: (error as Error).message });
				throw error;
			} finally {
				span.end();
			}
		});
	}

	async updatePost(id: string, input: UpdatePostInput, actorId: string): Promise<Post> {
		const tracer = trace.getTracer('posts-service');
		const span = tracer.startSpan('posts.updatePost', {
			attributes: { 'post.id': id, 'user.id': actorId },
		});
		return context.with(trace.setSpan(context.active(), span), async () => {
			try {
				await this.assertOwnership(id, actorId);
				const updatedPost = await this.postRepository.update(id, input);
				if (!updatedPost) {
					throw new NotFoundError(`Post ${id} was not found`);
				}
				return mapPost(updatedPost);
			} catch (error) {
				span.recordException(error as Error);
				span.setStatus({ code: SpanStatusCode.ERROR, message: (error as Error).message });
				throw error;
			} finally {
				span.end();
			}
		});
	}

	async deletePost(id: string, actorId: string): Promise<void> {
		const tracer = trace.getTracer('posts-service');
		const span = tracer.startSpan('posts.deletePost', {
			attributes: { 'post.id': id, 'user.id': actorId },
		});
		return context.with(trace.setSpan(context.active(), span), async () => {
			try {
				const existing = await this.assertOwnership(id, actorId);
				await withTransaction(async client => {
					await this.postRepository.delete(id, client);
					const correlationId = requestContext.getStore()?.correlationId ?? '';
					const spanContext = trace.getActiveSpan()?.spanContext();
					const traceId = spanContext?.traceId;
					const message: CreateMessageOutboxInput = {
						topic: KafkaTopics.PostDeletedV1,
						payload: {
							key: id,
							value: JSON.stringify({
								v: 1,
								postId: id,
								userId: existing.user_id,
								createdAt: new Date().toISOString(),
							}),
						},
						correlationId,
						traceId,
					};
					await this.messagesOutboxRepository.create(message, client);
					span.setAttribute('outbox.message_count', 1);
					logger.info({ postId: id }, 'Post deleted');
				});
				postsDeletedTotal.inc({ service: env.SERVICE_NAME });
			} catch (error) {
				span.recordException(error as Error);
				span.setStatus({ code: SpanStatusCode.ERROR, message: (error as Error).message });
				throw error;
			} finally {
				span.end();
			}
		});
	}
}

const usersPort: UsersPort = {
	getUser: id => userService.getUser(id),
};
export const postService = new PostService(usersPort);
