import { postsProjectionRepository } from './posts-projection.repository';
import type { UpsertPostProjectionInput } from './posts-projection.types';

class PostsProjectionService {
	async upsertById(input: UpsertPostProjectionInput) {
		return postsProjectionRepository.upsertById(input);
	}
}

export const postsProjectionService = new PostsProjectionService();
