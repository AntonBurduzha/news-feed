export type Follow = {
	id: string;
	followerId: string;
	followingId: string;
	createdAt: string;
};

export type FollowRow = {
	id: string;
	follower_id: string;
	following_id: string;
	created_at: string;
};

export type CreateFollowInput = {
	followerId: string;
	followingId: string;
};
