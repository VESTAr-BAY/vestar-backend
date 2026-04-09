import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { VerifiedOrganizerStatus } from '@prisma/client';
import { ParseBigIntPipe } from '../../common/pipes/parse-bigint.pipe';
import { VerifiedOrganizersService } from './verified-organizers.service';

@Controller('verified-organizers')
export class VerifiedOrganizersController {
  constructor(
    private readonly verifiedOrganizersService: VerifiedOrganizersService,
  ) {}

  @Get()
  findAll(@Query('status') status?: VerifiedOrganizerStatus) {
    return this.verifiedOrganizersService.findAll(status);
  }

  @Get('by-wallet')
  findByWallet(@Query('walletAddress') walletAddress?: string) {
    if (!walletAddress) {
      return null;
    }

    return this.verifiedOrganizersService.findByWallet(walletAddress);
  }

  @Get(':id')
  findOne(@Param('id', ParseBigIntPipe) id: bigint) {
    return this.verifiedOrganizersService.findOne(id);
  }

  @Post()
  create(
    @Body()
    body: {
      walletAddress: string;
      status: VerifiedOrganizerStatus;
      organizationName: string;
      organizationLogoUrl?: string | null;
      rejectionReason?: string | null;
      verifiedBy?: bigint | null;
      verifiedAt?: string | null;
    },
  ) {
    return this.verifiedOrganizersService.create(body);
  }

  @Patch(':id')
  update(
    @Param('id', ParseBigIntPipe) id: bigint,
    @Body()
    body: Partial<{
      walletAddress: string;
      status: VerifiedOrganizerStatus;
      organizationName: string;
      organizationLogoUrl?: string | null;
      rejectionReason?: string | null;
      verifiedBy?: bigint | null;
      verifiedAt?: string | null;
    }>,
  ) {
    return this.verifiedOrganizersService.update(id, body);
  }
}
