export type MessageOutboxStatus = 'pending' | 'sent' | 'failed';

export type CreateMessageOutboxInput = {
	topic: string;
	payload: Record<string, unknown>;
	correlationId: string;
	traceId: string | undefined;
};

export type MessageOutboxRow = {
	id: string;
	topic: string;
	payload: Record<string, unknown>;
	correlation_id: string;
	trace_id: string | null;
};

export type MessageOutbox = {
	id: string;
	topic: string;
	payload: Record<string, unknown>;
	correlationId: string;
	traceId: string | null;
};
