import { Module } from '@nestjs/common';
import { FinalizedTallyModule } from '../finalized-tally/finalized-tally.module';
import { VoteSubmissionsModule } from '../vote-submissions/vote-submissions.module';
import { ElectionIndexerService } from './services/election-indexer.service';

@Module({
  imports: [VoteSubmissionsModule, FinalizedTallyModule],
  providers: [ElectionIndexerService],
})
export class IndexerModule {}
