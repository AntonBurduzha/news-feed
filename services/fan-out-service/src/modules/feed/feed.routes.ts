import { Router } from 'express';
import { validate } from '@/middleware/validate';
import { getFeed } from './feed.controller';
import { getFeedRequestSchema } from './feed.schemas';

const router = Router();

router.get('/', validate(getFeedRequestSchema), getFeed);

export default router;
