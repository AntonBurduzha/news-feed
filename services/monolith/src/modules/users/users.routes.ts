import { Router } from 'express';
import { createUser, deleteUser, getUser, getUsers, updateUser } from './users.controller';
import {
	createUserRequestSchema,
	updateUserRequestSchema,
	userIdRequestSchema,
} from './users.schemas';
import { validate } from '@/middleware/validate';

const router = Router();

router.route('/').post(validate(createUserRequestSchema), createUser).get(getUsers);

router
	.route('/:id')
	.get(validate(userIdRequestSchema), getUser)
	.put(validate(updateUserRequestSchema), updateUser)
	.delete(validate(userIdRequestSchema), deleteUser);

export default router;
