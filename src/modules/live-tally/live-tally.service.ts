import { Injectable } from '@nestjs/common';
import { VisibilityMode } from '@prisma/client';
import { toOptionalBigInt } from '../../common/utils/query.utils';
import { PrismaService } from '../../prisma/prisma.service';
import { ResultSummariesService } from '../result-summaries/result-summaries.service';

type UpsertLiveTallyDto = {
  electionId: string | bigint;
  candidateKey: string;
  count: number;
};

@Injectable()
export class LiveTallyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly resultSummariesService: ResultSummariesService,
  ) {}

  async recomputeForElection(electionIdInput: string | bigint) {
    const electionId = BigInt(electionIdInput);
    const onchainElection = await this.prisma.onchainElection.findUnique({
      where: { id: electionId },
      include: {
        draft: {
          include: {
            electionCandidates: {
              orderBy: { displayOrder: 'asc' },
            },
          },
        },
      },
    });

    const manifestCandidateKeys = await this.fetchManifestCandidateKeys(
      onchainElection?.candidateManifestUri ?? null,
    );
    const candidates = manifestCandidateKeys.length
      ? manifestCandidateKeys.map((candidateKey) => ({ candidateKey }))
      : (onchainElection?.draft?.electionCandidates ?? []);
    const counts = new Map<string, number>();
    for (const candidate of candidates) {
      counts.set(candidate.candidateKey, 0);
    }

    if (onchainElection?.visibilityMode === VisibilityMode.OPEN) {
      const openSubmissions = await this.prisma.openVoteSubmission.findMany({
        where: { electionRefId: electionId },
        select: { candidateKeys: true },
      });

      for (const submission of openSubmissions) {
        const candidateKeys = Array.isArray(submission.candidateKeys)
          ? submission.candidateKeys.filter(
              (candidateKey): candidateKey is string =>
                typeof candidateKey === 'string',
            )
          : [];

        for (const candidateKey of candidateKeys) {
          counts.set(candidateKey, (counts.get(candidateKey) ?? 0) + 1);
        }
      }
    } else {
      const validBallots = await this.prisma.decryptedBallot.findMany({
        where: {
          isValid: true,
          voteSubmission: { electionRefId: electionId },
        },
        select: { candidateKeys: true },
      });

      for (const ballot of validBallots) {
        const candidateKeys = Array.isArray(ballot.candidateKeys)
          ? ballot.candidateKeys.filter(
              (candidateKey): candidateKey is string =>
                typeof candidateKey === 'string',
            )
          : [];

        for (const candidateKey of candidateKeys) {
          counts.set(candidateKey, (counts.get(candidateKey) ?? 0) + 1);
        }
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.liveTally.deleteMany({ where: { electionRefId: electionId } });

      if (counts.size === 0) {
        return;
      }

      await tx.liveTally.createMany({
        data: Array.from(counts.entries()).map(([candidateKey, count]) => ({
          electionRefId: electionId,
          candidateKey,
          count,
        })),
      });
    });

    await this.resultSummariesService.recomputeForElection(electionId);

    return this.findAll({ electionId: electionId.toString() });
  }

  findAll(query: { electionId?: string }) {
    return this.prisma.liveTally.findMany({
      where: {
        electionRefId: toOptionalBigInt(query.electionId),
      },
      orderBy: [{ electionRefId: 'asc' }, { candidateKey: 'asc' }],
    });
  }

  findOne(id: bigint) {
    return this.prisma.liveTally.findUnique({ where: { id } });
  }

  upsert(data: UpsertLiveTallyDto) {
    const electionId = BigInt(data.electionId);
    return this.prisma.liveTally.upsert({
      where: {
        electionRefId_candidateKey: {
          electionRefId: electionId,
          candidateKey: data.candidateKey,
        },
      },
      create: {
        electionRefId: electionId,
        candidateKey: data.candidateKey,
        count: data.count,
      },
      update: {
        count: data.count,
      },
    });
  }

  private async fetchManifestCandidateKeys(candidateManifestUri: string | null) {
    if (!candidateManifestUri) {
      return [];
    }

    try {
      const response = await fetch(this.resolveManifestUri(candidateManifestUri));
      if (!response.ok) {
        return [];
      }

      const payload = (await response.json()) as {
        candidates?: Array<{ candidateKey?: string; displayName?: string | null }>;
      };

      if (!Array.isArray(payload.candidates)) {
        return [];
      }

      return payload.candidates
        .map((candidate) => candidate.candidateKey?.trim() ?? '')
        .filter((candidateKey) => candidateKey.length > 0);
    } catch {
      return [];
    }
  }

  private resolveManifestUri(candidateManifestUri: string) {
    if (candidateManifestUri.startsWith('http://') || candidateManifestUri.startsWith('https://')) {
      return candidateManifestUri;
    }

    if (candidateManifestUri.startsWith('ipfs://')) {
      const gateway =
        process.env.PINATA_GATEWAYS ||
        process.env.PINATA_GATEWAY_URL ||
        'https://gateway.pinata.cloud';

      return `${gateway.replace(/\/$/, '')}/ipfs/${candidateManifestUri.slice('ipfs://'.length)}`;
    }

    return candidateManifestUri;
  }
}
