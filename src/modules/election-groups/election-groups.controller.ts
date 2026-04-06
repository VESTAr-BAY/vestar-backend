import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ParseBigIntPipe } from '../../common/pipes/parse-bigint.pipe';
import { ElectionGroupsService } from './election-groups.service';

@Controller('election-groups')
export class ElectionGroupsController {
  constructor(private readonly electionGroupsService: ElectionGroupsService) {}

  @Get()
  findAll() {
    return this.electionGroupsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseBigIntPipe) id: bigint) {
    return this.electionGroupsService.findOne(id);
  }

  @Post()
  create(@Body() body: { groupKey: string; onchainSeriesId?: string | null }) {
    return this.electionGroupsService.create(body);
  }

  @Patch(':id')
  update(
    @Param('id', ParseBigIntPipe) id: bigint,
    @Body() body: Partial<{ groupKey: string; onchainSeriesId?: string | null }>,
  ) {
    return this.electionGroupsService.update(id, body);
  }
}
