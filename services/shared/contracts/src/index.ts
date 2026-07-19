import { z } from 'zod';

export const KafkaTopics = {
	AppDLQ: 'app-dlq',
	PostCreatedV1: 'post.created.v1',
	PostDeletedV1: 'post.deleted.v1',
	UserDeletedV1: 'user.deleted.v1',
	FollowChangedV1: 'follow.changed.v1',
} as const;

export const postCreatedEvent = z.object({
	v: z.literal(1),
	postId: z.uuid(),
	userId: z.uuid(),
	createdAt: z.string(),
});

export const postDeletedEvent = z.object({
	v: z.literal(1),
	postId: z.uuid(),
	userId: z.uuid(),
	createdAt: z.string(),
});

export const userDeletedEvent = z.object({
	v: z.literal(1),
	userId: z.uuid(),
	postIds: z.array(z.uuid()).default([]),
	followerIds: z.array(z.uuid()).default([]),
	createdAt: z.string(),
});

export const feedPost = z.object({
	id: z.string(),
	userId: z.string(),
	content: z.string(),
	createdAt: z.string(),
	author: z
		.object({
			name: z.string().nullable(),
			avatarUrl: z.string().nullable(),
			createdAt: z.string(),
		})
		.optional(),
});

export const getFeedResponse = z.object({
	posts: z.array(feedPost),
	nextCursor: z.string().nullable(),
});

export type PostCreatedEvent = z.infer<typeof postCreatedEvent>;
export type PostDeletedEvent = z.infer<typeof postDeletedEvent>;
export type UserDeletedEvent = z.infer<typeof userDeletedEvent>;
export type FeedPost = z.infer<typeof feedPost>;
export type GetFeedResponse = z.infer<typeof getFeedResponse>;

export const followChangedEvent = z.object({
	v: z.literal(1),
	followerId: z.uuid(),
	followingId: z.uuid(),
	action: z.enum(['created', 'deleted']),
	createdAt: z.string(),
});

export const paginationCursor = z.object({
	createdAt: z.string(),
	id: z.uuid(),
});

export type PaginationCursor = z.infer<typeof paginationCursor>;

export function encodePaginationCursor(cursor: PaginationCursor): string {
	return Buffer.from(JSON.stringify(cursor)).toString('base64');
}

export function decodePaginationCursor(raw: string): PaginationCursor {
	const decoded = Buffer.from(raw, 'base64').toString('utf-8');
	return paginationCursor.parse(JSON.parse(decoded));
}
