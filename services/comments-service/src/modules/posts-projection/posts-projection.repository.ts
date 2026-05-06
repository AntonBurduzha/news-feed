import { PostsProjection } from '@/db/mongo/models/posts-projection';
import type { UpsertPostProjectionInput } from './posts-projection.types';

class PostsProjectionRepository {
	async upsertById(input: UpsertPostProjectionInput) {
		const fields = {} as UpsertPostProjectionInput;
		if (input.userId !== undefined) {
			fields.userId = input.userId;
		}
		if (input.deletedAt !== undefined) {
			fields.deletedAt = input.deletedAt;
		}
		return PostsProjection.findOneAndUpdate(
			{ _id: input._id },
			{
				$set: fields,
				$setOnInsert: {},
			},
			{
				upsert: true,
				returnDocument: 'after',
				setDefaultsOnInsert: true,
			},
		);
	}

	async findById(id: string) {
		return PostsProjection.findById(id);
	}
}

export const postsProjectionRepository = new PostsProjectionRepository();
