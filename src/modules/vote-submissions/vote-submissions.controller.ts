import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ParseBigIntPipe } from '../../common/pipes/parse-bigint.pipe';
import { PrivateBallotProcessorService } from './private-ballot-processor.service';
import { VoteSubmissionsService } from './vote-submissions.service';

@Controller('vote-submissions')
export class VoteSubmissionsController {
  constructor(
    private readonly voteSubmissionsService: VoteSubmissionsService,
    private readonly privateBallotProcessorService: PrivateBallotProcessorService,
  ) {}

  @Get()
  findAll(
    @Query('electionId') electionId?: string,
    @Query('voterAddress') voterAddress?: string,
  ) {
    return this.voteSubmissionsService.findAll({ electionId, voterAddress });
  }

  @Get(':id')
  findOne(@Param('id', ParseBigIntPipe) id: bigint) {
    return this.voteSubmissionsService.findOne(id);
  }

  @Post()
  create(
    @Body()
    body: {
      electionId: string;
      onchainTxHash: string;
      voterAddress: string;
      blockNumber: number;
      blockTimestamp: string;
      encryptedBallot: string;
    },
  ) {
    return this.voteSubmissionsService.create(body);
  }

  @Patch(':id')
  update(
    @Param('id', ParseBigIntPipe) id: bigint,
    @Body()
    body: Partial<{
      electionId: string;
      onchainTxHash: string;
      voterAddress: string;
      blockNumber: number;
      blockTimestamp: string;
      encryptedBallot: string;
    }>,
  ) {
    return this.voteSubmissionsService.update(id, body);
  }

  @Post(':id/process')
  processOne(@Param('id', ParseBigIntPipe) id: bigint) {
    return this.privateBallotProcessorService.processSubmission(id);
  }

  @Post('process-pending')
  processPending(
    @Body()
    body: {
      electionId?: string;
    },
  ) {
    return this.privateBallotProcessorService.processPendingSubmissions(
      body.electionId ? BigInt(body.electionId) : undefined,
    );
  }
}
