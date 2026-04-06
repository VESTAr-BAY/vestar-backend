import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

type CreateElectionGroupDto = {
  groupKey: string;
  onchainSeriesId?: string | null;
};

@Injectable()
export class ElectionGroupsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.electionGroup.findMany({
      orderBy: { id: 'asc' },
    });
  }

  findOne(id: bigint) {
    return this.prisma.electionGroup.findUnique({
      where: { id },
      include: { elections: true },
    });
  }

  create(data: CreateElectionGroupDto) {
    return this.prisma.electionGroup.create({ data });
  }

  update(id: bigint, data: Partial<CreateElectionGroupDto>) {
    return this.prisma.electionGroup.update({
      where: { id },
      data,
    });
  }
}
