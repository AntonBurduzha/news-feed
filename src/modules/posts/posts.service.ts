import { logger } from '@/lib/logger';
import { withTransaction } from '@/db/postgres';
import { AppError, NotFoundError } from '@/lib/errors';
import { KafkaTopics } from '@/kafka/topics';
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

function mapPost(row: PostRow): Post {
	return {
		id: row.id,
		userId: row.user_id,
		content: row.content,
		likesCount: row.likes_count,
		commentsCount: row.comments_count,
		createdAt: row.created_at.toISOString(),
	};
}

class PostService {
	private readonly followsRepository;
	private readonly followerPartitionsService;
	private readonly postRepository;
	private readonly messagesOutboxRepository;
	constructor() {
		this.postRepository = postsRepository;
		this.followsRepository = followsRepository;
		this.followerPartitionsService = followerPartitionsService;
		this.messagesOutboxRepository = messagesOutboxRepository;
	}

	async createPost(input: CreatePostInput): Promise<Post> {
		const post = await withTransaction(async client => {
			const user = await userService.getUser(input.userId);
			if (!user) {
				throw new NotFoundError(`User ${input.userId} was not found`);
			}
			const newPost = await this.postRepository.create(input, client);
			const mappedPost = mapPost(newPost);
			const followerIds = await this.followsRepository.findFollowersByFollowingId(
				mappedPost.userId,
			);
			if (followerIds.length === 0) {
				logger.info(
					{ postId: mappedPost.id, userId: mappedPost.userId },
					'Post author has no followers — skipping Kafka fan-out',
				);
				return mappedPost;
			}

			const followersMessages = await this.buildFollowerMessages(mappedPost, followerIds);
			if (followersMessages.length === 0) {
				logger.warn(
					{ postId: mappedPost.id, userId: mappedPost.userId },
					'No followers have valid partition assignments — skipping Kafka fan-out',
				);
				return mappedPost;
			}

			for (const msg of followersMessages) {
				await this.messagesOutboxRepository.create(msg, client);
			}
			logger.info(
				{
					postId: mappedPost.id,
					userId: mappedPost.userId,
					followerCount: followerIds.length,
					messagesSent: followersMessages.length,
				},
				'Post fanned out to follower partitions via Kafka',
			);
			return mappedPost;
		});
		if (!post) {
			throw new AppError('Database did not return the created post');
		}
		return post;
	}

	private async buildFollowerMessages(
		post: Post,
		followerIds: number[],
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
					logger.warn(
						{ followerId, postId: post.id },
						'Follower has no dedicated partition — skipping delivery for this follower',
					);
					return false;
				}
				return true;
			})
			.map(({ followerId, partition }) => ({
				topic: KafkaTopics.PostsCreate,
				payload: {
					key: String(followerId),
					value: JSON.stringify(post),
					partition: partition!,
				},
			}));
	}

	async getPosts(query: GetPostsQueryParams): Promise<GetPostsResult> {
		const limit = query.limit ?? 10;
		const cursor = query.cursor ?? null;
		const result = await this.postRepository.findAll(limit, cursor);
		let nextCursor = null;
		if (result.length > 0) {
			const lastRow = result[result.length - 1];
			const cursorData = JSON.stringify({
				createdAt: lastRow.created_at,
				id: lastRow.id,
			});
			nextCursor = Buffer.from(cursorData).toString('base64');
		}
		return {
			posts: result.map(mapPost),
			nextCursor: cursor && result.length < limit ? null : nextCursor,
		};
	}

	async getPost(id: number): Promise<Post> {
		const post = await this.postRepository.findById(id);
		if (!post) {
			throw new NotFoundError(`Post ${id} was not found`);
		}
		return mapPost(post);
	}

	async updatePost(id: number, input: UpdatePostInput): Promise<Post> {
		const updatedPost = await this.postRepository.update(id, input);
		if (!updatedPost) {
			throw new NotFoundError(`Post ${id} was not found`);
		}
		return mapPost(updatedPost);
	}

	async deletePost(id: number): Promise<void> {
		const deleted = await this.postRepository.delete(id);
		if (!deleted) {
			throw new NotFoundError(`Post ${id} was not found`);
		}
	}
}

export const postService = new PostService();
