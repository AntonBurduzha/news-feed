import { Router } from 'express';
import { asyncHandler } from '@/lib/async-handler';
import { validate } from '@/middleware/validate';
import { register, login, refresh } from './auth.controller';
import { registerSchema, loginSchema, refreshSchema } from './auth.schemas';

const router = Router();

router.post('/register', validate(registerSchema), asyncHandler(register));
router.post('/login', validate(loginSchema), asyncHandler(login));
router.post('/refresh', validate(refreshSchema), asyncHandler(refresh));

export default router;
