import { NotFoundError } from '@/lib/errors';
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
		postId: doc.postId as number,
		author: doc.author as CommentAuthor,
		content: doc.content as string,
		createdAt: doc.createdAt as string,
	};
}

class CommentsService {
	async createComment(input: CreateCommentInput) {
		// TODO: check post exists and user
		const comment = await commentsRepository.create(input);
		return mapComment(comment.toObject());
	}

	async getComments(postId: string, query: GetCommentsInput): Promise<GetCommentsResult> {
		const limit = query.limit ?? 10;
		const cursor = query.cursor ?? null;
		const comments = await commentsRepository.findMany(Number(postId), limit, cursor);
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

	async deleteComments(ids: string[]): Promise<void> {
		const deleted = await commentsRepository.deleteMany(ids);
		if (!deleted) {
			throw new NotFoundError(`Comments ${ids.join(', ')} were not found`);
		}
	}
}

export const commentsService = new CommentsService();
