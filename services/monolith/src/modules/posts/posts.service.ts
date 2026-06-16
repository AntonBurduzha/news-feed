import { trace, context, SpanStatusCode } from '@opentelemetry/api';
import { env } from '@/config/env';
import { logger } from '@/lib/logger';
import { withTransaction } from '@/db/postgres';
import { AppError, NotFoundError } from '@/lib/errors';
import { postsCreatedTotal, postsDeletedTotal } from '@/lib/metrics';
import { KafkaTopics } from '@/kafka/topics';
import { requestContext } from '@/middleware/context';
import { followsRepository } from '@/modules/follow/follow.repository';
import { followerPartitionsService } from '@/modules/follower-partitions/follower-partitions.service';
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
	private readonly followsRepository;
	private readonly followerPartitionsService;
	private readonly postRepository;
	private readonly messagesOutboxRepository;
	private readonly usersPort: UsersPort;
	constructor(usersPort: UsersPort) {
		this.usersPort = usersPort;
		this.postRepository = postsRepository;
		this.followsRepository = followsRepository;
		this.followerPartitionsService = followerPartitionsService;
		this.messagesOutboxRepository = messagesOutboxRepository;
	}

	async createPost(input: CreatePostInput): Promise<Post> {
		const tracer = trace.getTracer('posts-service');
		const span = tracer.startSpan('posts.createPost', {
			attributes: { 'user.id': input.userId },
		});

		return context.with(trace.setSpan(context.active(), span), async () => {
			try {
				const user = await this.usersPort.getUser(input.userId);
				if (!user) {
					throw new NotFoundError(`User ${input.userId} was not found`);
				}
				const result: {
					mappedPost: Post;
					outboxMessageCount: number;
					followerCount: number;
					fanOutMessageCount: number;
				} = await withTransaction(async client => {
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
					let outboxMessageCount = 0;
					await this.messagesOutboxRepository.create(postCreatedMsg, client);
					outboxMessageCount += 1;
					const followerIds = await this.followsRepository.findFollowersByFollowingId(
						mappedPost.userId,
					);
					span.setAttribute('follower.count', followerIds.length);
					if (followerIds.length === 0) {
						return { mappedPost, outboxMessageCount, followerCount: 0, fanOutMessageCount: 0 };
					}
					const followersMessages = await this.buildFollowerMessages(
						mappedPost,
						followerIds,
						correlationId,
						traceId,
					);
					if (followersMessages.length === 0) {
						return { mappedPost, outboxMessageCount, followerCount: followerIds.length, fanOutMessageCount: 0 };
					}

					for (const msg of followersMessages) {
						await this.messagesOutboxRepository.create(msg, client);
						outboxMessageCount += 1;
					}
					span.setAttribute('outbox.message_count', outboxMessageCount);
					return {
						mappedPost,
						outboxMessageCount,
						followerCount: followerIds.length,
						fanOutMessageCount: followersMessages.length,
					};
				});
				if (!result) {
					throw new AppError('Database did not return the created post');
				}
				postsCreatedTotal.inc({ service: env.SERVICE_NAME });
				logger.info(
					{
						postId: result.mappedPost.id,
						userId: input.userId,
						followerCount: result.followerCount,
						outboxMessageCount: result.outboxMessageCount,
						fanOutMessageCount: result.fanOutMessageCount ?? 0,
					},
					'Post created',
				);
				return result.mappedPost;
			} catch (error) {
				span.recordException(error as Error);
				span.setStatus({ code: SpanStatusCode.ERROR, message: (error as Error).message });
				throw error;
			} finally {
				span.end();
			}
		});
	}

	private async buildFollowerMessages(
		post: Post,
		followerIds: string[],
		correlationId: string,
		traceId: string | undefined,
	): Promise<CreateMessageOutboxInput[]> {
		const messagesWithPartitions = await Promise.all(
			followerIds.map(async followerId => {
				const partition = await this.followerPartitionsService.getPartitionForFollower(followerId);
				return { followerId, partition };
			}),
		);

		return messagesWithPartitions
			.filter(({ followerId, partition }) => {
				if (partition === null) {
					logger.debug(
						{ followerId, postId: post.id },
						'Follower has no dedicated partition — skipping delivery for this follower',
					);
					return false;
				}
				return true;
			})
			.map(({ followerId, partition }) => ({
				topic: KafkaTopics.PostFanOutV1,
				payload: {
					key: followerId,
					value: JSON.stringify(post),
					partition: partition!,
				},
				correlationId,
				traceId,
			}));
	}

	async getPosts(query: GetPostsQueryParams): Promise<GetPostsResult> {
		const limit = query.limit ?? null;
		const cursor = query.cursor ?? null;
		const userId = query.userId;
		const result = await this.postRepository.findAll(userId, limit, cursor);
		let nextCursor = null;
		if (result.length > 0) {
			const lastRow = result[result.length - 1];
			const createdAtDate = new Date(lastRow.created_at);
			const cursorString = createdAtDate.toISOString();
			nextCursor = Buffer.from(cursorString).toString('base64');
		}
		return {
			posts: result.map(mapPost),
			nextCursor: cursor && limit && result.length < limit ? null : nextCursor,
		};
	}

	async getPost(id: string): Promise<Post> {
		const post = await this.postRepository.findById(id);
		if (!post) {
			throw new NotFoundError(`Post ${id} was not found`);
		}
		return mapPost(post);
	}

	async updatePost(id: string, input: UpdatePostInput): Promise<Post> {
		const updatedPost = await this.postRepository.update(id, input);
		if (!updatedPost) {
			throw new NotFoundError(`Post ${id} was not found`);
		}
		return mapPost(updatedPost);
	}

	async deletePost(id: string): Promise<void> {
		const tracer = trace.getTracer('posts-service');
		const span = tracer.startSpan('posts.deletePost', {
			attributes: { 'post.id': id },
		});
		return context.with(trace.setSpan(context.active(), span), async () => {
			try {
				await withTransaction(async client => {
					const postIsDeleted = await this.postRepository.delete(id, client);
					if (!postIsDeleted) {
						throw new NotFoundError(`Post ${id} was not found`);
					}
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
