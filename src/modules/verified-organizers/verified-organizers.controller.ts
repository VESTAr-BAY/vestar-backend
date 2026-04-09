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

  @Get('request-status')
  findRequestStatusByWallet(@Query('walletAddress') walletAddress?: string) {
    if (!walletAddress) {
      return null;
    }

    return this.verifiedOrganizersService.findRequestStatusByWallet(walletAddress);
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
      contactEmail?: string | null;
      organizationLogoUrl?: string | null;
      rejectionReason?: string | null;
      verifiedBy?: bigint | null;
      verifiedAt?: string | null;
    },
  ) {
    return this.verifiedOrganizersService.create(body);
  }

  @Post('request')
  request(
    @Body()
    body: {
      walletAddress: string;
      organizationName: string;
      contactEmail?: string | null;
    },
  ) {
    return this.verifiedOrganizersService.requestVerification(body);
  }

  @Patch(':id')
  update(
    @Param('id', ParseBigIntPipe) id: bigint,
    @Body()
    body: Partial<{
      walletAddress: string;
      status: VerifiedOrganizerStatus;
      organizationName: string;
      contactEmail?: string | null;
      organizationLogoUrl?: string | null;
      rejectionReason?: string | null;
      verifiedBy?: bigint | null;
      verifiedAt?: string | null;
    }>,
  ) {
    return this.verifiedOrganizersService.update(id, body);
  }

  @Patch(':id/approve')
  approve(
    @Param('id', ParseBigIntPipe) id: bigint,
    @Body()
    body?: {
      verifiedBy?: bigint | null;
    },
  ) {
    return this.verifiedOrganizersService.approve(id, body);
  }

  @Patch(':id/reject')
  reject(
    @Param('id', ParseBigIntPipe) id: bigint,
    @Body()
    body?: {
      verifiedBy?: bigint | null;
      rejectionReason?: string | null;
    },
  ) {
    return this.verifiedOrganizersService.reject(id, body);
  }
}
