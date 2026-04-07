import { Module } from '@nestjs/common';
import { KeyRevealWorkerService } from './key-reveal-worker.service';

@Module({
  providers: [KeyRevealWorkerService],
})
export class KeyRevealWorkerModule {}
