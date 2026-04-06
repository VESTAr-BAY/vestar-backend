import { Module } from '@nestjs/common';
import { DecryptedBallotsController } from './decrypted-ballots.controller';
import { DecryptedBallotsService } from './decrypted-ballots.service';

@Module({
  controllers: [DecryptedBallotsController],
  providers: [DecryptedBallotsService],
})
export class DecryptedBallotsModule {}

