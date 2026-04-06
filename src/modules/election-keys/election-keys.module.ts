import { Module } from '@nestjs/common';
import { ElectionKeysController } from './election-keys.controller';
import { ElectionKeysService } from './election-keys.service';

@Module({
  controllers: [ElectionKeysController],
  providers: [ElectionKeysService],
})
export class ElectionKeysModule {}

