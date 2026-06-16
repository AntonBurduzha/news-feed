import { trace, context, SpanStatusCode } from '@opentelemetry/api';
import { env } from '@/config/env';
import { NotFoundError } from '@/lib/errors';
import { commentsCreatedTotal, commentsDeletedTotal } from '@/lib/metrics';
import { postsProjectionRepository } from '@/modules/posts-projection/posts-projection.repository';
import { commentsRepository } from './comments.repository';
import type {
	Comment,
	CommentAuthor,
	CreateCommentInput,
	GetCommentsInput,
	GetCommentsResult,
} from './comments.types';

const tracer = trace.getTracer('comments-service');

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
		const span = tracer.startSpan('comments.createComment', {
			attributes: {
				'post.id': input.postId,
				'user.id': input.author.userId,
			},
		});
		return context.with(trace.setSpan(context.active(), span), async () => {
			try {
				const post = await postsProjectionRepository.findById(input.postId);
				if (!post || post.deletedAt) {
					throw new NotFoundError(`Post ${input.postId} was not found`);
				}
				const comment = await commentsRepository.create(input);
				commentsCreatedTotal.inc({ service: env.SERVICE_NAME });
				return mapComment(comment.toObject());
			} catch (error) {
				span.recordException(error as Error);
				span.setStatus({ code: SpanStatusCode.ERROR, message: (error as Error).message });
				throw error;
			} finally {
				span.end();
			}
		});
	}

	async getComments(postId: string, query: GetCommentsInput): Promise<GetCommentsResult> {
		const span = tracer.startSpan('comments.getComments', {
			attributes: { 'post.id': postId },
		});
		return context.with(trace.setSpan(context.active(), span), async () => {
			try {
				const limit = query.limit ?? 10;
				const cursor = query.cursor ?? null;
				const comments = await commentsRepository.findMany(postId, limit, cursor);
				let nextCursor = null;
				if (comments.length > 0) {
					nextCursor = comments.length > 0 ? comments[comments.length - 1]._id.toString() : null;
				}
				span.setAttribute('comments.count', comments.length);
				return {
					comments: comments.map(mapComment),
					nextCursor: cursor && comments.length < limit ? null : nextCursor,
				};
			} catch (error) {
				span.recordException(error as Error);
				span.setStatus({ code: SpanStatusCode.ERROR, message: (error as Error).message });
				throw error;
			} finally {
				span.end();
			}
		});
	}

	async deleteComment(id: string): Promise<void> {
		const span = tracer.startSpan('comments.deleteComment', {
			attributes: { 'comment.id': id },
		});
		return context.with(trace.setSpan(context.active(), span), async () => {
			try {
				const deleted = await commentsRepository.deleteById(id);
				if (!deleted) {
					throw new NotFoundError(`Comment ${id} was not found`);
				}
				commentsDeletedTotal.inc({ service: env.SERVICE_NAME });
			} catch (error) {
				span.recordException(error as Error);
				span.setStatus({ code: SpanStatusCode.ERROR, message: (error as Error).message });
				throw error;
			} finally {
				span.end();
			}
		});
	}

	async deleteCommentsByPostId(postId: string): Promise<number> {
		const span = tracer.startSpan('comments.deleteByPostId', {
			attributes: { 'post.id': postId },
		});
		return context.with(trace.setSpan(context.active(), span), async () => {
			try {
				const deletedCount = await commentsRepository.deleteByPostId(postId);
				if (deletedCount !== 0) {
					commentsDeletedTotal.inc({ service: env.SERVICE_NAME }, deletedCount);
				}
				span.setAttribute('comments.deleted_count', deletedCount);
				return deletedCount;
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

export const commentsService = new CommentsService();
