import { Module } from '@nestjs/common';
import { FinalizedTallyController } from './finalized-tally.controller';
import { FinalizedTallyService } from './finalized-tally.service';
import { ResultSummariesModule } from '../result-summaries/result-summaries.module';

@Module({
  imports: [ResultSummariesModule],
  controllers: [FinalizedTallyController],
  providers: [FinalizedTallyService],
  exports: [FinalizedTallyService],
})
export class FinalizedTallyModule {}
