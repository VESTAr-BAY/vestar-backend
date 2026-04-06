import { Module } from '@nestjs/common';
import { InvalidBallotsController } from './invalid-ballots.controller';
import { InvalidBallotsService } from './invalid-ballots.service';

@Module({
  controllers: [InvalidBallotsController],
  providers: [InvalidBallotsService],
})
export class InvalidBallotsModule {}

