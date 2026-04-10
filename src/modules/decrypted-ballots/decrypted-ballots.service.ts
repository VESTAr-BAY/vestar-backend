import { Injectable } from '@nestjs/common';
import { toOptionalBigInt } from '../../common/utils/query.utils';
import { PrismaService } from '../../prisma/prisma.service';

type CreateDecryptedBallotDto = {
  voteSubmissionId: string | bigint;
  candidateKeys: unknown;
  nonce: string;
  isValid: boolean;
  validatedAt?: string | Date | null;
};

type UpdateDecryptedBallotDto = Partial<CreateDecryptedBallotDto>;

@Injectable()
export class DecryptedBallotsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(query: { voteSubmissionId?: string; isValid?: string }) {
    return this.prisma.decryptedBallot.findMany({
      where: {
        privateVoteSubmissionId: toOptionalBigInt(query.voteSubmissionId),
        isValid:
          query.isValid === undefined ? undefined : query.isValid === 'true',
      },
      orderBy: { id: 'desc' },
    });
  }

  findOne(id: bigint) {
    return this.prisma.decryptedBallot.findUnique({
      where: { id },
      include: { privateVoteSubmission: true },
    });
  }

  create(data: CreateDecryptedBallotDto) {
    return this.prisma.decryptedBallot.create({
      data: {
        privateVoteSubmissionId: BigInt(data.voteSubmissionId),
        candidateKeys: data.candidateKeys as never,
        nonce: data.nonce,
        isValid: data.isValid,
        validatedAt: data.validatedAt ? new Date(data.validatedAt) : null,
      },
    });
  }

  update(id: bigint, data: UpdateDecryptedBallotDto) {
    return this.prisma.decryptedBallot.update({
      where: { id },
      data: {
        privateVoteSubmissionId:
          data.voteSubmissionId === undefined
            ? undefined
            : BigInt(data.voteSubmissionId),
        candidateKeys:
          data.candidateKeys === undefined
            ? undefined
            : (data.candidateKeys as never),
        nonce: data.nonce,
        isValid: data.isValid,
        validatedAt:
          data.validatedAt === undefined
            ? undefined
            : data.validatedAt
              ? new Date(data.validatedAt)
              : null,
      },
    });
  }
}
