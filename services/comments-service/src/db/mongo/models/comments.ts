import mongoose from 'mongoose';

const commentsSchema = new mongoose.Schema(
	{
		postId: {
			type: String,
			required: true,
			index: true,
		},
		// TODO: rework
		author: {
			userId: { type: String, required: true },
			name: { type: String, required: true },
			avatarUrl: { type: String },
		},
		content: { type: String, required: true, maxLength: 280 },
	},
	{
		timestamps: true,
	},
);

export const Comments = mongoose.model('Comments', commentsSchema);
