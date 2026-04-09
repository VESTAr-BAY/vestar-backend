import {
  BallotPolicy,
  ElectionSyncState,
  OnchainElectionState,
  PaymentMode,
  Prisma,
  VisibilityMode,
} from '@prisma/client';
import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { createDecipheriv, createHash } from 'node:crypto';
import { toOptionalBigInt } from '../../common/utils/query.utils';
import { PrismaService } from '../../prisma/prisma.service';

type CreateElectionDto = {
  draftId?: string | bigint | null;
  onchainSeriesId?: string | null;
  onchainElectionId: string;
  onchainElectionAddress: string;
  organizerWalletAddress: string;
  organizerVerifiedSnapshot?: boolean;
  visibilityMode: VisibilityMode;
  paymentMode: PaymentMode;
  ballotPolicy: BallotPolicy;
  startAt: string | Date;
  endAt: string | Date;
  resultRevealAt: string | Date;
  minKarmaTier: number;
  resetIntervalSeconds: number;
  allowMultipleChoice: boolean;
  maxSelectionsPerSubmission: number;
  timezoneWindowOffset: number;
  paymentToken?: string | null;
  costPerBallot: string;
  onchainState: OnchainElectionState;
};

type UpdateElectionDto = Partial<CreateElectionDto>;

@Injectable()
export class ElectionsService {
  constructor(private readonly prisma: PrismaService) {}

  private async loadVerifiedOrganizerMap(walletAddresses: string[]) {
    if (walletAddresses.length === 0) {
      return new Map<string, { organizationName: string }>();
    }

    const verifiedOrganizers = await this.prisma.verifiedOrganizer.findMany({
      where: {
        status: 'VERIFIED',
      },
      select: {
        walletAddress: true,
        organizationName: true,
      },
    });

    const targetAddresses = new Set(walletAddresses.map((walletAddress) => walletAddress.toLowerCase()));
    const map = new Map<string, { organizationName: string }>();

    for (const organizer of verifiedOrganizers) {
      const key = organizer.walletAddress.toLowerCase();
      if (!targetAddresses.has(key)) {
        continue;
      }

      map.set(key, {
        organizationName: organizer.organizationName,
      });
    }

    return map;
  }

  private serializeElectionMetadata(onchainElection: any, organizerMeta?: { organizationName: string } | null) {
    if (!onchainElection) {
      return onchainElection;
    }

    const draft = onchainElection.draft;

    return {
      id: onchainElection.id,
      draftId: onchainElection.draftId,
      onchainSeriesId: onchainElection.onchainSeriesId,
      onchainElectionId: onchainElection.onchainElectionId,
      onchainElectionAddress: onchainElection.onchainElectionAddress,
      candidateManifestHash: onchainElection.candidateManifestHash ?? null,
      candidateManifestUri: onchainElection.candidateManifestUri ?? null,
      organizer: organizerMeta
        ? {
            walletAddress: onchainElection.organizerWalletAddress,
            organizationName: organizerMeta.organizationName,
          }
        : null,
      title: draft?.title ?? null,
      coverImageUrl: draft?.coverImageUrl ?? null,
      series: draft?.series ?? null,
      electionKey: draft?.electionKey
        ? {
            publicKey: draft.electionKey.publicKey,
          }
        : null,
      electionCandidates: draft?.electionCandidates ?? [],
    };
  }

  private serializeOnchainElection(onchainElection: any, organizerMeta?: { organizationName: string } | null) {
    if (!onchainElection) {
      return onchainElection;
    }

    const draft = onchainElection.draft;

    const validDecryptedBallotCount = Array.isArray(onchainElection.voteSubmissions)
      ? onchainElection.voteSubmissions.reduce(
          (count: number, submission: any) =>
            submission.decryptedBallot?.isValid ? count + 1 : count,
          0,
        )
      : 0;

    return {
      id: onchainElection.id,
      draftId: onchainElection.draftId,
      onchainSeriesId: onchainElection.onchainSeriesId,
      onchainElectionId: onchainElection.onchainElectionId,
      onchainElectionAddress: onchainElection.onchainElectionAddress,
      candidateManifestHash: onchainElection.candidateManifestHash ?? null,
      candidateManifestUri: onchainElection.candidateManifestUri ?? null,
      organizerWalletAddress: onchainElection.organizerWalletAddress,
      organizerVerifiedSnapshot: onchainElection.organizerVerifiedSnapshot,
      organizer: organizerMeta
        ? {
            walletAddress: onchainElection.organizerWalletAddress,
            organizationName: organizerMeta.organizationName,
          }
        : null,
      visibilityMode: onchainElection.visibilityMode,
      paymentMode: onchainElection.paymentMode,
      ballotPolicy: onchainElection.ballotPolicy,
      startAt: onchainElection.startAt,
      endAt: onchainElection.endAt,
      resultRevealAt: onchainElection.resultRevealAt,
      minKarmaTier: onchainElection.minKarmaTier,
      resetIntervalSeconds: onchainElection.resetIntervalSeconds,
      allowMultipleChoice: onchainElection.allowMultipleChoice,
      maxSelectionsPerSubmission: onchainElection.maxSelectionsPerSubmission,
      timezoneWindowOffset: onchainElection.timezoneWindowOffset,
      paymentToken: onchainElection.paymentToken,
      costPerBallot: onchainElection.costPerBallot,
      onchainState: onchainElection.onchainState,
      title: draft?.title ?? null,
      coverImageUrl: draft?.coverImageUrl ?? null,
      syncState: draft?.syncState ?? null,
      series: draft?.series ?? null,
      electionKey: draft?.electionKey ?? null,
      electionCandidates: draft?.electionCandidates ?? [],
      validDecryptedBallotCount,
      resultSummary: onchainElection.resultSummary ?? null,
    };
  }

