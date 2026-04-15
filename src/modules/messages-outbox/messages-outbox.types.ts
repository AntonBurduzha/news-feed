export type MessageOutboxStatus = 'pending' | 'sent' | 'failed';

export type CreateMessageOutboxInput = {
	topic: string;
	payload: Record<string, unknown>;
};

export type MessageOutboxRow = {
	id: number;
	topic: string;
	payload: Record<string, unknown>;
};
