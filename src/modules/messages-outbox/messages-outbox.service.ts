import { messagesOutboxRepository } from './messages-outbox.repository';
import { MessageOutboxRow, MessageOutboxStatus } from './messages-outbox.types';

class MessagesOutboxService {
	private readonly repository;

	constructor() {
		this.repository = messagesOutboxRepository;
	}

	async findPendingMessages(): Promise<MessageOutboxRow[]> {
		return this.repository.findPendingMessages();
	}

	async updateMessageStatus(ids: string[], status: MessageOutboxStatus): Promise<void> {
		return this.repository.updateMessageStatus(ids, status);
	}

	async cleanUpSentMessages(): Promise<void> {
		return this.repository.cleanUpSentMessages();
	}
}

export const messagesOutboxService = new MessagesOutboxService();
