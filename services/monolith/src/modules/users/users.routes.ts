import { Router } from 'express';
import {
	createUser,
	deleteUser,
	getUser,
	getUsers,
	updateUser,
	uploadAvatar,
} from './users.controller';
import {
	createUserRequestSchema,
	updateUserRequestSchema,
	userIdRequestSchema,
	uploadAvatarRequestSchema,
} from './users.schemas';
import { validate } from '@/middleware/validate';
import { imageUpload } from '@/middleware/upload';

const router = Router();

router.route('/').post(validate(createUserRequestSchema), createUser).get(getUsers);

router
	.route('/:id')
	.get(validate(userIdRequestSchema), getUser)
	.put(validate(updateUserRequestSchema), updateUser)
	.delete(validate(userIdRequestSchema), deleteUser);

router
	.route('/:id/avatar')
	.put(imageUpload.single('avatar'), validate(uploadAvatarRequestSchema), uploadAvatar);

export default router;
