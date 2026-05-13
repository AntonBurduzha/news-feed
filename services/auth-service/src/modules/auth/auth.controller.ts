import type { Request, Response } from 'express';
import { authService } from './auth.service';
import type { RegisterRequest, LoginRequest, RefreshRequest } from './auth.schemas';

export async function register(req: Request, res: Response) {
	const body = req as RegisterRequest;
	const result = await authService.register(body);
	res.status(201).json(result);
}

export async function login(req: Request, res: Response) {
	const body = req as LoginRequest;
	const result = await authService.login(body);
	res.json(result);
}

export async function refresh(req: Request, res: Response) {
	const body = req as RefreshRequest;
	const result = await authService.refresh(body);
	res.json(result);
}
