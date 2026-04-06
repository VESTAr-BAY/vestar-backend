import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import {
  BallotPolicy,
  PaymentMode,
  PrivateElectionState,
  VisibilityMode,
} from '@prisma/client';
import { ParseBigIntPipe } from '../../common/pipes/parse-bigint.pipe';
import { ElectionsService } from './elections.service';

@Controller('elections')
export class ElectionsController {
  constructor(private readonly electionsService: ElectionsService) {}

  @Get()
  findAll(
    @Query('groupId') groupId?: string,
    @Query('state') state?: PrivateElectionState,
    @Query('visibilityMode') visibilityMode?: VisibilityMode,
  ) {
    return this.electionsService.findAll({ groupId, state, visibilityMode });
  }

  @Get(':id')
  findOne(@Param('id', ParseBigIntPipe) id: bigint) {
    return this.electionsService.findOne(id);
  }

  @Post()
  create(
    @Body()
    body: {
      groupId: string;
      onchainElectionId?: string | null;
      onchainElectionAddress?: string | null;
      title: string;
      candidateManifestPreimage: unknown;
      organizerWalletAddress: string;
      organizerVerifiedSnapshot?: boolean;
      visibilityMode: VisibilityMode;
      paymentMode: PaymentMode;
      ballotPolicy: BallotPolicy;
      startAt: string;
      endAt: string;
      resultRevealAt: string;
      minKarmaTier: number;
      resetIntervalSeconds: number;
      allowMultipleChoice: boolean;
      maxSelectionsPerSubmission: number;
      timezoneWindowOffset: number;
      paymentToken?: string | null;
      costPerBallot: string;
      state: PrivateElectionState;
    },
  ) {
    return this.electionsService.create(body);
  }

  @Patch(':id')
  update(
    @Param('id', ParseBigIntPipe) id: bigint,
    @Body()
    body: Partial<{
      groupId: string;
      onchainElectionId?: string | null;
      onchainElectionAddress?: string | null;
      title: string;
      candidateManifestPreimage: unknown;
      organizerWalletAddress: string;
      organizerVerifiedSnapshot?: boolean;
      visibilityMode: VisibilityMode;
      paymentMode: PaymentMode;
      ballotPolicy: BallotPolicy;
      startAt: string;
      endAt: string;
      resultRevealAt: string;
      minKarmaTier: number;
      resetIntervalSeconds: number;
      allowMultipleChoice: boolean;
      maxSelectionsPerSubmission: number;
      timezoneWindowOffset: number;
      paymentToken?: string | null;
      costPerBallot: string;
      state: PrivateElectionState;
    }>,
  ) {
    return this.electionsService.update(id, body);
  }
}
