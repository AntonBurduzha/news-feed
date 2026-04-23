import { NotFoundError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { followerPartitionsService } from '@/modules/follower-partitions/follower-partitions.service';
import { followsRepository } from './follow.repository';
import type { CreateFollowInput, Follow, FollowRow } from './follow.types';
import { userService } from '../users/users.service';

function mapFollow(row: FollowRow): Follow {
	return {
		id: row.id,
		followerId: row.follower_id,
		followingId: row.following_id,
		createdAt: row.created_at.toISOString(),
	};
}

class FollowService {
	private readonly followsRepository;
	private readonly followerPartitionsService;

	constructor() {
		this.followsRepository = followsRepository;
		this.followerPartitionsService = followerPartitionsService;
	}

	async createFollow(input: CreateFollowInput): Promise<Follow> {
		const follower = await userService.getUser(input.followerId);
		if (!follower) {
			throw new NotFoundError(`Follower ${input.followerId} was not found`);
		}
		const following = await userService.getUser(input.followingId);
		if (!following) {
			throw new NotFoundError(`Following ${input.followingId} was not found`);
		}
		const follow = await this.followsRepository.create(input);
		if (!follow) {
			throw new Error('Database did not return the created follow');
		}
		try {
			const partitionIndex = await this.followerPartitionsService.getOrAssignPartition(
				input.followerId,
			);
			logger.info(
				{
					followerId: input.followerId,
					followingId: input.followingId,
					partition: partitionIndex,
				},
				'Kafka partition assigned for follower during follow creation',
			);
		} catch {
			logger.error(
				{ followerId: input.followerId },
				'Failed to assign Kafka partition during follow creation',
			);
		}

		return mapFollow(follow);
	}

	async getFollowersByFollowingId(followingId: string): Promise<string[]> {
		const followers = await this.followsRepository.findFollowersByFollowingId(followingId);
		return followers;
	}

	async deleteFollow(id: string): Promise<void> {
		const follow = await this.followsRepository.findById(id);
		if (!follow) {
			throw new NotFoundError(`Follow ${id} was not found`);
		}

		const deleted = await this.followsRepository.delete(id);
		if (!deleted) {
			throw new NotFoundError(`Follow ${id} was not found`);
		}

		const remainingFollows = await this.followsRepository.countByFollowerId(follow.follower_id);
		if (remainingFollows === 0) {
			try {
				await this.followerPartitionsService.releasePartition(follow.follower_id);
			} catch {
				logger.error(
					{ followerId: follow.follower_id },
					'Failed to release Kafka partition after last unfollow',
				);
			}
		}
	}
}

export const followService = new FollowService();
