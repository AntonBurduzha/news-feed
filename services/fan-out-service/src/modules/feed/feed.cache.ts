import { redisClient } from '@/db/redis';

const feedKey = (userId: string) => `feed:v1:${userId}`;
const postKey = (postId: string) => `post:v1:${postId}`;
const tombstoneKey = (userId: string) => `feed:deleted-user:${userId}`;

export type CacheItem = { postId: string; createdAtMs: number; payload: string };

export const feedCache = {
	async hasFeed(userId: string): Promise<boolean> {
		return (await redisClient.exists(feedKey(userId))) === 1;
	},

	async readPage(userId: string, limit: number, cursorScore: number | null) {
		const max = cursorScore === null ? '+inf' : `(${cursorScore}`;
		const postIds = await redisClient.zRange(feedKey(userId), max, '-inf', {
			BY: 'SCORE',
			REV: true,
			LIMIT: { offset: 0, count: limit },
		});
		if (postIds.length === 0) return { postIds: [] as string[], scores: [] as number[] };
		const scores = (await redisClient.zmScore(feedKey(userId), postIds)).map(Number);
		return { postIds, scores };
	},

	async getPosts(postIds: string[]): Promise<(string | null)[]> {
		if (postIds.length === 0) return [];
		return redisClient.mGet(postIds.map(postKey));
	},

	async buildFeed(userId: string, items: CacheItem[], ttl: number): Promise<void> {
		const multi = redisClient.multi();
		multi.del(feedKey(userId));
		for (const it of items) {
			multi.zAdd(feedKey(userId), { score: it.createdAtMs, value: it.postId });
			multi.set(postKey(it.postId), it.payload, { EX: ttl });
		}
		multi.expire(feedKey(userId), ttl);
		await multi.exec();
	},

	invalidateFeeds(userIds: string[]): Promise<number> {
		if (userIds.length === 0) return Promise.resolve(0);
		return redisClient.del(userIds.map(feedKey));
	},

	async removePostFromAll(userIds: string[], postId: string): Promise<void> {
		if (userIds.length === 0) return;
		const multi = redisClient.multi();
		for (const u of userIds) {
			multi.zRem(feedKey(u), postId);
		}
		multi.del(postKey(postId));
		await multi.exec();
	},

	markUserDeleted(userId: string): Promise<string | null> {
		return redisClient.set(tombstoneKey(userId), '1', { EX: 600 });
	},

	async isUserDeleted(userId: string): Promise<boolean> {
		return (await redisClient.exists(tombstoneKey(userId))) === 1;
	},
};
