import { MessageOutboxStatus } from '@/modules/messages-outbox/messages-outbox.constants';
import type { MessageOutbox, MessageOutboxStatus as MessageOutboxStatusType } from '@/modules/messages-outbox/messages-outbox.types';

type KafkaMessage = {
	key: string;
	value: string;
	headers?: Record<string, string>;
	partition?: number;
};

type TopicGroup = {
	ids: string[];
	messages: KafkaMessage[];
};

export type OutboxRelayDeps = {
	outboxService: {
		findPendingMessages: () => Promise<MessageOutbox[]>;
		updateMessageStatus: (ids: string[], status: MessageOutboxStatusType) => Promise<void>;
	};
	producer: {
		sendMessage: (topic: string, messages: KafkaMessage[]) => Promise<void>;
	};
	onPublishSuccess?: (topic: string, count: number) => void;
	onPublishFailure?: (topic: string, error: unknown) => void;
};

export type OutboxRelayBatchResult = {
	pendingCount: number;
	publishedCount: number;
	markedSentCount: number;
};

function groupPendingMessagesByTopic(pendingMessages: MessageOutbox[]): Map<string, TopicGroup> {
	const groups = new Map<string, TopicGroup>();

	for (const message of pendingMessages) {
		const kafkaMessage: KafkaMessage = {
			key: message.payload.key as string,
			value: message.payload.value as string,
			headers: { 'x-correlation-id': message.correlationId },
			...(message.payload.partition
				? { partition: message.payload.partition as number }
				: {}),
		};

		const group = groups.get(message.topic);
		if (group) {
			group.ids.push(message.id);
			group.messages.push(kafkaMessage);
		} else {
			groups.set(message.topic, {
				ids: [message.id],
				messages: [kafkaMessage],
			});
		}
	}

	return groups;
}

export async function runOutboxRelayBatch(deps: OutboxRelayDeps): Promise<OutboxRelayBatchResult> {
	const pendingMessages = await deps.outboxService.findPendingMessages();

	if (pendingMessages.length === 0) {
		return { pendingCount: 0, publishedCount: 0, markedSentCount: 0 };
	}

	const topicGroups = groupPendingMessagesByTopic(pendingMessages);
	const successfullyPublishedIds: string[] = [];
	let publishedCount = 0;

	for (const [topic, group] of topicGroups) {
		try {
			await deps.producer.sendMessage(topic, group.messages);
			deps.onPublishSuccess?.(topic, group.messages.length);
			successfullyPublishedIds.push(...group.ids);
			publishedCount += group.messages.length;
		} catch (error) {
			deps.onPublishFailure?.(topic, error);
			// rows for this topic stay pending — do not add to successfullyPublishedIds
		}
	}

	if (successfullyPublishedIds.length > 0) {
		await deps.outboxService.updateMessageStatus(
			successfullyPublishedIds,
			MessageOutboxStatus.Sent,
		);
	}

	return {
		pendingCount: pendingMessages.length,
		publishedCount,
		markedSentCount: successfullyPublishedIds.length,
	};
}