  async findAll(query: {
    seriesId?: string;
    onchainElectionId?: string;
    onchainElectionAddress?: string;
    organizerWalletAddress?: string;
    syncState?: ElectionSyncState;
    onchainState?: OnchainElectionState;
    visibilityMode?: VisibilityMode;
    sortBy?: 'LATEST' | 'HOT';
  }) {
    const elections = await this.prisma.onchainElection.findMany({
      where: {
        onchainElectionId: query.onchainElectionId,
        onchainElectionAddress: query.onchainElectionAddress,
        ...(query.organizerWalletAddress
          ? {
              organizerWalletAddress: {
                equals: query.organizerWalletAddress,
                mode: 'insensitive',
              },
            }
          : {}),
        onchainState: query.onchainState,
        visibilityMode: query.visibilityMode,
        ...(query.syncState || query.seriesId
          ? {
              draft: {
                ...(query.seriesId
                  ? { seriesId: toOptionalBigInt(query.seriesId) }
                  : {}),
                ...(query.syncState ? { syncState: query.syncState } : {}),
              },
            }
          : {}),
      },
      orderBy: { id: 'desc' },
      include: {
        draft: {
          include: {
            series: true,
            electionKey: true,
            electionCandidates: {
              orderBy: { displayOrder: 'asc' },
            },
          },
        },
        voteSubmissions: {
          select: {
            decryptedBallot: {
              select: {
                isValid: true,
              },
            },
          },
        },
        resultSummary: true,
      },
    });

    if (query.sortBy === 'HOT') {
      elections.sort((left, right) => {
        const submissionDiff =
          (right.resultSummary?.totalSubmissions ?? 0) -
          (left.resultSummary?.totalSubmissions ?? 0);

        if (submissionDiff !== 0) {
          return submissionDiff;
        }

        return Number(right.id - left.id);
      });
    }

    const organizerMap = await this.loadVerifiedOrganizerMap(
      elections.map((election) => election.organizerWalletAddress),
    );

    return elections.map((election) =>
      this.serializeOnchainElection(
        election,
        organizerMap.get(election.organizerWalletAddress.toLowerCase()) ?? null,
      ),
    );
  }

  async findMetadata(query: {
    seriesId?: string;
    onchainElectionId?: string;
    onchainElectionAddress?: string;
    organizerWalletAddress?: string;
    syncState?: ElectionSyncState;
    visibilityMode?: VisibilityMode;
  }) {
    const elections = await this.prisma.onchainElection.findMany({
      where: {
        onchainElectionId: query.onchainElectionId,
        onchainElectionAddress: query.onchainElectionAddress,
        ...(query.organizerWalletAddress
          ? {
              organizerWalletAddress: {
                equals: query.organizerWalletAddress,
                mode: 'insensitive',
              },
            }
          : {}),
        visibilityMode: query.visibilityMode,
        ...(query.syncState || query.seriesId
          ? {
              draft: {
                ...(query.seriesId
                  ? { seriesId: toOptionalBigInt(query.seriesId) }
                  : {}),
                ...(query.syncState ? { syncState: query.syncState } : {}),
              },
            }
          : {}),
      },
      orderBy: { id: 'asc' },
      include: {
        draft: {
          include: {
            series: true,
            electionKey: {
              select: {
                publicKey: true,
              },
            },
            electionCandidates: {
              orderBy: { displayOrder: 'asc' },
            },
          },
        },
      },
    });

    const organizerMap = await this.loadVerifiedOrganizerMap(
      elections.map((election) => election.organizerWalletAddress),
    );

    return elections.map((election) =>
      this.serializeElectionMetadata(
        election,
        organizerMap.get(election.organizerWalletAddress.toLowerCase()) ?? null,
      ),
    );
  }

  async findOne(id: bigint) {
    const election = await this.prisma.onchainElection.findUnique({
      where: { id },
      include: {
        draft: {
          include: {
            series: true,
            electionKey: true,
            electionCandidates: true,
          },
        },
        voteSubmissions: {
          select: {
            decryptedBallot: {
              select: {
                isValid: true,
              },
            },
          },
        },
        resultSummary: true,
      },
    });

    if (!election) {
      return election;
    }

    const organizerMap = await this.loadVerifiedOrganizerMap([election.organizerWalletAddress]);
    return this.serializeOnchainElection(
      election,
      organizerMap.get(election.organizerWalletAddress.toLowerCase()) ?? null,
    );
  }

