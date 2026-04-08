import { Injectable } from '@nestjs/common';
import { toOptionalBigInt } from '../../common/utils/query.utils';
import { PrismaService } from '../../prisma/prisma.service';

type CreateVoteSubmissionDto = {
  electionId: string | bigint;
  onchainTxHash: string;
  voterAddress: string;
  blockNumber: number;
  blockTimestamp: string | Date;
  encryptedBallot: string;
};

type UpdateVoteSubmissionDto = Partial<CreateVoteSubmissionDto>;

@Injectable()
export class VoteSubmissionsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(query: { electionId?: string; voterAddress?: string }) {
    return this.prisma.voteSubmission.findMany({
      where: {
        electionRefId: toOptionalBigInt(query.electionId),
        voterAddress: query.voterAddress,
      },
      orderBy: [{ blockNumber: 'desc' }, { id: 'desc' }],
    });
  }

  findOne(id: bigint) {
    return this.prisma.voteSubmission.findUnique({
      where: { id },
      include: {
        onchainElection: {
          select: {
            id: true,
            onchainElectionId: true,
            onchainElectionAddress: true,
            onchainState: true,
            draft: {
              select: {
                id: true,
                title: true,
                series: {
                  select: {
                    id: true,
                    seriesPreimage: true,
                  },
                },
              },
            },
          },
        },
        decryptedBallot: true,
        invalidBallots: true,
      },
    });
  }

  findByTxHash(onchainTxHash: string) {
    return this.prisma.voteSubmission.findUnique({
      where: { onchainTxHash: onchainTxHash.toLowerCase() },
      include: {
        onchainElection: {
          select: {
            id: true,
            onchainElectionId: true,
            onchainElectionAddress: true,
            onchainState: true,
            draft: {
              select: {
                id: true,
                title: true,
                series: {
                  select: {
                    id: true,
                    seriesPreimage: true,
                  },
                },
              },
            },
          },
        },
        decryptedBallot: true,
        invalidBallots: true,
      },
    });
  }

  create(data: CreateVoteSubmissionDto) {
    return this.prisma.voteSubmission.create({
      data: {
        electionRefId: BigInt(data.electionId),
        onchainTxHash: data.onchainTxHash.toLowerCase(),
        voterAddress: data.voterAddress,
        blockNumber: data.blockNumber,
        blockTimestamp: new Date(data.blockTimestamp),
        encryptedBallot: data.encryptedBallot,
      },
    });
  }

  update(id: bigint, data: UpdateVoteSubmissionDto) {
    return this.prisma.voteSubmission.update({
      where: { id },
      data: {
        electionRefId:
          data.electionId === undefined ? undefined : BigInt(data.electionId),
        onchainTxHash: data.onchainTxHash?.toLowerCase(),
        voterAddress: data.voterAddress,
        blockNumber: data.blockNumber,
        blockTimestamp: data.blockTimestamp
          ? new Date(data.blockTimestamp)
          : undefined,
        encryptedBallot: data.encryptedBallot,
      },
    });
  }
}
