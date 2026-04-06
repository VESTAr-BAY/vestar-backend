import { Module } from '@nestjs/common';
import { PrivateElectionsController } from './private-elections.controller';
import { PrivateElectionsService } from './private-elections.service';

@Module({
  controllers: [PrivateElectionsController],
  providers: [PrivateElectionsService],
})
export class PrivateElectionsModule {}

