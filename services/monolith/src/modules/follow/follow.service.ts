import { trace, context, SpanStatusCode } from '@opentelemetry/api';
import { env } from '@/config/env';
import { NotFoundError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { followsCreatedTotal, followsDeletedTotal } from '@/lib/metrics';
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

	private readonly usersPort: UsersPort;
	constructor(usersPort: UsersPort) {
		this.usersPort = usersPort;
		this.followsRepository = followsRepository;
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
				logger.info(
					{ followerId: input.followerId, followingId: input.followingId },
					'Follow created',
				);
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

	async getFollowingByFollowerId(followerId: string): Promise<string[]> {
		const following = await this.followsRepository.findFollowingByFollowerId(followerId);
		return following;
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
				logger.info({ followerId: follow.follower_id }, 'Follow deleted');
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
