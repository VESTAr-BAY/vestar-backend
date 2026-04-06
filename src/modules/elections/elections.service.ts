import {
  BallotPolicy,
  PaymentMode,
  PrivateElectionState,
  Prisma,
  VisibilityMode,
} from '@prisma/client';
import { Injectable } from '@nestjs/common';
import { toOptionalBigInt } from '../../common/utils/query.utils';
import { PrismaService } from '../../prisma/prisma.service';

type CreateElectionDto = {
  groupId: string | bigint;
  onchainElectionId?: string | null;
  onchainElectionAddress?: string | null;
  title: string;
  candidateManifestPreimage: unknown;
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
  state: PrivateElectionState;
};

type UpdateElectionDto = Partial<CreateElectionDto>;

@Injectable()
export class ElectionsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(query: {
    groupId?: string;
    state?: PrivateElectionState;
    visibilityMode?: VisibilityMode;
  }) {
    return this.prisma.election.findMany({
      where: {
        groupId: toOptionalBigInt(query.groupId),
        state: query.state,
        visibilityMode: query.visibilityMode,
      },
      orderBy: { id: 'asc' },
    });
  }

  findOne(id: bigint) {
    return this.prisma.election.findUnique({
      where: { id },
      include: {
        group: true,
        electionKey: true,
        electionCandidates: true,
        resultSummary: true,
      },
    });
  }

  create(data: CreateElectionDto) {
    const createInput: Prisma.ElectionUncheckedCreateInput = {
      groupId: BigInt(data.groupId),
      onchainElectionId: data.onchainElectionId ?? null,
      onchainElectionAddress: data.onchainElectionAddress ?? null,
      title: data.title,
      candidateManifestPreimage:
        data.candidateManifestPreimage as Prisma.InputJsonValue,
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
      state: data.state,
    };

    return this.prisma.election.create({
      data: createInput,
    });
  }

  update(id: bigint, data: UpdateElectionDto) {
    const updateInput: Prisma.ElectionUncheckedUpdateInput = {
      groupId:
        data.groupId === undefined
          ? undefined
          : BigInt(data.groupId),
      onchainElectionId: data.onchainElectionId,
      onchainElectionAddress: data.onchainElectionAddress,
      title: data.title,
      candidateManifestPreimage:
        data.candidateManifestPreimage === undefined
          ? undefined
          : (data.candidateManifestPreimage as Prisma.InputJsonValue),
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
      state: data.state,
    };

    return this.prisma.election.update({
      where: { id },
      data: updateInput,
    });
  }
}
