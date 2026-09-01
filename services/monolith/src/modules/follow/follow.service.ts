import { trace, context, SpanStatusCode } from '@opentelemetry/api';
import { env } from '@/config/env';
import { withTransaction } from '@/db/postgres';
import { requestContext } from '@/middleware/context';
import { KafkaTopics } from '@news-feed/contracts';
import { NotFoundError, ValidationError } from '@/lib/errors';
import { createOwnershipGuard, type OwnershipGuard } from '@/lib/ownership';
import { logger } from '@/lib/logger';
import { followsCreatedTotal, followsDeletedTotal } from '@/lib/metrics';
import { userService } from '@/modules/users/users.service';
import { messagesOutboxRepository } from '@/modules/messages-outbox/messages-outbox.repository';
import { followsRepository } from './follow.repository';
import type { CreateFollowInput, Follow, FollowRow } from './follow.types';
import type { UsersPort } from './follow.ports';
import { CreateMessageOutboxInput } from '../messages-outbox/messages-outbox.types';

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
	private readonly messagesOutboxRepository;
	private readonly usersPort: UsersPort;
	private readonly assertOwnership: OwnershipGuard<FollowRow>;
	constructor(usersPort: UsersPort) {
		this.usersPort = usersPort;
		this.followsRepository = followsRepository;
		this.messagesOutboxRepository = messagesOutboxRepository;
		this.assertOwnership = createOwnershipGuard({
			resource: 'Follow',
			findById: id => this.followsRepository.findById(id),
			ownerOf: row => row.follower_id,
		});
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
				if (input.followerId === input.followingId) {
					throw new ValidationError('User cannot follow itself');
				}
				await this.usersPort.getUser(input.followerId);
				await this.usersPort.getUser(input.followingId);
				const result = await withTransaction(async client => {
					const createdFollow = await this.followsRepository.create(input, client);
					const correlationId = requestContext.getStore()?.correlationId ?? '';
					const traceId = trace.getActiveSpan()?.spanContext()?.traceId;
					const mappedFollow = mapFollow(createdFollow);
					const followCreatedMsg: CreateMessageOutboxInput = {
						topic: KafkaTopics.FollowChangedV1,
						payload: {
							key: createdFollow.id,
							value: JSON.stringify({
								v: 1,
								followerId: createdFollow.follower_id,
								followingId: createdFollow.following_id,
								action: 'created',
								createdAt: new Date().toISOString(),
							}),
						},
						correlationId,
						traceId,
					};
					await this.messagesOutboxRepository.create(followCreatedMsg, client);
					return mappedFollow;
				});
				followsCreatedTotal.inc({ service: env.SERVICE_NAME });
				logger.info(
					{ followerId: input.followerId, followingId: input.followingId },
					'Follow created',
				);
				return result;
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

	async deleteFollow(id: string, userId: string): Promise<void> {
		const span = tracer.startSpan('follow.deleteFollow', {
			attributes: { 'follow.id': id, 'user.id': userId },
		});
		return context.with(trace.setSpan(context.active(), span), async () => {
			try {
				const follow = await this.assertOwnership(id, userId);
				await withTransaction(async client => {
					const followIsDeleted = await this.followsRepository.delete(id, client);
					if (!followIsDeleted) {
						throw new NotFoundError(`Follow ${id} was not found`);
					}
					const correlationId = requestContext.getStore()?.correlationId ?? '';
					const traceId = trace.getActiveSpan()?.spanContext()?.traceId;
					const followDeletedMsg: CreateMessageOutboxInput = {
						topic: KafkaTopics.FollowChangedV1,
						payload: {
							key: id,
							value: JSON.stringify({
								v: 1,
								followerId: follow.follower_id,
								followingId: follow.following_id,
								action: 'deleted',
								createdAt: new Date().toISOString(),
							}),
						},
						correlationId,
						traceId,
					};
					await this.messagesOutboxRepository.create(followDeletedMsg, client);
					followsDeletedTotal.inc({ service: env.SERVICE_NAME });
					logger.info(
						{ followerId: follow.follower_id, followingId: follow.following_id },
						'Follow deleted',
					);
				});
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
