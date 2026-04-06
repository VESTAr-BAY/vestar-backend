import { Module } from '@nestjs/common';
import { VerifiedOrganizersController } from './verified-organizers.controller';
import { VerifiedOrganizersService } from './verified-organizers.service';

@Module({
  controllers: [VerifiedOrganizersController],
  providers: [VerifiedOrganizersService],
})
export class VerifiedOrganizersModule {}

