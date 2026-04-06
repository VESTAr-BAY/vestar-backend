import { Injectable } from '@nestjs/common';
import { toOptionalBigInt } from '../../common/utils/query.utils';
import { PrismaService } from '../../prisma/prisma.service';

type UpsertResultSummaryDto = {
  electionId: string | bigint;
  totalSubmissions: number;
  totalDecryptedBallots: number;
  totalValidVotes: number;
  totalInvalidVotes: number;
};

@Injectable()
export class ResultSummariesService {
  constructor(private readonly prisma: PrismaService) {}

  async recomputeForElection(electionIdInput: string | bigint) {
    const electionId = BigInt(electionIdInput);
    const [totalSubmissions, decryptedBallots] = await Promise.all([
      this.prisma.voteSubmission.count({
        where: { electionId },
      }),
      this.prisma.decryptedBallot.findMany({
        where: {
          voteSubmission: { electionId },
        },
        select: { isValid: true },
      }),
    ]);

    const totalDecryptedBallots = decryptedBallots.length;
    const totalValidVotes = decryptedBallots.filter((ballot) => ballot.isValid).length;
    const totalInvalidVotes = totalDecryptedBallots - totalValidVotes;

    return this.upsert({
      electionId,
      totalSubmissions,
      totalDecryptedBallots,
      totalValidVotes,
      totalInvalidVotes,
    });
  }

  findAll(query: { electionId?: string }) {
    return this.prisma.resultSummary.findMany({
      where: {
        electionId: toOptionalBigInt(query.electionId),
      },
      orderBy: { id: 'asc' },
    });
  }

  findOne(id: bigint) {
    return this.prisma.resultSummary.findUnique({ where: { id } });
  }

  upsert(data: UpsertResultSummaryDto) {
    const electionId = BigInt(data.electionId);
    return this.prisma.resultSummary.upsert({
      where: { electionId },
      create: {
        electionId,
        totalSubmissions: data.totalSubmissions,
        totalDecryptedBallots: data.totalDecryptedBallots,
        totalValidVotes: data.totalValidVotes,
        totalInvalidVotes: data.totalInvalidVotes,
      },
      update: {
        totalSubmissions: data.totalSubmissions,
        totalDecryptedBallots: data.totalDecryptedBallots,
        totalValidVotes: data.totalValidVotes,
        totalInvalidVotes: data.totalInvalidVotes,
      },
    });
  }
}
