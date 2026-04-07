import { Injectable } from '@nestjs/common';
import { toOptionalBigInt } from '../../common/utils/query.utils';
import { PrismaService } from '../../prisma/prisma.service';

type CreateElectionKeyDto = {
  draftId?: string | bigint | null;
  publicKey: string;
  privateKeyCommitmentHash: string;
  privateKeyEncrypted: string;
  isRevealed?: boolean;
  revealedAt?: string | Date | null;
};

type UpdateElectionKeyDto = Partial<CreateElectionKeyDto>;

@Injectable()
export class ElectionKeysService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.electionKey.findMany({
      orderBy: { id: 'asc' },
    });
  }

  findOne(id: bigint) {
    return this.prisma.electionKey.findUnique({
      where: { id },
      include: { draft: true },
    });
  }

  findByCommitmentHash(privateKeyCommitmentHash: string) {
    return this.prisma.electionKey.findUnique({
      where: { privateKeyCommitmentHash },
      include: { draft: true },
    });
  }

  create(data: CreateElectionKeyDto) {
    return this.prisma.electionKey.create({
      data: {
        ...data,
        draftId: toOptionalBigInt(
          data.draftId === null ? undefined : String(data.draftId ?? ''),
        ) ?? null,
        isRevealed: data.isRevealed ?? false,
        revealedAt: data.revealedAt ? new Date(data.revealedAt) : null,
      },
    });
  }

  update(id: bigint, data: UpdateElectionKeyDto) {
    return this.prisma.electionKey.update({
      where: { id },
      data: {
        ...data,
        draftId:
          data.draftId === undefined
            ? undefined
            : data.draftId
              ? BigInt(data.draftId)
              : null,
        revealedAt:
          data.revealedAt === undefined
            ? undefined
            : data.revealedAt
              ? new Date(data.revealedAt)
              : null,
      },
    });
  }
}
