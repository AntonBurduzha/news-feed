import { messagesOutboxRepository } from './messages-outbox.repository';
import { MessageOutbox, MessageOutboxRow, MessageOutboxStatus } from './messages-outbox.types';

function mapMessageOutbox(row: MessageOutboxRow): MessageOutbox {
	return {
		id: row.id,
		topic: row.topic,
		payload: row.payload,
		correlationId: row.correlation_id,
	};
}

class MessagesOutboxService {
	private readonly repository;

	constructor() {
		this.repository = messagesOutboxRepository;
	}

	async findPendingMessages(): Promise<MessageOutbox[]> {
		const rows = await this.repository.findPendingMessages();
		return rows.map(mapMessageOutbox);
	}

	async updateMessageStatus(ids: string[], status: MessageOutboxStatus): Promise<void> {
		return this.repository.updateMessageStatus(ids, status);
	}

	async cleanUpSentMessages(): Promise<void> {
		return this.repository.cleanUpSentMessages();
	}
}

export const messagesOutboxService = new MessagesOutboxService();
