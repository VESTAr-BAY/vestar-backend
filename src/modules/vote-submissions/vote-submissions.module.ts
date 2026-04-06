import { Module } from '@nestjs/common';
import { LiveTallyModule } from '../live-tally/live-tally.module';
import { PrivateBallotProcessorService } from './private-ballot-processor.service';
import { VoteSubmissionsController } from './vote-submissions.controller';
import { VoteSubmissionsService } from './vote-submissions.service';

@Module({
  imports: [LiveTallyModule],
  controllers: [VoteSubmissionsController],
  providers: [VoteSubmissionsService, PrivateBallotProcessorService],
  exports: [VoteSubmissionsService, PrivateBallotProcessorService],
})
export class VoteSubmissionsModule {}
