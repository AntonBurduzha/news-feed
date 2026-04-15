import { logger } from '@/lib/logger';
import { normalizeError } from '@/lib/errors';
import { kafkaAdmin } from '@/kafka/admin';
import { KafkaTopics } from '@/kafka/topics';
import { followerPartitionsRepository } from './follower-partitions.repository';

class FollowerPartitionsService {
	private readonly repository;

	constructor() {
		this.repository = followerPartitionsRepository;
	}

	async getPartitionForFollower(followerId: number): Promise<number | null> {
		const row = await this.repository.findByFollowerId(followerId);
		return row?.partition_index ?? null;
	}

	async reconcilePartitions(): Promise<void> {
		try {
			const followerIds = await this.repository.findFollowerIdsWithoutPartition();

			if (followerIds.length === 0) {
				logger.info('Partition reconciliation complete — all followers have partitions');
				return;
			}

			logger.info(
				{ count: followerIds.length, followerIds },
				'Found followers without partition assignments — reconciling',
			);

			for (const followerId of followerIds) {
				try {
					await this.getOrAssignPartition(followerId);
				} catch (error) {
					logger.error(
						{ err: normalizeError(error), followerId },
						'Failed to reconcile partition for follower — will retry on next startup',
					);
				}
			}
			logger.info('Partition reconciliation complete');
		} catch (error) {
			logger.error({ err: normalizeError(error) }, 'Partition reconciliation failed');
			throw error;
		}
	}

	async getOrAssignPartition(followerId: number): Promise<number> {
		const existingPartition = await this.getPartitionForFollower(followerId);
		if (existingPartition !== null) {
			logger.info(
				{ followerId, partition: existingPartition },
				'Follower already has a dedicated partition',
			);
			return existingPartition;
		}

		const unassignedIndex = await this.repository.findUnassignedPartitionIndex(
			kafkaAdmin.getPartitionCount(KafkaTopics.PostsCreate),
		);

		if (unassignedIndex !== null) {
			await this.persistAssignment(followerId, unassignedIndex);
			logger.info(
				{ followerId, partition: unassignedIndex },
				'Reused existing unassigned partition for follower',
			);
			return unassignedIndex;
		}

		const newPartitionIndex = kafkaAdmin.getPartitionCount(KafkaTopics.PostsCreate);
		const newTotalCount = kafkaAdmin.getPartitionCount(KafkaTopics.PostsCreate) + 1;

		try {
			await kafkaAdmin.createPartitions(KafkaTopics.PostsCreate, newTotalCount);
			await this.persistAssignment(followerId, newPartitionIndex);

			return newPartitionIndex;
		} catch (error) {
			logger.error(
				{ err: normalizeError(error), followerId },
				'Failed to create dedicated partition for follower',
			);
			throw error;
		}
	}

	async persistAssignment(followerId: number, partitionIndex: number): Promise<void> {
		await this.repository.create(followerId, partitionIndex);
		logger.info(
			{ followerId, partition: partitionIndex },
			'Dedicated partition assigned and persisted for follower',
		);
	}

	async releasePartition(followerId: number): Promise<void> {
		const deleted = await this.repository.deleteByFollowerId(followerId);
		if (deleted) {
			logger.info({ followerId }, 'Released partition assignment for follower');
		}
	}
}

export const followerPartitionsService = new FollowerPartitionsService();
