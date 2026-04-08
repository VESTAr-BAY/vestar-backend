import { Module } from '@nestjs/common';
import { StateSyncWorkerService } from './state-sync-worker.service';

@Module({
  providers: [StateSyncWorkerService],
})
export class StateSyncWorkerModule {}
