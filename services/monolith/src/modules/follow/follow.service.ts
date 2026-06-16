import { trace, context, SpanStatusCode } from '@opentelemetry/api';
import { env } from '@/config/env';
import { NotFoundError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { followsCreatedTotal, followsDeletedTotal } from '@/lib/metrics';
import { followerPartitionsService } from '@/modules/follower-partitions/follower-partitions.service';
import { followsRepository } from './follow.repository';
import type { CreateFollowInput, Follow, FollowRow } from './follow.types';
import { userService } from '@/modules/users/users.service';
import type { UsersPort } from './follow.ports';

const tracer = trace.getTracer('follow-service');

function mapFollow(row: FollowRow): Follow {
	return {
		id: row.id,
		followerId: row.follower_id,
		followingId: row.following_id,
		createdAt: row.created_at,
	};
}

class FollowService {
	private readonly followsRepository;
	private readonly followerPartitionsService;

	private readonly usersPort: UsersPort;
	constructor(usersPort: UsersPort) {
		this.usersPort = usersPort;
		this.followsRepository = followsRepository;
		this.followerPartitionsService = followerPartitionsService;
	}

	async createFollow(input: CreateFollowInput): Promise<Follow> {
		const span = tracer.startSpan('follow.createFollow', {
			attributes: {
				'follower.id': input.followerId,
				'following.id': input.followingId,
			},
		});
		return context.with(trace.setSpan(context.active(), span), async () => {
			try {
				const follower = await this.usersPort.getUser(input.followerId);
				if (!follower) {
					throw new NotFoundError(`Follower ${input.followerId} was not found`);
				}
				const following = await this.usersPort.getUser(input.followingId);
				if (!following) {
					throw new NotFoundError(`Following ${input.followingId} was not found`);
				}
				const follow = await this.followsRepository.create(input);
				if (!follow) {
					throw new Error('Database did not return the created follow');
				}
				followsCreatedTotal.inc({ service: env.SERVICE_NAME });
				try {
					const partitionSpan = tracer.startSpan('follow.assignPartition', {
						attributes: { 'follower.id': input.followerId },
					});
					const partitionIndex = await context.with(
						trace.setSpan(context.active(), partitionSpan),
						async () => {
							try {
								return await this.followerPartitionsService.getOrAssignPartition(
									input.followerId,
								);
							} finally {
								partitionSpan.end();
							}
						},
					);
					span.setAttribute('kafka.partition', partitionIndex);
					logger.info(
						{
							followerId: input.followerId,
							followingId: input.followingId,
							assignedPartition: partitionIndex,
						},
						'Follow created',
					);
				} catch {
					logger.error(
						{ followerId: input.followerId },
						'Failed to assign Kafka partition during follow creation',
					);
				}

				return mapFollow(follow);
			} catch (error) {
				span.recordException(error as Error);
				span.setStatus({ code: SpanStatusCode.ERROR, message: (error as Error).message });
				throw error;
			} finally {
				span.end();
			}
		});
	}

	async getFollowersByFollowingId(followingId: string): Promise<string[]> {
		const followers = await this.followsRepository.findFollowersByFollowingId(followingId);
		return followers;
	}

	async deleteFollow(id: string): Promise<void> {
		const span = tracer.startSpan('follow.deleteFollow', {
			attributes: { 'follow.id': id },
		});
		return context.with(trace.setSpan(context.active(), span), async () => {
			try {
				const follow = await this.followsRepository.findById(id);
				if (!follow) {
					throw new NotFoundError(`Follow ${id} was not found`);
				}

				const deleted = await this.followsRepository.delete(id);
				if (!deleted) {
					throw new NotFoundError(`Follow ${id} was not found`);
				}
				followsDeletedTotal.inc({ service: env.SERVICE_NAME });
				span.setAttribute('follower.id', follow.follower_id);
				const remainingFollows = await this.followsRepository.countByFollowerId(
					follow.follower_id,
				);
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
export const followService = new FollowService(usersPort);
