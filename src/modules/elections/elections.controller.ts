import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import {
  BallotPolicy,
  ElectionSyncState,
  OnchainElectionState,
  PaymentMode,
  VisibilityMode,
} from '@prisma/client';
import { ParseBigIntPipe } from '../../common/pipes/parse-bigint.pipe';
import { ElectionsService } from './elections.service';

@Controller('elections')
export class ElectionsController {
  constructor(private readonly electionsService: ElectionsService) {}

  @Get()
  findAll(
    @Query('seriesId') seriesId?: string,
    @Query('onchainElectionId') onchainElectionId?: string,
    @Query('onchainElectionAddress') onchainElectionAddress?: string,
    @Query('syncState') syncState?: ElectionSyncState,
    @Query('onchainState') onchainState?: OnchainElectionState,
    @Query('visibilityMode') visibilityMode?: VisibilityMode,
  ) {
    return this.electionsService.findAll({
      seriesId,
      onchainElectionId,
      onchainElectionAddress,
      syncState,
      onchainState,
      visibilityMode,
    });
  }

  @Get(':id')
  findOne(@Param('id', ParseBigIntPipe) id: bigint) {
    return this.electionsService.findOne(id);
  }

  @Post()
  create(
    @Body()
    body: {
      draftId?: string | null;
      onchainElectionId: string;
      onchainElectionAddress: string;
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
      onchainState: OnchainElectionState;
    },
  ) {
    return this.electionsService.create(body);
  }

  @Patch(':id')
  update(
    @Param('id', ParseBigIntPipe) id: bigint,
    @Body()
    body: Partial<{
      draftId?: string | null;
      onchainElectionId: string;
      onchainElectionAddress: string;
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
      onchainState: OnchainElectionState;
    }>,
  ) {
    return this.electionsService.update(id, body);
  }
}
