import { Injectable } from '@nestjs/common';
import { toOptionalBigInt } from '../../common/utils/query.utils';
import { PrismaService } from '../../prisma/prisma.service';

type UpsertLiveTallyDto = {
  electionId: string | bigint;
  candidateKey: string;
  count: number;
};

@Injectable()
export class LiveTallyService {
  constructor(private readonly prisma: PrismaService) {}

  async recomputeForElection(electionIdInput: string | bigint) {
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

    await this.prisma.$transaction(async (tx) => {
      await tx.liveTally.deleteMany({ where: { electionId } });

      if (counts.size === 0) {
        return;
      }

      await tx.liveTally.createMany({
        data: Array.from(counts.entries()).map(([candidateKey, count]) => ({
          electionId,
          candidateKey,
          count,
        })),
      });
    });

    return this.findAll({ electionId: electionId.toString() });
  }

  findAll(query: { electionId?: string }) {
    return this.prisma.liveTally.findMany({
      where: {
        electionId: toOptionalBigInt(query.electionId),
      },
      orderBy: [{ electionId: 'asc' }, { candidateKey: 'asc' }],
    });
  }

  findOne(id: bigint) {
    return this.prisma.liveTally.findUnique({ where: { id } });
  }

  upsert(data: UpsertLiveTallyDto) {
    const electionId = BigInt(data.electionId);
    return this.prisma.liveTally.upsert({
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
      },
      update: {
        count: data.count,
      },
    });
  }
}
