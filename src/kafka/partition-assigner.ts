import { AssignerProtocol, type PartitionAssigner } from 'kafkajs';

export function createFollowerPartitionAssigner(partitionIndex: number): PartitionAssigner {
	return () => ({
		name: 'FollowerPartitionAssigner',
		version: 1,
		protocol({ topics }: { topics: string[] }) {
			const userData = Buffer.alloc(4);
			userData.writeUInt32BE(partitionIndex, 0);

			return {
				name: 'FollowerPartitionAssigner',
				metadata: AssignerProtocol.MemberMetadata.encode({
					version: 1,
					topics,
					userData,
				}),
			};
		},
		async assign({
			members,
			topics,
		}: {
			members: { memberId: string; memberMetadata: Buffer }[];
			topics: string[];
		}) {
			return members.map(member => {
				const metadata = AssignerProtocol.MemberMetadata.decode(member.memberMetadata);
				const memberPartitionIndex = metadata!.userData.readUInt32BE(0);

				const assignment: Record<string, number[]> = {};
				for (const topic of topics) {
					assignment[topic] = [memberPartitionIndex];
				}

				return {
					memberId: member.memberId,
					memberAssignment: AssignerProtocol.MemberAssignment.encode({
						version: 1,
						assignment,
						userData: Buffer.alloc(0),
					}),
				};
			});
		},
	});
}
