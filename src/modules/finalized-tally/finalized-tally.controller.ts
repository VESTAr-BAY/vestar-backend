import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ParseBigIntPipe } from '../../common/pipes/parse-bigint.pipe';
import { FinalizedTallyService } from './finalized-tally.service';

@Controller('finalized-tally')
export class FinalizedTallyController {
  constructor(private readonly finalizedTallyService: FinalizedTallyService) {}

  @Get()
  findAll(@Query('electionId') electionId?: string) {
    return this.finalizedTallyService.findAll({ electionId });
  }

  @Get(':id')
  findOne(@Param('id', ParseBigIntPipe) id: bigint) {
    return this.finalizedTallyService.findOne(id);
  }

  @Post('upsert')
  upsert(
    @Body()
    body: {
      electionId: string;
      candidateKey: string;
      count: number;
      voteRatio: number;
      finalizedAt: string;
    },
  ) {
    return this.finalizedTallyService.upsert(body);
  }
}

