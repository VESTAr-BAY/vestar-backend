import { Module } from '@nestjs/common';
import { AdminUsersModule } from './modules/admin-users/admin-users.module';
import { DecryptedBallotsModule } from './modules/decrypted-ballots/decrypted-ballots.module';
import { ElectionCandidatesModule } from './modules/election-candidates/election-candidates.module';
import { ElectionGroupsModule } from './modules/election-groups/election-groups.module';
import { ElectionKeysModule } from './modules/election-keys/election-keys.module';
import { ElectionsModule } from './modules/elections/elections.module';
import { FinalizedTallyModule } from './modules/finalized-tally/finalized-tally.module';
import { IndexerModule } from './modules/indexer/indexer.module';
import { InvalidBallotsModule } from './modules/invalid-ballots/invalid-ballots.module';
import { KeyRevealWorkerModule } from './modules/key-reveal-worker/key-reveal-worker.module';
import { LiveTallyModule } from './modules/live-tally/live-tally.module';
import { PrivateElectionsModule } from './modules/private-elections/private-elections.module';
import { ResultSummariesModule } from './modules/result-summaries/result-summaries.module';
import { UploadsModule } from './modules/uploads/uploads.module';
import { VerifiedOrganizersModule } from './modules/verified-organizers/verified-organizers.module';
import { VoteSubmissionsModule } from './modules/vote-submissions/vote-submissions.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    PrismaModule,
    AdminUsersModule,
    VerifiedOrganizersModule,
    ElectionGroupsModule,
    ElectionsModule,
    ElectionKeysModule,
    ElectionCandidatesModule,
    IndexerModule,
    VoteSubmissionsModule,
    DecryptedBallotsModule,
    InvalidBallotsModule,
    KeyRevealWorkerModule,
    LiveTallyModule,
    FinalizedTallyModule,
    ResultSummariesModule,
    PrivateElectionsModule,
    UploadsModule,
  ],
})
export class AppModule {}
