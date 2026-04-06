import { Injectable } from '@nestjs/common';
import { toOptionalBigInt } from '../../common/utils/query.utils';
import { PrismaService } from '../../prisma/prisma.service';

type CreateElectionKeyDto = {
  electionId?: string | bigint | null;
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
      include: { election: true },
    });
  }

  findByCommitmentHash(privateKeyCommitmentHash: string) {
    return this.prisma.electionKey.findUnique({
      where: { privateKeyCommitmentHash },
      include: { election: true },
    });
  }

  create(data: CreateElectionKeyDto) {
    return this.prisma.electionKey.create({
      data: {
        ...data,
        electionId: toOptionalBigInt(
          data.electionId === null ? undefined : String(data.electionId ?? ''),
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
        electionId:
          data.electionId === undefined
            ? undefined
            : data.electionId
              ? BigInt(data.electionId)
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

