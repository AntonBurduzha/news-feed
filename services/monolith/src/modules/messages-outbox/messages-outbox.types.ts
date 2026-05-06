export type MessageOutboxStatus = 'pending' | 'sent' | 'failed';

export type CreateMessageOutboxInput = {
	topic: string;
	payload: Record<string, unknown>;
	correlationId: string;
};

export type MessageOutboxRow = {
	id: string;
	topic: string;
	payload: Record<string, unknown>;
	correlation_id: string;
};

export type MessageOutbox = {
	id: string;
	topic: string;
	payload: Record<string, unknown>;
	correlationId: string;
};
