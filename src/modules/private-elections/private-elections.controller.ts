import { Body, Controller, Post } from '@nestjs/common';
import { PrivateElectionsService } from './private-elections.service';

@Controller('private-elections')
export class PrivateElectionsController {
  constructor(
    private readonly privateElectionsService: PrivateElectionsService,
  ) {}

  @Post('prepare')
  prepare(
    @Body()
    body: {
      groupKey: string;
      title: string;
      candidateManifestPreimage: {
        candidates: Array<{
          candidateKey: string;
          displayOrder: number;
        }>;
      };
    },
  ) {
    return this.privateElectionsService.prepare(body);
  }
}
