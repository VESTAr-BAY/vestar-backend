import { Injectable } from '@nestjs/common';
import { VerifiedOrganizerStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

type CreateVerifiedOrganizerDto = {
  walletAddress: string;
  status: VerifiedOrganizerStatus;
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

