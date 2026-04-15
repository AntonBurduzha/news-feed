export type Follow = {
	id: number;
	followerId: number;
	followingId: number;
	createdAt: string;
};

export type FollowRow = {
	id: number;
	follower_id: number;
	following_id: number;
	created_at: Date;
};

export type CreateFollowInput = {
	followerId: number;
	followingId: number;
};
