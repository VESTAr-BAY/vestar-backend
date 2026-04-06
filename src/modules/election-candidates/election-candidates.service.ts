import { Injectable } from '@nestjs/common';
import { toOptionalBigInt } from '../../common/utils/query.utils';
import { PrismaService } from '../../prisma/prisma.service';

type CreateElectionCandidateDto = {
  electionId: string | bigint;
  candidateKey: string;
  displayOrder: number;
};

type UpdateElectionCandidateDto = Partial<CreateElectionCandidateDto>;

@Injectable()
export class ElectionCandidatesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(query: { electionId?: string }) {
    return this.prisma.electionCandidate.findMany({
      where: {
        electionId: toOptionalBigInt(query.electionId),
      },
      orderBy: [{ electionId: 'asc' }, { displayOrder: 'asc' }],
    });
  }

  findOne(id: bigint) {
    return this.prisma.electionCandidate.findUnique({
      where: { id },
    });
  }

  create(data: CreateElectionCandidateDto) {
    return this.prisma.electionCandidate.create({
      data: {
        electionId: BigInt(data.electionId),
        candidateKey: data.candidateKey,
        displayOrder: data.displayOrder,
      },
    });
  }

  update(id: bigint, data: UpdateElectionCandidateDto) {
    return this.prisma.electionCandidate.update({
      where: { id },
      data: {
        electionId:
          data.electionId === undefined ? undefined : BigInt(data.electionId),
        candidateKey: data.candidateKey,
        displayOrder: data.displayOrder,
      },
    });
  }
}

