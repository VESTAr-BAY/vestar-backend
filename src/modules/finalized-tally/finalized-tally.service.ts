import { Injectable } from '@nestjs/common';
import { VisibilityMode } from '@prisma/client';
import { toOptionalBigInt } from '../../common/utils/query.utils';
import { PrismaService } from '../../prisma/prisma.service';
import { ResultSummariesService } from '../result-summaries/result-summaries.service';

type UpsertFinalizedTallyDto = {
  electionId: string | bigint;
  candidateKey: string;
  count: number;
  voteRatio: number;
  finalizedAt: string | Date;
};

@Injectable()
export class FinalizedTallyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly resultSummariesService: ResultSummariesService,
  ) {}

  async finalizeForElection(
    electionIdInput: string | bigint,
    finalizedAtInput?: string | Date,
  ) {
    const electionId = BigInt(electionIdInput);
    const onchainElection = await this.prisma.onchainElection.findUnique({
      where: { id: electionId },
      select: {
        visibilityMode: true,
        candidateManifestUri: true,
      },
    });

    const manifestCandidateKeys = await this.fetchManifestCandidateKeys(
      onchainElection?.candidateManifestUri ?? null,
    );
    const counts = new Map<string, number>();
    for (const candidateKey of manifestCandidateKeys) {
      counts.set(candidateKey, 0);
    }

    let totalValidVotes = 0;

    if (onchainElection?.visibilityMode === VisibilityMode.OPEN) {
      const openSubmissions = await this.prisma.openVoteSubmission.findMany({
        where: { electionRefId: electionId },
        select: { candidateKeys: true },
      });
      totalValidVotes = openSubmissions.length;

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
          privateVoteSubmission: { electionRefId: electionId },
        },
        select: { candidateKeys: true },
      });
      totalValidVotes = validBallots.length;

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
    const finalizedAt = finalizedAtInput
      ? new Date(finalizedAtInput)
      : new Date();

    await this.prisma.$transaction(async (tx) => {
      await tx.finalizedTally.deleteMany({ where: { electionRefId: electionId } });

      if (counts.size > 0) {
        await tx.finalizedTally.createMany({
          data: Array.from(counts.entries()).map(([candidateKey, count]) => ({
            electionRefId: electionId,
            candidateKey,
            count,
            voteRatio: totalValidVotes === 0 ? 0 : count / totalValidVotes,
            finalizedAt,
          })),
        });
      }

    });

    await this.resultSummariesService.recomputeForElection(electionId);
    return this.findAll({ electionId: electionId.toString() });
  }

  findAll(query: { electionId?: string }) {
    return this.prisma.finalizedTally.findMany({
      where: {
        electionRefId: toOptionalBigInt(query.electionId),
      },
      orderBy: [{ electionRefId: 'asc' }, { candidateKey: 'asc' }],
    });
  }

  findOne(id: bigint) {
    return this.prisma.finalizedTally.findUnique({ where: { id } });
  }

  upsert(data: UpsertFinalizedTallyDto) {
    const electionId = BigInt(data.electionId);
    return this.prisma.finalizedTally.upsert({
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
        voteRatio: data.voteRatio,
        finalizedAt: new Date(data.finalizedAt),
      },
      update: {
        count: data.count,
        voteRatio: data.voteRatio,
        finalizedAt: new Date(data.finalizedAt),
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
