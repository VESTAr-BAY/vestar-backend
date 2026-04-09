import { Injectable } from '@nestjs/common';
import { VerifiedOrganizerStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

type CreateVerifiedOrganizerDto = {
  walletAddress: string;
  status: VerifiedOrganizerStatus;
  organizationName: string;
  contactEmail?: string | null;
  organizationLogoUrl?: string | null;
  rejectionReason?: string | null;
  verifiedBy?: bigint | null;
  verifiedAt?: Date | string | null;
};

type UpdateVerifiedOrganizerDto = Partial<CreateVerifiedOrganizerDto>;

@Injectable()
export class VerifiedOrganizersService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(status?: VerifiedOrganizerStatus) {
    return this.prisma.verifiedOrganizer.findMany({
      where: status ? { status } : undefined,
      orderBy: { id: 'asc' },
    });
  }

  findOne(id: bigint) {
    return this.prisma.verifiedOrganizer.findUnique({ where: { id } });
  }

  findByWallet(walletAddress: string) {
    return this.prisma.verifiedOrganizer.findFirst({
      where: {
        walletAddress: {
          equals: walletAddress,
          mode: 'insensitive',
        },
        status: VerifiedOrganizerStatus.VERIFIED,
      },
    });
  }

  findRequestStatusByWallet(walletAddress: string) {
    return this.prisma.verifiedOrganizer.findFirst({
      where: {
        walletAddress: {
          equals: walletAddress,
          mode: 'insensitive',
        },
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async requestVerification(data: {
    walletAddress: string;
    organizationName: string;
    contactEmail?: string | null;
  }) {
    const existing = await this.prisma.verifiedOrganizer.findFirst({
      where: {
        walletAddress: {
          equals: data.walletAddress,
          mode: 'insensitive',
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    if (!existing) {
      return this.prisma.verifiedOrganizer.create({
        data: {
          walletAddress: data.walletAddress,
          status: VerifiedOrganizerStatus.PENDING,
          organizationName: data.organizationName,
          contactEmail: data.contactEmail ?? null,
          organizationLogoUrl: null,
          rejectionReason: null,
          verifiedBy: null,
          verifiedAt: null,
        },
      });
    }

    return this.prisma.verifiedOrganizer.update({
      where: { id: existing.id },
      data: {
        walletAddress: data.walletAddress,
        status: VerifiedOrganizerStatus.PENDING,
        organizationName: data.organizationName,
        contactEmail: data.contactEmail ?? null,
        rejectionReason: null,
        verifiedBy: null,
        verifiedAt: null,
      },
    });
  }

  approve(id: bigint, params?: { verifiedBy?: bigint | null }) {
    return this.prisma.verifiedOrganizer.update({
      where: { id },
      data: {
        status: VerifiedOrganizerStatus.VERIFIED,
        rejectionReason: null,
        verifiedBy: params?.verifiedBy ?? null,
        verifiedAt: new Date(),
      },
    });
  }

  reject(id: bigint, params?: { rejectionReason?: string | null; verifiedBy?: bigint | null }) {
    return this.prisma.verifiedOrganizer.update({
      where: { id },
      data: {
        status: VerifiedOrganizerStatus.REJECTED,
        rejectionReason: params?.rejectionReason ?? null,
        verifiedBy: params?.verifiedBy ?? null,
        verifiedAt: null,
      },
    });
  }

  create(data: CreateVerifiedOrganizerDto) {
    return this.prisma.verifiedOrganizer.create({
      data: {
        ...data,
        verifiedAt: data.verifiedAt ? new Date(data.verifiedAt) : undefined,
      },
    });
  }

  update(id: bigint, data: UpdateVerifiedOrganizerDto) {
    return this.prisma.verifiedOrganizer.update({
      where: { id },
      data: {
        ...data,
        verifiedAt:
          data.verifiedAt === undefined ? undefined : data.verifiedAt ? new Date(data.verifiedAt) : null,
      },
    });
  }
}
