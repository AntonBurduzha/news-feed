import { postCreatedEvent, postDeletedEvent, userDeletedEvent } from '@news-feed/contracts';
import { logger } from '@/lib/logger';
import { monolithClient } from '@/modules/monolith-client/monolith.client';
import { feedCache } from './feed.cache';

export async function onPostCreated(raw: string): Promise<void> {
	const message = postCreatedEvent.parse(JSON.parse(raw));
	const isUserDeleted = await feedCache.isUserDeleted(message.userId);
	if (isUserDeleted) {
		return;
	}

	const followers = await monolithClient.getFollowers(message.userId);
	await feedCache.invalidateFeeds(followers);
	logger.info(
		{ postId: message.postId, followers: followers.length },
		'Invalidated feeds for new post',
	);
}

export async function onPostDeleted(raw: string): Promise<void> {
	const message = postDeletedEvent.parse(JSON.parse(raw));
	const followers = await monolithClient.getFollowers(message.userId);
	await feedCache.removePostFromAll(followers, message.postId);
	logger.info({ postId: message.postId, followers: followers.length }, 'Removed post from feeds');
}

export async function onUserDeleted(raw: string): Promise<void> {
	const message = userDeletedEvent.parse(JSON.parse(raw));
	await feedCache.markUserDeleted(message.userId);
	const followers = await monolithClient.getFollowers(message.userId);
	await feedCache.invalidateFeeds([message.userId, ...followers]);
	logger.info(
		{ userId: message.userId, followers: followers.length },
		'Invalidated feeds for deleted user',
	);
}
