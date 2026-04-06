import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ParseBigIntPipe } from '../../common/pipes/parse-bigint.pipe';
import { ElectionCandidatesService } from './election-candidates.service';

@Controller('election-candidates')
export class ElectionCandidatesController {
  constructor(
    private readonly electionCandidatesService: ElectionCandidatesService,
  ) {}

  @Get()
  findAll(@Query('electionId') electionId?: string) {
    return this.electionCandidatesService.findAll({ electionId });
  }

  @Get(':id')
  findOne(@Param('id', ParseBigIntPipe) id: bigint) {
    return this.electionCandidatesService.findOne(id);
  }

  @Post()
  create(
    @Body() body: { electionId: string; candidateKey: string; displayOrder: number },
  ) {
    return this.electionCandidatesService.create(body);
  }

  @Patch(':id')
  update(
    @Param('id', ParseBigIntPipe) id: bigint,
    @Body()
    body: Partial<{
      electionId: string;
      candidateKey: string;
      displayOrder: number;
    }>,
  ) {
    return this.electionCandidatesService.update(id, body);
  }
}

