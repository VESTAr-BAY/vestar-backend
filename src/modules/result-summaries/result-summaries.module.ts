import { Module } from '@nestjs/common';
import { ResultSummariesController } from './result-summaries.controller';
import { ResultSummariesService } from './result-summaries.service';

@Module({
  controllers: [ResultSummariesController],
  providers: [ResultSummariesService],
  exports: [ResultSummariesService],
})
export class ResultSummariesModule {}
