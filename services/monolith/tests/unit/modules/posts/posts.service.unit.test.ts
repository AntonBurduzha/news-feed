import { describe, test, expect, vi, beforeEach } from 'vitest';
import {
	postFixture,
	deletePostOutboxMessage,
	postCreatedOutboxMessage,
} from '../../../fixtures/posts';

vi.mock('@/db/postgres', () => ({
	withTransaction: vi.fn(async (fn: (client: object) => Promise<unknown>) => fn({})),
	db: {},
}));
vi.mock('@/modules/posts/posts.repository', () => ({
	postsRepository: {
		findAll: vi.fn(),
		findById: vi.fn(),
		create: vi.fn(),
		update: vi.fn(),
		delete: vi.fn(),
	},
}));
vi.mock('@/modules/messages-outbox/messages-outbox.repository', () => ({
	messagesOutboxRepository: { create: vi.fn() },
}));
vi.mock('@/modules/users/users.service', () => ({
	userService: { getUser: vi.fn() },
}));

import { postsRepository } from '@/modules/posts/posts.repository';
import { messagesOutboxRepository } from '@/modules/messages-outbox/messages-outbox.repository';
import { userService } from '@/modules/users/users.service';
import { postService } from '@/modules/posts/posts.service';
import { NotFoundError } from '@/lib/errors';
import { User } from '@/modules/users/users.types';

const postsRepo = vi.mocked(postsRepository);
const createPostRepositorySpy = vi.spyOn(postsRepository, 'create');
const createOutboxMessage = vi.spyOn(messagesOutboxRepository, 'create');
const usersPort = vi.mocked(userService);

describe('PostService.createPost', () => {
	beforeEach(() => vi.clearAllMocks());

	test('throws NotFoundError when user does not exist', async () => {
		usersPort.getUser.mockResolvedValue(null as unknown as User);
		await expect(
			postService.createPost({ userId: 'user-1', content: 'hi' }),
		).rejects.toBeInstanceOf(NotFoundError);
		expect(createPostRepositorySpy).not.toHaveBeenCalled();
	});

	test('writes post.created.v1 outbox message', async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
		usersPort.getUser.mockResolvedValue({ id: 'user-1' } as unknown as User);
		postsRepo.create.mockResolvedValue(postFixture);

		const post = await postService.createPost({ userId: 'user-1', content: 'hello' });

		expect(post.id).toBe('post-1');
		expect(createOutboxMessage).toHaveBeenCalledTimes(1);
		expect(createOutboxMessage).toHaveBeenCalledWith(postCreatedOutboxMessage, expect.anything());
		vi.useRealTimers();
	});
});

describe('PostService.getPost', () => {
	beforeEach(() => vi.clearAllMocks());

	test('returns post when row is present', async () => {
		postsRepo.findById.mockResolvedValue(postFixture);
		const result = await postService.getPost('post-1');
		expect(result).toMatchObject({ id: 'post-1', userId: 'user-1', content: 'hello' });
	});

	test('throws NotFoundError when row is missing', async () => {
		postsRepo.findById.mockResolvedValue(null);
		await expect(postService.getPost('missing')).rejects.toBeInstanceOf(NotFoundError);
	});
});

describe('PostService.updatePost', () => {
	beforeEach(() => vi.clearAllMocks());
	test('returns updated post when row is present', async () => {
		postsRepo.update.mockResolvedValue({ ...postFixture, content: 'x' });
		const result = await postService.updatePost('post-1', { content: 'x' });
		expect(result).toMatchObject({ id: 'post-1', userId: 'user-1', content: 'x' });
	});

	test('throws NotFoundError when row is missing', async () => {
		postsRepo.update.mockResolvedValue(null);
		await expect(postService.updatePost('missing', { content: 'x' })).rejects.toBeInstanceOf(
			NotFoundError,
		);
	});
});

describe('PostService.deletePost', () => {
	beforeEach(() => vi.clearAllMocks());
	test('writes post.deleted.v1 outbox row on success', async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
		postsRepo.findById.mockResolvedValue(postFixture);
		postsRepo.delete.mockResolvedValue(true);
		await postService.deletePost('post-1');
		expect(createOutboxMessage).toHaveBeenCalledWith(deletePostOutboxMessage, expect.anything());
		vi.useRealTimers();
	});

	test('throws NotFoundError when row is missing', async () => {
		postsRepo.findById.mockResolvedValue(null);
		await expect(postService.deletePost('missing')).rejects.toBeInstanceOf(NotFoundError);
		expect(createOutboxMessage).not.toHaveBeenCalled();
	});
});
