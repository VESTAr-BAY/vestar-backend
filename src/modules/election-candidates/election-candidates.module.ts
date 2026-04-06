import { Module } from '@nestjs/common';
import { ElectionCandidatesController } from './election-candidates.controller';
import { ElectionCandidatesService } from './election-candidates.service';

@Module({
  controllers: [ElectionCandidatesController],
  providers: [ElectionCandidatesService],
})
export class ElectionCandidatesModule {}

