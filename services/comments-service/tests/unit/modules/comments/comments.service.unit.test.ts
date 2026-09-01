import { describe, test, expect, vi, beforeEach } from 'vitest';

vi.mock('@/modules/comments/comments.repository', () => ({
	commentsRepository: {
		findById: vi.fn(),
		create: vi.fn(),
		deleteById: vi.fn(),
		deleteByPostId: vi.fn(),
	},
}));
vi.mock('@/modules/posts-projection/posts-projection.repository', () => ({
	postsProjectionRepository: { findById: vi.fn() },
}));

import { commentsRepository } from '@/modules/comments/comments.repository';
import { commentsService } from '@/modules/comments/comments.service';
import { NotFoundError } from '@/lib/errors';
import type { Comment } from '@/modules/comments/comments.types';

const commentsRepo = vi.mocked(commentsRepository);
const deleteByIdSpy = vi.spyOn(commentsRepository, 'deleteById');

const OWNER = 'user-1';
const OTHER_USER = 'user-2';

const commentFixture: Comment = {
	id: 'comment-1',
	postId: 'post-1',
	author: { userId: OWNER, name: 'Alice', avatarUrl: null },
	content: 'hello',
	createdAt: '2026-01-01T00:00:00.000Z',
};

describe('CommentsService.deleteComment', () => {
	beforeEach(() => vi.clearAllMocks());

	test('deletes the comment for its author', async () => {
		commentsRepo.findById.mockResolvedValue(commentFixture);
		commentsRepo.deleteById.mockResolvedValue(true);

		await commentsService.deleteComment('comment-1', OWNER);

		expect(deleteByIdSpy).toHaveBeenCalledExactlyOnceWith('comment-1');
	});

	test('throws NotFoundError when the comment does not exist', async () => {
		commentsRepo.findById.mockResolvedValue(null);

		await expect(commentsService.deleteComment('comment-1', OWNER)).rejects.toBeInstanceOf(
			NotFoundError,
		);
		expect(deleteByIdSpy).not.toHaveBeenCalled();
	});

	test('throws NotFoundError when trying to delete a comment of another user', async () => {
		commentsRepo.findById.mockResolvedValue(commentFixture);

		await expect(commentsService.deleteComment('comment-1', OTHER_USER)).rejects.toBeInstanceOf(
			NotFoundError,
		);
		expect(deleteByIdSpy).not.toHaveBeenCalled();
	});
});
