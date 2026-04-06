import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ParseBigIntPipe } from '../../common/pipes/parse-bigint.pipe';
import { LiveTallyService } from './live-tally.service';

@Controller('live-tally')
export class LiveTallyController {
  constructor(private readonly liveTallyService: LiveTallyService) {}

  @Get()
  findAll(@Query('electionId') electionId?: string) {
    return this.liveTallyService.findAll({ electionId });
  }

  @Get(':id')
  findOne(@Param('id', ParseBigIntPipe) id: bigint) {
    return this.liveTallyService.findOne(id);
  }

  @Post('upsert')
  upsert(
    @Body() body: { electionId: string; candidateKey: string; count: number },
  ) {
    return this.liveTallyService.upsert(body);
  }
}

