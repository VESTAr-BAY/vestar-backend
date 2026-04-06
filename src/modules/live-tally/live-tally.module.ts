import { Module } from '@nestjs/common';
import { LiveTallyController } from './live-tally.controller';
import { LiveTallyService } from './live-tally.service';

@Module({
  controllers: [LiveTallyController],
  providers: [LiveTallyService],
  exports: [LiveTallyService],
})
export class LiveTallyModule {}
