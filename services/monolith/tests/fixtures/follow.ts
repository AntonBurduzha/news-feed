import { KafkaTopics } from '@news-feed/contracts';
import type { Follow, FollowRow } from '@/modules/follow/follow.types';
import type { CreateMessageOutboxInput } from '@/modules/messages-outbox/messages-outbox.types';

export const followFixture: FollowRow = {
	id: 'follow-1',
	follower_id: 'user-1',
	following_id: 'user-2',
	created_at: '2026-01-01T00:00:00.000Z',
};

export const mappedFollow: Follow = {
	id: 'follow-1',
	followerId: 'user-1',
	followingId: 'user-2',
	createdAt: '2026-01-01T00:00:00.000Z',
};

export const followCreatedOutboxMessage: CreateMessageOutboxInput = {
	topic: KafkaTopics.FollowChangedV1,
	payload: {
		key: 'follow-1',
		value: JSON.stringify({
			v: 1,
			followerId: 'user-1',
			followingId: 'user-2',
			action: 'created',
			createdAt: '2026-01-01T00:00:00.000Z',
		}),
	},
	correlationId: '',
	traceId: 'test-trace',
};

export const followDeletedOutboxMessage: CreateMessageOutboxInput = {
	topic: KafkaTopics.FollowChangedV1,
	payload: {
		key: 'follow-1',
		value: JSON.stringify({
			v: 1,
			followerId: 'user-1',
			followingId: 'user-2',
			action: 'deleted',
			createdAt: '2026-01-01T00:00:00.000Z',
		}),
	},
	correlationId: '',
	traceId: 'test-trace',
};
