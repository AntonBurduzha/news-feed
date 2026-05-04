import type { Post } from '@/modules/posts/posts.types';
import type { User } from '@/modules/users/users.types';

export interface PostsPort {
	getPost(id: string): Promise<Post>;
}

export interface UsersPort {
	getUser(id: string): Promise<User>;
}
