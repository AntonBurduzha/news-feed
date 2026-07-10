import { trace, context, SpanStatusCode } from '@opentelemetry/api';
import { KafkaTopics } from '@news-feed/contracts';
import { env } from '@/config/env';
import { logger } from '@/lib/logger';
import { withTransaction } from '@/db/postgres';
import { NotFoundError } from '@/lib/errors';
import { postsCreatedTotal, postsDeletedTotal } from '@/lib/metrics';
import { requestContext } from '@/middleware/context';
import { postsRepository } from '@/modules/posts/posts.repository';
import { messagesOutboxRepository } from '@/modules/messages-outbox/messages-outbox.repository';
import type { CreateMessageOutboxInput } from '@/modules/messages-outbox/messages-outbox.types';
import { userService } from '@/modules/users/users.service';
import type {
	CreatePostInput,
	UpdatePostInput,
	Post,
	PostRow,
	GetPostsQueryParams,
	GetPostsResult,
} from './posts.types';
import type { UsersPort } from './posts.ports';

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
	constructor(usersPort: UsersPort) {
		this.usersPort = usersPort;
		this.postRepository = postsRepository;
		this.messagesOutboxRepository = messagesOutboxRepository;
	}

	async createPost(input: CreatePostInput): Promise<Post> {
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

	async getPosts(query: GetPostsQueryParams): Promise<GetPostsResult> {
		const limit = query.limit ?? null;
		const cursor = query.cursor ?? null;
		const userId = query.userId;
		const { posts, totalCount } = await this.postRepository.findAll(userId, limit, cursor);
		let nextCursor = null;
		if (posts.length > 0 && limit && posts.length < totalCount) {
			const lastRow = posts[posts.length - 1];
			const createdAtDate = new Date(lastRow.created_at);
			const cursorString = createdAtDate.toISOString();
			nextCursor = Buffer.from(cursorString).toString('base64');
		}
		return {
			posts: posts.map(mapPost),
			nextCursor,
		};
	}

	async getPost(id: string): Promise<Post> {
		const post = await this.postRepository.findById(id);
		if (!post) {
			throw new NotFoundError(`Post ${id} was not found`);
		}
		return mapPost(post);
	}

	async getLatestPostsByAuthors(ids: string[]): Promise<Post[]> {
		if (ids.length === 0) {
			return [];
		}
		const posts = await this.postRepository.findLatestByAuthors(ids);
		return posts.map(mapPost);
	}

	async updatePost(id: string, input: UpdatePostInput): Promise<Post> {
		const tracer = trace.getTracer('posts-service');
		const span = tracer.startSpan('posts.updatePost', {
			attributes: { 'post.id': id },
		});
		return context.with(trace.setSpan(context.active(), span), async () => {
			try {
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

	async deletePost(id: string): Promise<void> {
		const tracer = trace.getTracer('posts-service');
		const span = tracer.startSpan('posts.deletePost', {
			attributes: { 'post.id': id },
		});
		return context.with(trace.setSpan(context.active(), span), async () => {
			try {
				const existing = await this.postRepository.findById(id);
				if (!existing) {
					throw new NotFoundError(`Post ${id} was not found`);
				}
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
