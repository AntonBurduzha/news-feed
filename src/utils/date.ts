export function formatKafkaTimestamp(rawTimestamp: string): string | null {
	const timestamp = Number(rawTimestamp);
	if (Number.isNaN(timestamp)) {
		return null;
	}
	return new Date(timestamp).toISOString();
}
