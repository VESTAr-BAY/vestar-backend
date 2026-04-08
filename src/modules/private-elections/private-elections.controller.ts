import { Body, Controller, Post, UsePipes } from '@nestjs/common';
import { PreparePrivateElectionDto } from './dto/prepare-private-election.dto';
import { PreparePrivateElectionPipe } from './pipes/prepare-private-election.pipe';
import { PrivateElectionsService } from './private-elections.service';

@Controller('private-elections')
export class PrivateElectionsController {
  constructor(
    private readonly privateElectionsService: PrivateElectionsService,
  ) {}

  @Post('prepare')
  @UsePipes(PreparePrivateElectionPipe)
  prepare(
    @Body() body: PreparePrivateElectionDto,
  ) {
    return this.privateElectionsService.prepare(body);
  }
}
