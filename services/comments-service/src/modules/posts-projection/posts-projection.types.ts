export type PostProjection = {
	_id: string;
	userId: string;
	createdAt: Date;
	deletedAt: Date | null;
};

export interface PostProjectionDTO {
	_id: string;
	userId: string;
	createdAt: string;
	deletedAt: string | null;
}

export type UpsertPostProjectionInput = Partial<PostProjection>;
