import { Router } from 'express';
import { asyncHandler } from '@/lib/async-handler';
import { validate } from '@/middleware/validate';
import { register, login, refresh, logout } from './auth.controller';
import { registerSchema, loginSchema, refreshSchema, logoutRequestSchema } from './auth.schemas';

const router = Router();

router.post('/register', validate(registerSchema), asyncHandler(register));
router.post('/login', validate(loginSchema), asyncHandler(login));
router.post('/refresh', validate(refreshSchema), asyncHandler(refresh));
router.post('/logout', validate(logoutRequestSchema), asyncHandler(logout));

export default router;
