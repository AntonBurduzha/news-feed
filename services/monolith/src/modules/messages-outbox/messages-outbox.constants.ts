import type { MessageOutboxStatus as MessageOutboxStatusType } from './messages-outbox.types';

export const MessageOutboxStatus: Record<string, MessageOutboxStatusType> = {
	Pending: 'pending',
	Sent: 'sent',
	Failed: 'failed',
};
