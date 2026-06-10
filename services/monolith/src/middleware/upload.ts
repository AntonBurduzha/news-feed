import multer from 'multer';

export const AVATAR_MAX_BYTES = 1 * 1024 * 1024;
export const AVATAR_ALLOWED_MIME = ['image/png', 'image/jpeg', 'image/webp'] as const;

export const imageUpload = multer({
	storage: multer.memoryStorage(),
	limits: {
		fileSize: AVATAR_MAX_BYTES,
		files: 1,
	},
	fileFilter: (_req, file, cb) => {
		const ok = (AVATAR_ALLOWED_MIME as readonly string[]).includes(file.mimetype);
		if (!ok) {
			cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', file.fieldname));
			return;
		}
		cb(null, ok);
	},
});
