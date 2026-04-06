import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ParseBigIntPipe } from '../../common/pipes/parse-bigint.pipe';
import { InvalidBallotsService } from './invalid-ballots.service';

@Controller('invalid-ballots')
export class InvalidBallotsController {
  constructor(private readonly invalidBallotsService: InvalidBallotsService) {}

  @Get()
  findAll(
    @Query('voteSubmissionId') voteSubmissionId?: string,
    @Query('reasonCode') reasonCode?: string,
  ) {
    return this.invalidBallotsService.findAll({ voteSubmissionId, reasonCode });
  }

  @Get(':id')
  findOne(@Param('id', ParseBigIntPipe) id: bigint) {
    return this.invalidBallotsService.findOne(id);
  }

  @Post()
  create(
    @Body()
    body: {
      voteSubmissionId: string;
      reasonCode: string;
      reasonDetail?: string | null;
    },
  ) {
    return this.invalidBallotsService.create(body);
  }

  @Patch(':id')
  update(
    @Param('id', ParseBigIntPipe) id: bigint,
    @Body()
    body: Partial<{
      voteSubmissionId: string;
      reasonCode: string;
      reasonDetail?: string | null;
    }>,
  ) {
    return this.invalidBallotsService.update(id, body);
  }
}

