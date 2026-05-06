import mongoose from 'mongoose';

const postsProjectionSchema = new mongoose.Schema(
	{
		_id: { type: String },
		userId: { type: String, required: true },
		createdAt: { type: Date, default: () => new Date() },
		deletedAt: { type: Date, default: null },
	},
	{ _id: false, versionKey: false },
);

export const PostsProjection = mongoose.model('PostsProjection', postsProjectionSchema);
