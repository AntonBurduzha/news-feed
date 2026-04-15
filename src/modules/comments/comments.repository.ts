import { Comments } from '@/db/mongo/models/comments';
import type { CreateCommentInput } from './comments.types';

class CommentRepository {
	async create(input: CreateCommentInput) {
		return Comments.create(input);
	}

	async findMany(postId: number, limit: number, cursor: string | null) {
		const query: Record<string, unknown> = { postId };
		if (cursor) {
			query._id = { $lt: cursor };
		}
		return Comments.find(query).sort({ createdAt: -1 }).limit(limit).lean().exec();
	}

	async deleteById(id: string): Promise<boolean> {
		const result = await Comments.deleteOne({ _id: id }).exec();
		return result.deletedCount > 0;
	}

	async deleteMany(postIds: number[]): Promise<boolean> {
		const result = await Comments.deleteMany({ postId: { $in: postIds } }).exec();
		return (result.deletedCount ?? 0) > 0;
	}
}

export const commentsRepository = new CommentRepository();
