import type { RequestHandler } from 'express';
import httpStatus from 'http-status';
import { asyncHandler } from '@/lib/async-handler';
import { userService } from './users.service';
import type { CreateUserInput, UpdateUserInput } from './users.types';

export const createUser: RequestHandler = asyncHandler(async (req, res) => {
	const userData = req.body as CreateUserInput;
	const user = await userService.createUser(userData);
	res.status(httpStatus.CREATED).json(user);
});

export const getUsers: RequestHandler = asyncHandler(async (_req, res) => {
	const users = await userService.getUsers();
	res.json(users);
});

export const getUser: RequestHandler = asyncHandler(async (req, res) => {
	const { id } = req.params as { id: string };
	const user = await userService.getUser(id);
	res.json(user);
});

export const updateUser: RequestHandler = asyncHandler(async (req, res) => {
	const { id } = req.params as { id: string };
	const user = await userService.updateUser(id, req.body as UpdateUserInput);
	res.json(user);
});

export const deleteUser: RequestHandler = asyncHandler(async (req, res) => {
	const { id } = req.params as { id: string };
	await userService.deleteUser(id);
	res.status(httpStatus.NO_CONTENT).send();
});
