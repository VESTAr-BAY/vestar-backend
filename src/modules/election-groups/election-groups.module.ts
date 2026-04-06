import { Module } from '@nestjs/common';
import { ElectionGroupsController } from './election-groups.controller';
import { ElectionGroupsService } from './election-groups.service';

@Module({
  controllers: [ElectionGroupsController],
  providers: [ElectionGroupsService],
})
export class ElectionGroupsModule {}

