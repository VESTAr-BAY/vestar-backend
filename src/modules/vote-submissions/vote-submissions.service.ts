import { Injectable } from '@nestjs/common';
import { toOptionalBigInt } from '../../common/utils/query.utils';
import { PrismaService } from '../../prisma/prisma.service';

const DEFAULT_HISTORY_PAGE_SIZE = 20;
const MAX_HISTORY_PAGE_SIZE = 100;

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
  candidateManifestUri: true;
  candidateManifestHash: true;
  draft: {
    select: {
      id: true;
    };
  };
};

const submissionElectionSelect: SubmissionElectionSelect = {
  id: true,
  onchainElectionId: true,
  onchainElectionAddress: true,
  onchainState: true,
  candidateManifestUri: true,
  candidateManifestHash: true,
  draft: {
    select: {
      id: true,
    },
  },
};

type HistoryCursor = {
  cursorTimestamp: string | null;
  cursorBlockNumber: number | null;
  cursorId: string | null;
};

type HistorySubmissionItem = {
  id: string;
  type: 'PRIVATE' | 'OPEN';
  onchainTxHash: string;
  voterAddress: string;
  blockNumber: number;
  blockTimestamp: Date;
  paymentAmount: string | null;
  onchainElection: {
    id: string;
    onchainElectionId: string;
    onchainElectionAddress: string | null;
    onchainState: string;
    candidateManifestUri: string | null;
    candidateManifestHash: string | null;
    draft: {
      id: string;
    } | null;
  } | null;
  selection: {
    candidateKeys: string[];
    isPending: boolean;
    isValid: boolean | null;
    invalidReason: {
      reasonCode: string;
      reasonDetail: string | null;
    } | null;
  };
};

function normalizeHistoryLimit(limit?: string) {
  const parsed = Number(limit ?? DEFAULT_HISTORY_PAGE_SIZE);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_HISTORY_PAGE_SIZE;
  }

  return Math.min(Math.floor(parsed), MAX_HISTORY_PAGE_SIZE);
}

function buildHistoryCursorFilter(cursor?: {
  cursorTimestamp?: string;
  cursorBlockNumber?: string;
  cursorId?: string;
}) {
  if (!cursor?.cursorTimestamp || !cursor?.cursorBlockNumber || !cursor?.cursorId) {
    return undefined;
  }

  const timestamp = new Date(cursor.cursorTimestamp);
  const blockNumber = Number(cursor.cursorBlockNumber);
  const id = BigInt(cursor.cursorId);

  if (Number.isNaN(timestamp.getTime()) || !Number.isFinite(blockNumber)) {
    return undefined;
  }

  return {
    OR: [
      { blockTimestamp: { lt: timestamp } },
      {
        blockTimestamp: timestamp,
        blockNumber: { lt: blockNumber },
      },
      {
        blockTimestamp: timestamp,
        blockNumber,
        id: { lt: id },
      },
    ],
  };
}

function compareHistoryItems(a: HistorySubmissionItem, b: HistorySubmissionItem) {
  const timestampDelta = b.blockTimestamp.getTime() - a.blockTimestamp.getTime();

  if (timestampDelta !== 0) {
    return timestampDelta;
  }

  const blockDelta = b.blockNumber - a.blockNumber;
  if (blockDelta !== 0) {
    return blockDelta;
  }

  return Number(BigInt(b.id) - BigInt(a.id));
}

function normalizeCandidateKeys(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter(
        (candidateKey): candidateKey is string => typeof candidateKey === 'string',
      )
    : [];
}

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

  async findHistory(
    voterAddress: string,
    options?: {
      limit?: string;
      cursorTimestamp?: string;
      cursorBlockNumber?: string;
      cursorId?: string;
    },
  ) {
    const normalizedAddress = voterAddress.toLowerCase();
    const pageSize = normalizeHistoryLimit(options?.limit);
    const cursorFilter = buildHistoryCursorFilter(options);
    const baseWhere = {
      voterAddress: normalizedAddress,
      ...(cursorFilter ?? {}),
    };

    const [privateSubmissions, openSubmissions] = await Promise.all([
      this.prisma.privateVoteSubmission.findMany({
        where: baseWhere,
        include: {
          onchainElection: {
            select: submissionElectionSelect,
          },
          decryptedBallot: true,
          invalidBallots: true,
        },
        orderBy: [{ blockTimestamp: 'desc' }, { blockNumber: 'desc' }, { id: 'desc' }],
        take: pageSize + 1,
      }),
      this.prisma.openVoteSubmission.findMany({
        where: baseWhere,
        include: {
          onchainElection: {
            select: submissionElectionSelect,
          },
        },
        orderBy: [{ blockTimestamp: 'desc' }, { blockNumber: 'desc' }, { id: 'desc' }],
        take: pageSize + 1,
      }),
    ]);

    const merged: HistorySubmissionItem[] = [
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
              candidateManifestUri:
                submission.onchainElection.candidateManifestUri,
              candidateManifestHash:
                submission.onchainElection.candidateManifestHash,
              draft: submission.onchainElection.draft
                ? {
                    id: submission.onchainElection.draft.id.toString(),
                  }
                : null,
            }
          : null,
        selection: {
          candidateKeys: normalizeCandidateKeys(
            submission.decryptedBallot?.candidateKeys,
          ),
          isPending: !submission.decryptedBallot,
          isValid: submission.decryptedBallot?.isValid ?? null,
          invalidReason: submission.invalidBallots[0]
            ? {
                reasonCode: submission.invalidBallots[0].reasonCode,
                reasonDetail: submission.invalidBallots[0].reasonDetail,
              }
            : null,
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
              candidateManifestUri:
                submission.onchainElection.candidateManifestUri,
              candidateManifestHash:
                submission.onchainElection.candidateManifestHash,
              draft: submission.onchainElection.draft
                ? {
                    id: submission.onchainElection.draft.id.toString(),
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
          invalidReason: null,
        },
      })),
    ].sort(compareHistoryItems);

    const sliced = merged.slice(0, pageSize);
    const lastItem = sliced[sliced.length - 1];

    return {
      items: sliced,
      nextCursor: lastItem
        ? {
            cursorTimestamp: lastItem.blockTimestamp.toISOString(),
            cursorBlockNumber: lastItem.blockNumber,
            cursorId: lastItem.id,
          }
        : null,
      hasMore: merged.length > pageSize,
    };
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
