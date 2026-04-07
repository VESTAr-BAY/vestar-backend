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
      seriesKey: string;
      seriesCoverImageUrl?: string | null;
      title: string;
      coverImageUrl?: string | null;
      candidateManifestPreimage: {
        candidates: Array<{
          candidateKey: string;
          displayOrder: number;
          imageUrl?: string | null;
        }>;
      };
    },
  ) {
    return this.privateElectionsService.prepare(body);
  }
}
