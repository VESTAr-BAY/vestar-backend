import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ParseBigIntPipe } from '../../common/pipes/parse-bigint.pipe';
import { ResultSummariesService } from './result-summaries.service';

@Controller('result-summaries')
export class ResultSummariesController {
  constructor(
    private readonly resultSummariesService: ResultSummariesService,
  ) {}

  @Get()
  findAll(@Query('electionId') electionId?: string) {
    return this.resultSummariesService.findAll({ electionId });
  }

  @Get(':id')
  findOne(@Param('id', ParseBigIntPipe) id: bigint) {
    return this.resultSummariesService.findOne(id);
  }

  @Post('upsert')
  upsert(
    @Body()
    body: {
      electionId: string;
      totalSubmissions: number;
      totalDecryptedBallots: number;
      totalValidVotes: number;
      totalInvalidVotes: number;
    },
  ) {
    return this.resultSummariesService.upsert(body);
  }
}

