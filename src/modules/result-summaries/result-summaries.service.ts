import { Injectable } from '@nestjs/common';
import { VisibilityMode } from '@prisma/client';
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
    const onchainElection = await this.prisma.onchainElection.findUnique({
      where: { id: electionId },
      select: { visibilityMode: true },
    });

    let totalSubmissions = 0;
    let totalDecryptedBallots = 0;
    let totalValidVotes = 0;
    let totalInvalidVotes = 0;

    if (onchainElection?.visibilityMode === VisibilityMode.OPEN) {
      totalSubmissions = await this.prisma.openVoteSubmission.count({
        where: { electionRefId: electionId },
      });
      totalDecryptedBallots = 0;
      totalValidVotes = totalSubmissions;
      totalInvalidVotes = 0;
    } else {
      const [privateTotalSubmissions, decryptedBallots] = await Promise.all([
        this.prisma.privateVoteSubmission.count({
          where: { electionRefId: electionId },
        }),
        this.prisma.decryptedBallot.findMany({
          where: {
            privateVoteSubmission: { electionRefId: electionId },
          },
          select: { isValid: true },
        }),
      ]);

      totalSubmissions = privateTotalSubmissions;
      totalDecryptedBallots = decryptedBallots.length;
      totalValidVotes = decryptedBallots.filter((ballot) => ballot.isValid).length;
      totalInvalidVotes = totalDecryptedBallots - totalValidVotes;
    }

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
        electionRefId: toOptionalBigInt(query.electionId),
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
      where: { electionRefId: electionId },
      create: {
        electionRefId: electionId,
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
