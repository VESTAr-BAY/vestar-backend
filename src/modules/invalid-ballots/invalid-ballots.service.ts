import { Injectable } from '@nestjs/common';
import { toOptionalBigInt } from '../../common/utils/query.utils';
import { PrismaService } from '../../prisma/prisma.service';

type CreateInvalidBallotDto = {
  voteSubmissionId: string | bigint;
  reasonCode: string;
  reasonDetail?: string | null;
};

type UpdateInvalidBallotDto = Partial<CreateInvalidBallotDto>;

@Injectable()
export class InvalidBallotsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(query: { voteSubmissionId?: string; reasonCode?: string }) {
    return this.prisma.invalidBallot.findMany({
      where: {
        voteSubmissionId: toOptionalBigInt(query.voteSubmissionId),
        reasonCode: query.reasonCode,
      },
      orderBy: { id: 'desc' },
    });
  }

  findOne(id: bigint) {
    return this.prisma.invalidBallot.findUnique({
      where: { id },
      include: { voteSubmission: true },
    });
  }

  create(data: CreateInvalidBallotDto) {
    return this.prisma.invalidBallot.create({
      data: {
        voteSubmissionId: BigInt(data.voteSubmissionId),
        reasonCode: data.reasonCode,
        reasonDetail: data.reasonDetail ?? null,
      },
    });
  }

  update(id: bigint, data: UpdateInvalidBallotDto) {
    return this.prisma.invalidBallot.update({
      where: { id },
      data: {
        voteSubmissionId:
          data.voteSubmissionId === undefined
            ? undefined
            : BigInt(data.voteSubmissionId),
        reasonCode: data.reasonCode,
        reasonDetail: data.reasonDetail,
      },
    });
  }
}

