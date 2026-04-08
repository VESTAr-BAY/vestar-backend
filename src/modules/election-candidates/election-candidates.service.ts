import { Injectable } from '@nestjs/common';
import { toOptionalBigInt } from '../../common/utils/query.utils';
import { PrismaService } from '../../prisma/prisma.service';

type CreateElectionCandidateDto = {
  draftId?: string | bigint;
  electionId?: string | bigint;
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
        draftId: toOptionalBigInt(query.electionId),
      },
      orderBy: [{ draftId: 'asc' }, { displayOrder: 'asc' }],
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
        draftId: BigInt(data.draftId ?? data.electionId!),
        candidateKey: data.candidateKey,
        displayOrder: data.displayOrder,
      },
    });
  }

  update(id: bigint, data: UpdateElectionCandidateDto) {
    return this.prisma.electionCandidate.update({
      where: { id },
      data: {
        draftId:
          data.draftId === undefined && data.electionId === undefined
            ? undefined
            : BigInt(data.draftId ?? data.electionId!),
        candidateKey: data.candidateKey,
        displayOrder: data.displayOrder,
      },
    });
  }
}
