import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AdminUsersModule } from './modules/admin-users/admin-users.module';
import { DecryptedBallotsModule } from './modules/decrypted-ballots/decrypted-ballots.module';
import { ElectionKeysModule } from './modules/election-keys/election-keys.module';
import { ElectionsModule } from './modules/elections/elections.module';
import { FinalizedTallyModule } from './modules/finalized-tally/finalized-tally.module';
import { IndexerModule } from './modules/indexer/indexer.module';
import { InvalidBallotsModule } from './modules/invalid-ballots/invalid-ballots.module';
import { KeyRevealWorkerModule } from './modules/key-reveal-worker/key-reveal-worker.module';
import { LiveTallyModule } from './modules/live-tally/live-tally.module';
import { PrivateElectionsModule } from './modules/private-elections/private-elections.module';
import { ResultSummariesModule } from './modules/result-summaries/result-summaries.module';
import { StateSyncWorkerModule } from './modules/state-sync-worker/state-sync-worker.module';
import { UploadsModule } from './modules/uploads/uploads.module';
import { VerifiedOrganizersModule } from './modules/verified-organizers/verified-organizers.module';
import { VoteSubmissionsModule } from './modules/vote-submissions/vote-submissions.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env'],
    }),
    PrismaModule,
    AdminUsersModule,
    VerifiedOrganizersModule,
    ElectionsModule,
    ElectionKeysModule,
    IndexerModule,
    VoteSubmissionsModule,
    DecryptedBallotsModule,
    InvalidBallotsModule,
    KeyRevealWorkerModule,
    LiveTallyModule,
    FinalizedTallyModule,
    ResultSummariesModule,
    StateSyncWorkerModule,
    PrivateElectionsModule,
    UploadsModule,
  ],
})
export class AppModule {}
