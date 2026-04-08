import { Module } from '@nestjs/common';
import { LiveTallyController } from './live-tally.controller';
import { LiveTallyService } from './live-tally.service';
import { ResultSummariesModule } from '../result-summaries/result-summaries.module';

@Module({
  imports: [ResultSummariesModule],
  controllers: [LiveTallyController],
  providers: [LiveTallyService],
  exports: [LiveTallyService],
})
export class LiveTallyModule {}
