import { KafkaTopics } from '@news-feed/contracts';
import type { Post, PostRow } from '@/modules/posts/posts.types';
import type { CreateMessageOutboxInput } from '@/modules/messages-outbox/messages-outbox.types';

export const postFixture: PostRow = {
	id: 'post-1',
	user_id: 'user-1',
	content: 'hello',
	created_at: '2026-01-01T00:00:00.000Z',
	updated_at: '2026-01-01T00:00:00.000Z',
};

export const mappedPost: Post = {
	id: 'post-1',
	userId: 'user-1',
	content: 'hello',
	createdAt: '2026-01-01T00:00:00.000Z',
	updatedAt: '2026-01-01T00:00:00.000Z',
};

export const deletePostOutboxMessage: CreateMessageOutboxInput = {
	topic: KafkaTopics.PostDeletedV1,
	payload: {
		key: 'post-1',
		value: JSON.stringify({
			v: 1,
			postId: 'post-1',
			userId: 'user-1',
			createdAt: '2026-01-01T00:00:00.000Z',
		}),
	},
	correlationId: '',
	traceId: 'test-trace',
};

export const postCreatedOutboxMessage: CreateMessageOutboxInput = {
	topic: KafkaTopics.PostCreatedV1,
	payload: {
		key: 'post-1',
		value: JSON.stringify({
			v: 1,
			postId: 'post-1',
			userId: 'user-1',
			createdAt: '2026-01-01T00:00:00.000Z',
		}),
	},
	correlationId: '',
	traceId: 'test-trace',
};