  async getRevealedPrivateKeyByOnchainElectionId(onchainElectionId: string) {
    const election = await this.prisma.onchainElection.findUnique({
      where: { onchainElectionId },
      include: {
        draft: {
          include: {
            electionKey: true,
          },
        },
      },
    });

    if (!election) {
      throw new NotFoundException('Election not found');
    }

    if (!election.draft?.electionKey) {
      throw new NotFoundException('Election key not found');
    }

    if (new Date() < election.resultRevealAt) {
      throw new ForbiddenException('Private key is not revealed yet');
    }

    const privateKey = this.decryptPrivateKey(
      election.draft.electionKey.privateKeyEncrypted,
    );

    return {
      onchainElectionId: election.onchainElectionId,
      onchainElectionAddress: election.onchainElectionAddress,
      resultRevealAt: election.resultRevealAt,
      privateKey,
      privateKeyCommitmentHash:
        election.draft.electionKey.privateKeyCommitmentHash,
    };
  }

  create(data: CreateElectionDto) {
    const createInput: Prisma.OnchainElectionUncheckedCreateInput = {
      draftId:
        data.draftId === undefined || data.draftId === null
          ? null
          : BigInt(data.draftId),
      onchainSeriesId: data.onchainSeriesId ?? null,
      onchainElectionId: data.onchainElectionId,
      onchainElectionAddress: data.onchainElectionAddress,
      organizerWalletAddress: data.organizerWalletAddress,
      organizerVerifiedSnapshot: data.organizerVerifiedSnapshot ?? false,
      visibilityMode: data.visibilityMode,
      paymentMode: data.paymentMode,
      ballotPolicy: data.ballotPolicy,
      startAt: new Date(data.startAt),
      endAt: new Date(data.endAt),
      resultRevealAt: new Date(data.resultRevealAt),
      minKarmaTier: data.minKarmaTier,
      resetIntervalSeconds: data.resetIntervalSeconds,
      allowMultipleChoice: data.allowMultipleChoice,
      maxSelectionsPerSubmission: data.maxSelectionsPerSubmission,
      timezoneWindowOffset: data.timezoneWindowOffset,
      paymentToken: data.paymentToken ?? null,
      costPerBallot: data.costPerBallot,
      onchainState: data.onchainState,
    };

    return this.prisma.onchainElection.create({
      data: createInput,
    });
  }

  update(id: bigint, data: UpdateElectionDto) {
    const updateInput: Prisma.OnchainElectionUncheckedUpdateInput = {
      draftId:
        data.draftId === undefined
          ? undefined
          : data.draftId === null
            ? null
            : BigInt(data.draftId),
      onchainSeriesId:
        data.onchainSeriesId === undefined ? undefined : data.onchainSeriesId,
      onchainElectionId: data.onchainElectionId,
      onchainElectionAddress: data.onchainElectionAddress,
      organizerWalletAddress: data.organizerWalletAddress,
      organizerVerifiedSnapshot: data.organizerVerifiedSnapshot,
      visibilityMode: data.visibilityMode,
      paymentMode: data.paymentMode,
      ballotPolicy: data.ballotPolicy,
      startAt: data.startAt ? new Date(data.startAt) : undefined,
      endAt: data.endAt ? new Date(data.endAt) : undefined,
      resultRevealAt: data.resultRevealAt
        ? new Date(data.resultRevealAt)
        : undefined,
      minKarmaTier: data.minKarmaTier,
      resetIntervalSeconds: data.resetIntervalSeconds,
      allowMultipleChoice: data.allowMultipleChoice,
      maxSelectionsPerSubmission: data.maxSelectionsPerSubmission,
      timezoneWindowOffset: data.timezoneWindowOffset,
      paymentToken: data.paymentToken,
      costPerBallot: data.costPerBallot,
      onchainState: data.onchainState,
    };

    return this.prisma.onchainElection.update({
      where: { id },
      data: updateInput,
    });
  }

  private decryptPrivateKey(privateKeyEncrypted: string) {
    const secret = process.env.PRIVATE_KEY_ENCRYPTION_SECRET;

    if (!secret) {
      throw new Error('PRIVATE_KEY_ENCRYPTION_SECRET is required');
    }

    const envelope = JSON.parse(privateKeyEncrypted) as {
      algorithm: string;
      iv: string;
      authTag: string;
      ciphertext: string;
    };

    if (envelope.algorithm !== 'aes-256-gcm') {
      throw new Error(
        `Unsupported private key envelope algorithm ${envelope.algorithm}`,
      );
    }

    const key = createHash('sha256').update(secret).digest();
    const decipher = createDecipheriv(
      'aes-256-gcm',
      key,
      Buffer.from(envelope.iv, 'base64'),
    );
    decipher.setAuthTag(Buffer.from(envelope.authTag, 'base64'));

    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(envelope.ciphertext, 'base64')),
      decipher.final(),
    ]);

    return decrypted.toString('utf8');
  }
}
