import { Injectable } from '@nestjs/common';
import { PrivateElectionState } from '@prisma/client';
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
    const [candidates, validBallots] = await Promise.all([
      this.prisma.electionCandidate.findMany({
        where: { electionId },
        orderBy: { displayOrder: 'asc' },
        select: { candidateKey: true },
      }),
      this.prisma.decryptedBallot.findMany({
        where: {
          isValid: true,
          voteSubmission: { electionId },
        },
        select: { candidateKeys: true },
      }),
    ]);

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
      await tx.finalizedTally.deleteMany({ where: { electionId } });

      if (counts.size > 0) {
        await tx.finalizedTally.createMany({
          data: Array.from(counts.entries()).map(([candidateKey, count]) => ({
            electionId,
            candidateKey,
            count,
            voteRatio: totalValidVotes === 0 ? 0 : count / totalValidVotes,
            finalizedAt,
          })),
        });
      }

      await tx.election.update({
        where: { id: electionId },
        data: { state: PrivateElectionState.FINALIZED },
      });
    });

    await this.resultSummariesService.recomputeForElection(electionId);
    return this.findAll({ electionId: electionId.toString() });
  }

  findAll(query: { electionId?: string }) {
    return this.prisma.finalizedTally.findMany({
      where: {
        electionId: toOptionalBigInt(query.electionId),
      },
      orderBy: [{ electionId: 'asc' }, { candidateKey: 'asc' }],
    });
  }

  findOne(id: bigint) {
    return this.prisma.finalizedTally.findUnique({ where: { id } });
  }

  upsert(data: UpsertFinalizedTallyDto) {
    const electionId = BigInt(data.electionId);
    return this.prisma.finalizedTally.upsert({
      where: {
        electionId_candidateKey: {
          electionId,
          candidateKey: data.candidateKey,
        },
      },
      create: {
        electionId,
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
