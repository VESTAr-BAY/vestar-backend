import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

type CreateElectionGroupDto = {
  seriesKey: string;
  onchainSeriesId?: string | null;
};

@Injectable()
export class ElectionGroupsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.electionSeries.findMany({
      orderBy: { id: 'asc' },
    });
  }

  findOne(id: bigint) {
    return this.prisma.electionSeries.findUnique({
      where: { id },
      include: { electionDrafts: true },
    });
  }

  create(data: CreateElectionGroupDto) {
    return this.prisma.electionSeries.create({ data });
  }

  update(id: bigint, data: Partial<CreateElectionGroupDto>) {
    return this.prisma.electionSeries.update({
      where: { id },
      data,
    });
  }
}
