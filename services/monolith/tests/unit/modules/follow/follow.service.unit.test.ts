import { describe, test, expect, vi, beforeEach } from 'vitest';
import {
	followFixture,
	followCreatedOutboxMessage,
	followDeletedOutboxMessage,
} from '../../../fixtures/follow';

vi.mock('@/db/postgres', () => ({
	withTransaction: vi.fn(async (fn: (client: object) => Promise<unknown>) => fn({})),
	db: {},
}));
vi.mock('@/modules/follow/follow.repository', () => ({
	followsRepository: {
		findById: vi.fn(),
		create: vi.fn(),
		delete: vi.fn(),
		findFollowersByFollowingId: vi.fn(),
		findFollowingByFollowerId: vi.fn(),
	},
}));
vi.mock('@/modules/messages-outbox/messages-outbox.repository', () => ({
	messagesOutboxRepository: { create: vi.fn() },
}));
vi.mock('@/modules/users/users.service', () => ({
	userService: { getUser: vi.fn() },
}));

import { followsRepository } from '@/modules/follow/follow.repository';
import { messagesOutboxRepository } from '@/modules/messages-outbox/messages-outbox.repository';
import { userService } from '@/modules/users/users.service';
import { followService } from '@/modules/follow/follow.service';
import { NotFoundError, ValidationError } from '@/lib/errors';
import type { User } from '@/modules/users/users.types';

const followsRepo = vi.mocked(followsRepository);
const createFollowSpy = vi.spyOn(followsRepository, 'create');
const deleteFollowSpy = vi.spyOn(followsRepository, 'delete');
const getUserSpy = vi.spyOn(userService, 'getUser');
const createOutboxMessage = vi.spyOn(messagesOutboxRepository, 'create');
const usersPort = vi.mocked(userService);

const OWNER = 'user-1';
const OTHER_USER = 'user-3';

describe('FollowService.createFollow', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		usersPort.getUser.mockResolvedValue({ id: OWNER } as unknown as User);
	});

	test('rejects a self-follow before touching the database', async () => {
		await expect(
			followService.createFollow({ followerId: OWNER, followingId: OWNER }),
		).rejects.toBeInstanceOf(ValidationError);

		expect(createFollowSpy).not.toHaveBeenCalled();
		expect(getUserSpy).not.toHaveBeenCalled();
	});

	test('throws NotFoundError when the followed user does not exist', async () => {
		usersPort.getUser.mockRejectedValueOnce(new NotFoundError('User user-2 was not found'));

		await expect(
			followService.createFollow({ followerId: OWNER, followingId: 'user-2' }),
		).rejects.toBeInstanceOf(NotFoundError);

		expect(createFollowSpy).not.toHaveBeenCalled();
	});

	test('persists the follow with the caller as follower and writes follow.changed.v1', async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
		followsRepo.create.mockResolvedValue(followFixture);

		const follow = await followService.createFollow({
			followerId: OWNER,
			followingId: 'user-2',
		});

		expect(follow).toMatchObject({ id: 'follow-1', followerId: OWNER, followingId: 'user-2' });
		expect(createFollowSpy).toHaveBeenCalledWith(
			{ followerId: OWNER, followingId: 'user-2' },
			expect.anything(),
		);
		expect(createOutboxMessage).toHaveBeenCalledExactlyOnceWith(
			followCreatedOutboxMessage,
			expect.anything(),
		);
		vi.useRealTimers();
	});
});

describe('FollowService.deleteFollow', () => {
	beforeEach(() => vi.clearAllMocks());

	test('throws NotFoundError when the follow does not exist', async () => {
		followsRepo.findById.mockResolvedValue(null);

		await expect(followService.deleteFollow('follow-1', OWNER)).rejects.toBeInstanceOf(
			NotFoundError,
		);
		expect(deleteFollowSpy).not.toHaveBeenCalled();
	});

	test('throws NotFoundError when trying to delete a follow of another user', async () => {
		followsRepo.findById.mockResolvedValue(followFixture);

		await expect(followService.deleteFollow('follow-1', OTHER_USER)).rejects.toBeInstanceOf(
			NotFoundError,
		);

		expect(deleteFollowSpy).not.toHaveBeenCalled();
		expect(createOutboxMessage).not.toHaveBeenCalled();
	});

	test('deletes the follow for its owner and writes follow.changed.v1', async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
		followsRepo.findById.mockResolvedValue(followFixture);
		followsRepo.delete.mockResolvedValue(true);

		await followService.deleteFollow('follow-1', OWNER);

		expect(deleteFollowSpy).toHaveBeenCalledWith('follow-1', expect.anything());
		expect(createOutboxMessage).toHaveBeenCalledExactlyOnceWith(
			followDeletedOutboxMessage,
			expect.anything(),
		);
		vi.useRealTimers();
	});
});
