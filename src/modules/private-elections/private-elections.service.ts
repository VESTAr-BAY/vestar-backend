import { Injectable } from '@nestjs/common';
import {
  Prisma,
  PrivateElectionState,
  VisibilityMode,
} from '@prisma/client';
import {
  createCipheriv,
  createHash,
  createPrivateKey,
  generateKeyPairSync,
  randomBytes,
} from 'node:crypto';
import { keccak256, toHex } from 'viem';
import { PrismaService } from '../../prisma/prisma.service';

type CandidateInput = {
  candidateKey: string;
  displayOrder: number;
};

type PreparePrivateElectionDto = {
  groupKey: string;
  title: string;
  candidateManifestPreimage: {
    candidates: CandidateInput[];
  };
};

const PRIVATE_ELECTION_KEY_SCHEME_VERSION = 1;

@Injectable()
export class PrivateElectionsService {
  constructor(private readonly prisma: PrismaService) {}

  async prepare(data: PreparePrivateElectionDto) {
    const normalizedManifest = this.normalizeCandidateManifest(
      data.candidateManifestPreimage,
    );
    const seriesIdHash = this.hashString(data.groupKey);
    const titleHash = this.hashString(data.title);
    const candidateManifestHash = this.hashJson(normalizedManifest);
    const { publicKeyPem, privateKeyPem } = this.generateKeyPair();
    const privateKeyCommitmentHash = this.hashString(privateKeyPem);
    const privateKeyEncrypted = this.encryptPrivateKey(privateKeyPem);

    const election = await this.prisma.$transaction(async (tx) => {
      const group = await tx.electionGroup.upsert({
        where: { groupKey: data.groupKey },
        create: { groupKey: data.groupKey },
        update: {},
      });

      const createdElection = await tx.election.create({
        data: {
          groupId: group.id,
          title: data.title,
          candidateManifestPreimage:
            normalizedManifest as Prisma.InputJsonValue,
          visibilityMode: VisibilityMode.PRIVATE,
          state: PrivateElectionState.PREPARED,
        },
      });

      await tx.electionCandidate.createMany({
        data: normalizedManifest.candidates.map((candidate) => ({
          electionId: createdElection.id,
          candidateKey: candidate.candidateKey,
          displayOrder: candidate.displayOrder,
        })),
      });

      await tx.electionKey.create({
        data: {
          electionId: createdElection.id,
          publicKey: publicKeyPem,
          privateKeyCommitmentHash,
          privateKeyEncrypted,
          isRevealed: false,
        },
      });

      return createdElection;
    });

    return {
      electionId: election.id.toString(),
      visibilityMode: VisibilityMode.PRIVATE,
      state: election.state,
      seriesIdHash,
      titleHash,
      candidateManifestHash,
      keySchemeVersion: PRIVATE_ELECTION_KEY_SCHEME_VERSION,
      publicKey: publicKeyPem,
      privateKeyCommitmentHash,
      candidateManifestPreimage: normalizedManifest,
    };
  }

  private normalizeCandidateManifest(manifest: {
    candidates: CandidateInput[];
  }): {
    candidates: CandidateInput[];
  } {
    return {
      candidates: [...manifest.candidates]
        .map((candidate) => ({
          candidateKey: candidate.candidateKey,
          displayOrder: candidate.displayOrder,
        }))
        .sort((a, b) => a.displayOrder - b.displayOrder),
    };
  }

  private generateKeyPair() {
    const { publicKey, privateKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: {
        type: 'spki',
        format: 'pem',
      },
      privateKeyEncoding: {
        type: 'pkcs8',
        format: 'pem',
      },
    });

    const privateKeyPem = createPrivateKey(privateKey)
      .export({
        type: 'pkcs8',
        format: 'pem',
      })
      .toString();

    return {
      publicKeyPem: publicKey.toString(),
      privateKeyPem,
    };
  }

  private hashString(value: string) {
    return keccak256(toHex(value));
  }

  private hashJson(value: unknown) {
    return keccak256(toHex(JSON.stringify(value)));
  }

  private encryptPrivateKey(privateKeyPem: string) {
    const secret = process.env.PRIVATE_KEY_ENCRYPTION_SECRET;

    if (!secret) {
      throw new Error('PRIVATE_KEY_ENCRYPTION_SECRET is required');
    }

    const key = createHash('sha256').update(secret).digest();
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);

    const encrypted = Buffer.concat([
      cipher.update(privateKeyPem, 'utf8'),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();

    return JSON.stringify({
      algorithm: 'aes-256-gcm',
      iv: iv.toString('base64'),
      authTag: authTag.toString('base64'),
      ciphertext: encrypted.toString('base64'),
    });
  }
}
