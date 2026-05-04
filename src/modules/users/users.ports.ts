import type { GetPostsResult } from '@/modules/posts/posts.types';

export interface PostsPort {
	getPosts({ userId }: { userId: string }): Promise<GetPostsResult>;
}
