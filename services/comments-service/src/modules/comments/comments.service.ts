import { NotFoundError } from '@/lib/errors';
import { postsProjectionRepository } from '@/modules/posts-projection/posts-projection.repository';
import { commentsRepository } from './comments.repository';
import type {
	Comment,
	CommentAuthor,
	CreateCommentInput,
	GetCommentsInput,
	GetCommentsResult,
} from './comments.types';

function mapComment(doc: Record<string, unknown>): Comment {
	return {
		id: doc._id as string,
		postId: doc.postId as string,
		author: doc.author as CommentAuthor,
		content: doc.content as string,
		createdAt: doc.createdAt as string,
	};
}

class CommentsService {
	async createComment(input: CreateCommentInput) {
		const post = await postsProjectionRepository.findById(input.postId);
		if (!post || post.deletedAt) {
			throw new NotFoundError(`Post ${input.postId} was not found`);
		}
		// const user = await this.usersPort.getUser(input.author.userId);
		// if (!user) {
		// 	throw new NotFoundError(`User ${input.author.userId} was not found`);
		// }
		const comment = await commentsRepository.create(input);
		return mapComment(comment.toObject());
	}

	async getComments(postId: string, query: GetCommentsInput): Promise<GetCommentsResult> {
		const limit = query.limit ?? 10;
		const cursor = query.cursor ?? null;
		const comments = await commentsRepository.findMany(postId, limit, cursor);
		let nextCursor = null;
		if (comments.length > 0) {
			nextCursor = comments.length > 0 ? comments[comments.length - 1]._id.toString() : null;
		}
		return {
			comments: comments.map(mapComment),
			nextCursor: cursor && comments.length < limit ? null : nextCursor,
		};
	}

	async deleteComment(id: string): Promise<void> {
		const deleted = await commentsRepository.deleteById(id);
		if (!deleted) {
			throw new NotFoundError(`Comment ${id} was not found`);
		}
	}

	async deleteCommentsByPostId(postId: string): Promise<void> {
		const deleted = await commentsRepository.deleteByPostId(postId);
		if (!deleted) {
			throw new NotFoundError(`Comments for post id ${postId} were not found`);
		}
	}
}

export const commentsService = new CommentsService();
