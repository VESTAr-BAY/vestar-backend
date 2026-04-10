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
  paymentAmount?: string;
};

type UpdateVoteSubmissionDto = Partial<CreateVoteSubmissionDto>;

type SubmissionElectionSelect = {
  id: true;
  onchainElectionId: true;
  onchainElectionAddress: true;
  onchainState: true;
  draft: {
    select: {
      id: true;
      title: true;
      series: {
        select: {
          id: true;
          seriesPreimage: true;
        };
      };
    };
  };
};

const submissionElectionSelect: SubmissionElectionSelect = {
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
};

@Injectable()
export class VoteSubmissionsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(query: { electionId?: string; voterAddress?: string }) {
    return this.prisma.privateVoteSubmission.findMany({
      where: {
        electionRefId: toOptionalBigInt(query.electionId),
        voterAddress: query.voterAddress,
      },
      include: {
        onchainElection: {
          select: submissionElectionSelect,
        },
        decryptedBallot: true,
        invalidBallots: true,
      },
      orderBy: [{ blockNumber: 'desc' }, { id: 'desc' }],
    });
  }

  async findHistory(voterAddress: string) {
    const normalizedAddress = voterAddress.toLowerCase();

    const [privateSubmissions, openSubmissions] = await Promise.all([
      this.prisma.privateVoteSubmission.findMany({
        where: {
          voterAddress: normalizedAddress,
        },
        include: {
          onchainElection: {
            select: submissionElectionSelect,
          },
          decryptedBallot: true,
          invalidBallots: true,
        },
        orderBy: [{ blockNumber: 'desc' }, { id: 'desc' }],
      }),
      this.prisma.openVoteSubmission.findMany({
        where: {
          voterAddress: normalizedAddress,
        },
        include: {
          onchainElection: {
            select: submissionElectionSelect,
          },
        },
        orderBy: [{ blockNumber: 'desc' }, { id: 'desc' }],
      }),
    ]);

    return [
      ...privateSubmissions.map((submission) => ({
        id: submission.id.toString(),
        type: 'PRIVATE' as const,
        onchainTxHash: submission.onchainTxHash,
        voterAddress: submission.voterAddress,
        blockNumber: submission.blockNumber,
        blockTimestamp: submission.blockTimestamp,
        paymentAmount: submission.paymentAmount,
        onchainElection: submission.onchainElection
          ? {
              id: submission.onchainElection.id.toString(),
              onchainElectionId: submission.onchainElection.onchainElectionId,
              onchainElectionAddress:
                submission.onchainElection.onchainElectionAddress,
              onchainState: submission.onchainElection.onchainState,
              draft: submission.onchainElection.draft
                ? {
                    id: submission.onchainElection.draft.id.toString(),
                    title: submission.onchainElection.draft.title,
                    series: submission.onchainElection.draft.series
                      ? {
                          id: submission.onchainElection.draft.series.id.toString(),
                          seriesPreimage:
                            submission.onchainElection.draft.series.seriesPreimage,
                        }
                      : null,
                  }
                : null,
            }
          : null,
        selection: {
          candidateKeys: submission.decryptedBallot?.candidateKeys ?? [],
          isPending: !submission.decryptedBallot,
          isValid: submission.decryptedBallot?.isValid ?? null,
        },
      })),
      ...openSubmissions.map((submission) => ({
        id: submission.id.toString(),
        type: 'OPEN' as const,
        onchainTxHash: submission.onchainTxHash,
        voterAddress: submission.voterAddress,
        blockNumber: submission.blockNumber,
        blockTimestamp: submission.blockTimestamp,
        paymentAmount: submission.paymentAmount,
        onchainElection: submission.onchainElection
          ? {
              id: submission.onchainElection.id.toString(),
              onchainElectionId: submission.onchainElection.onchainElectionId,
              onchainElectionAddress:
                submission.onchainElection.onchainElectionAddress,
              onchainState: submission.onchainElection.onchainState,
              draft: submission.onchainElection.draft
                ? {
                    id: submission.onchainElection.draft.id.toString(),
                    title: submission.onchainElection.draft.title,
                    series: submission.onchainElection.draft.series
                      ? {
                          id: submission.onchainElection.draft.series.id.toString(),
                          seriesPreimage:
                            submission.onchainElection.draft.series.seriesPreimage,
                        }
                      : null,
                  }
                : null,
            }
          : null,
        selection: {
          candidateKeys: Array.isArray(submission.candidateKeys)
            ? submission.candidateKeys.filter(
                (candidateKey): candidateKey is string =>
                  typeof candidateKey === 'string',
              )
            : [],
          isPending: false,
          isValid: true,
        },
      })),
    ].sort((a, b) => {
      const timestampDelta =
        new Date(b.blockTimestamp).getTime() - new Date(a.blockTimestamp).getTime();

      if (timestampDelta !== 0) {
        return timestampDelta;
      }

      return b.blockNumber - a.blockNumber;
    });
  }

  findOne(id: bigint) {
    return this.prisma.privateVoteSubmission.findUnique({
      where: { id },
      include: {
        onchainElection: {
          select: submissionElectionSelect,
        },
        decryptedBallot: true,
        invalidBallots: true,
      },
    });
  }

  findByTxHash(onchainTxHash: string) {
    return this.prisma.privateVoteSubmission.findUnique({
      where: { onchainTxHash: onchainTxHash.toLowerCase() },
      include: {
        onchainElection: {
          select: submissionElectionSelect,
        },
        decryptedBallot: true,
        invalidBallots: true,
      },
    });
  }

  create(data: CreateVoteSubmissionDto) {
    return this.prisma.privateVoteSubmission.create({
      data: {
        electionRefId: BigInt(data.electionId),
        onchainTxHash: data.onchainTxHash.toLowerCase(),
        voterAddress: data.voterAddress,
        blockNumber: data.blockNumber,
        blockTimestamp: new Date(data.blockTimestamp),
        encryptedBallot: data.encryptedBallot,
        paymentAmount: data.paymentAmount ?? '0',
      },
    });
  }

  update(id: bigint, data: UpdateVoteSubmissionDto) {
    return this.prisma.privateVoteSubmission.update({
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
        paymentAmount: data.paymentAmount,
      },
    });
  }
}
