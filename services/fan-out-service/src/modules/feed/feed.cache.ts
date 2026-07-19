import { getFeedResponse, type GetFeedResponse } from '@news-feed/contracts';
import { redisClient } from '@/db/redis';

const feedKey = (userId: string) => `feed:v2:${userId}`;

export const feedCache = {
	async getFeed(userId: string): Promise<GetFeedResponse | null> {
		const raw = await redisClient.get(feedKey(userId));
		if (!raw) {
			return null;
		}
		return getFeedResponse.parse(JSON.parse(raw));
	},

	async setFeed(userId: string, feed: GetFeedResponse, ttl: number): Promise<void> {
		await redisClient.set(feedKey(userId), JSON.stringify(feed), { EX: ttl });
	},

	invalidateFeeds(userIds: string[]): Promise<number> {
		if (userIds.length === 0) {
			return Promise.resolve(0);
		}
		return redisClient.del(userIds.map(feedKey));
	},
};
