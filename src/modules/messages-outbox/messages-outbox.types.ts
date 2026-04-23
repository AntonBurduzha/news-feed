export type MessageOutboxStatus = 'pending' | 'sent' | 'failed';

export type CreateMessageOutboxInput = {
	topic: string;
	payload: Record<string, unknown>;
};

export type MessageOutboxRow = {
	id: string;
	topic: string;
	payload: Record<string, unknown>;
};
