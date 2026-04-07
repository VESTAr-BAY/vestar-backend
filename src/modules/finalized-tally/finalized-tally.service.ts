import { Injectable } from '@nestjs/common';
import { toOptionalBigInt } from '../../common/utils/query.utils';
import { PrismaService } from '../../prisma/prisma.service';
import { ResultSummariesService } from '../result-summaries/result-summaries.service';

type UpsertFinalizedTallyDto = {
  electionId: string | bigint;
  candidateKey: string;
  count: number;
  voteRatio: number;
  finalizedAt: string | Date;
};

@Injectable()
export class FinalizedTallyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly resultSummariesService: ResultSummariesService,
  ) {}

  async finalizeForElection(electionIdInput: string | bigint) {
    const electionId = BigInt(electionIdInput);
    const [onchainElection, validBallots] = await Promise.all([
      this.prisma.onchainElection.findUnique({
        where: { id: electionId },
        include: {
          draft: {
            include: {
              electionCandidates: {
                orderBy: { displayOrder: 'asc' },
              },
            },
          },
        },
      }),
      this.prisma.decryptedBallot.findMany({
        where: {
          isValid: true,
          voteSubmission: { onchainElectionId: electionId },
        },
        select: { candidateKeys: true },
      }),
    ]);

    const candidates = onchainElection?.draft?.electionCandidates ?? [];
    const counts = new Map<string, number>();
    for (const candidate of candidates) {
      counts.set(candidate.candidateKey, 0);
    }

    for (const ballot of validBallots) {
      const candidateKeys = Array.isArray(ballot.candidateKeys)
        ? ballot.candidateKeys.filter(
            (candidateKey): candidateKey is string =>
              typeof candidateKey === 'string',
          )
        : [];

      for (const candidateKey of candidateKeys) {
        counts.set(candidateKey, (counts.get(candidateKey) ?? 0) + 1);
      }
    }

    const totalValidVotes = validBallots.length;
    const finalizedAt = new Date();

    await this.prisma.$transaction(async (tx) => {
      await tx.finalizedTally.deleteMany({ where: { onchainElectionId: electionId } });

      if (counts.size > 0) {
        await tx.finalizedTally.createMany({
          data: Array.from(counts.entries()).map(([candidateKey, count]) => ({
            onchainElectionId: electionId,
            candidateKey,
            count,
            voteRatio: totalValidVotes === 0 ? 0 : count / totalValidVotes,
            finalizedAt,
          })),
        });
      }

    });

    await this.resultSummariesService.recomputeForElection(electionId);
    return this.findAll({ electionId: electionId.toString() });
  }

  findAll(query: { electionId?: string }) {
    return this.prisma.finalizedTally.findMany({
      where: {
        onchainElectionId: toOptionalBigInt(query.electionId),
      },
      orderBy: [{ onchainElectionId: 'asc' }, { candidateKey: 'asc' }],
    });
  }

  findOne(id: bigint) {
    return this.prisma.finalizedTally.findUnique({ where: { id } });
  }

  upsert(data: UpsertFinalizedTallyDto) {
    const electionId = BigInt(data.electionId);
    return this.prisma.finalizedTally.upsert({
      where: {
        onchainElectionId_candidateKey: {
          onchainElectionId: electionId,
          candidateKey: data.candidateKey,
        },
      },
      create: {
        onchainElectionId: electionId,
        candidateKey: data.candidateKey,
        count: data.count,
        voteRatio: data.voteRatio,
        finalizedAt: new Date(data.finalizedAt),
      },
      update: {
        count: data.count,
        voteRatio: data.voteRatio,
        finalizedAt: new Date(data.finalizedAt),
      },
    });
  }
}
