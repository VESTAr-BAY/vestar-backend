import { Injectable } from '@nestjs/common';
import { ElectionSyncState } from '@prisma/client';
import {
  createCipheriv,
  createHash,
  generateKeyPairSync,
  randomBytes,
} from 'node:crypto';
import { keccak256, toHex } from 'viem';
import { PrismaService } from '../../prisma/prisma.service';
import { PreparePrivateElectionDto } from './dto/prepare-private-election.dto';

const PRIVATE_ELECTION_KEY_SCHEME_VERSION = 1;

@Injectable()
export class PrivateElectionsService {
  constructor(private readonly prisma: PrismaService) {}

  async prepare(data: PreparePrivateElectionDto) {
    const seriesIdHash = this.hashString(data.seriesPreimage);
    const titleHash = this.hashString(data.title);
    const { publicKeyPem, privateKeyPem } = this.generateKeyPair();
    const privateKeyCommitmentHash = this.hashString(privateKeyPem);
    const privateKeyEncrypted = this.encryptPrivateKey(privateKeyPem);

    await this.prisma.$transaction(async (tx) => {
      const series = await tx.electionSeries.create({
        data: {
          seriesPreimage: data.seriesPreimage,
          coverImageUrl: data.seriesCoverImageUrl ?? null,
        },
      });

      const createdDraft = await tx.electionDraft.create({
        data: {
          seriesId: series.id,
          title: data.title,
          coverImageUrl: data.coverImageUrl ?? null,
          syncState: ElectionSyncState.PREPARED,
        },
      });

      await tx.electionKey.create({
        data: {
          draftId: createdDraft.id,
          publicKey: publicKeyPem,
          privateKeyCommitmentHash,
          privateKeyEncrypted,
          isRevealed: false,
        },
      });

    });

    return {
      seriesIdHash,
      titleHash,
      keySchemeVersion: PRIVATE_ELECTION_KEY_SCHEME_VERSION,
      publicKey: {
        format: 'pem',
        algorithm: 'ECDH-P256',
        value: publicKeyPem,
      },
      privateKeyCommitmentHash,
    };
  }

  private generateKeyPair() {
    const { publicKey, privateKey } = generateKeyPairSync('ec', {
      namedCurve: 'prime256v1',
      publicKeyEncoding: {
        type: 'spki',
        format: 'pem',
      },
      privateKeyEncoding: {
        type: 'pkcs8',
        format: 'pem',
      },
    });

    return {
      publicKeyPem: publicKey.toString(),
      privateKeyPem: privateKey.toString(),
    };
  }

  private hashString(value: string) {
    return keccak256(toHex(value));
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
