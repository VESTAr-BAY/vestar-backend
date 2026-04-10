import { Injectable } from '@nestjs/common';
import {
  BallotPolicy,
  OnchainElectionState,
  Prisma,
} from '@prisma/client';
import {
  createDecipheriv,
  createHash,
  createPrivateKey,
  createPublicKey,
  diffieHellman,
} from 'node:crypto';
import { LiveTallyService } from '../live-tally/live-tally.service';
import { PrismaService } from '../../prisma/prisma.service';

type EncryptedBallotEnvelope = {
  algorithm: string;
  ephemeralPublicKey: string;
  iv: string;
  authTag: string;
  ciphertext: string;
};

type BallotPayloadV1 = {
  schemaVersion: number;
  electionId: string;
  chainId: number;
  electionAddress: string;
  voterAddress: string;
  candidateKeys: string[];
  nonce: string;
};

type ValidationResult =
  | {
      isValid: true;
      payload: BallotPayloadV1;
    }
  | {
      isValid: false;
      reasonCode: string;
      reasonDetail?: string;
  payload?: Partial<BallotPayloadV1>;
    };

type CandidateManifestRecord = {
  candidateKey?: string;
  displayName?: string | null;
};

type CandidateManifestEnvelope = {
  candidates?: CandidateManifestRecord[];
};

@Injectable()
export class PrivateBallotProcessorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly liveTallyService: LiveTallyService,
  ) {}

  async processSubmission(voteSubmissionId: bigint) {
    const submission = await this.prisma.voteSubmission.findUnique({
      where: { id: voteSubmissionId },
      include: {
        onchainElection: {
          include: {
            draft: {
              include: {
                electionKey: true,
                electionCandidates: {
                  orderBy: { displayOrder: 'asc' },
                },
              },
            },
          },
        },
        decryptedBallot: true,
        invalidBallots: true,
      },
    });

    if (!submission) {
      throw new Error(`Vote submission ${voteSubmissionId.toString()} not found`);
    }

    if (!submission.onchainElection.draft?.electionKey) {
      const processedSubmission = await this.prisma.$transaction(async (tx) => {
        await tx.invalidBallot.deleteMany({
          where: { voteSubmissionId: submission.id },
        });

        if (submission.decryptedBallot) {
          await tx.decryptedBallot.delete({
            where: { voteSubmissionId: submission.id },
          });
        }

        await tx.decryptedBallot.create({
          data: {
            voteSubmissionId: submission.id,
            candidateKeys: [] as never,
            nonce: '',
            isValid: false,
            validatedAt: new Date(),
          },
        });

        await tx.invalidBallot.create({
          data: {
            voteSubmissionId: submission.id,
            reasonCode: 'MISSING_ELECTION_KEY',
            reasonDetail: `On-chain election row ${submission.electionRefId.toString()} is not linked to a decryptable election key`,
          },
        });

        return tx.voteSubmission.findUnique({
          where: { id: submission.id },
          include: {
            decryptedBallot: true,
            invalidBallots: true,
          },
        });
      });

      await this.liveTallyService.recomputeForElection(submission.onchainElection.id);

      return processedSubmission;
    }

    const validation = await this.validateEncryptedSubmission({
      voteSubmissionId: submission.id,
      voterAddress: submission.voterAddress,
      blockTimestamp: submission.blockTimestamp,
      encryptedBallot: submission.encryptedBallot,
      election: {
        id: submission.onchainElection.id,
        onchainElectionId: submission.onchainElection.onchainElectionId,
        onchainElectionAddress: submission.onchainElection.onchainElectionAddress,
        ballotPolicy: submission.onchainElection.ballotPolicy,
        allowMultipleChoice: submission.onchainElection.allowMultipleChoice,
        maxSelectionsPerSubmission:
          submission.onchainElection.maxSelectionsPerSubmission,
        resetIntervalSeconds: submission.onchainElection.resetIntervalSeconds,
        timezoneWindowOffset: submission.onchainElection.timezoneWindowOffset,
        startAt: submission.onchainElection.startAt,
        endAt: submission.onchainElection.endAt,
        onchainState: submission.onchainElection.onchainState,
        candidateManifestUri: submission.onchainElection.candidateManifestUri,
        electionCandidates: submission.onchainElection.draft.electionCandidates,
        electionKey: {
          privateKeyEncrypted:
            submission.onchainElection.draft.electionKey.privateKeyEncrypted,
        },
      },
    });

    const processedSubmission = await this.prisma.$transaction(async (tx) => {
      await tx.invalidBallot.deleteMany({
        where: { voteSubmissionId: submission.id },
      });

      if (submission.decryptedBallot) {
        await tx.decryptedBallot.delete({
          where: { voteSubmissionId: submission.id },
        });
      }

      const decryptedBallot = await tx.decryptedBallot.create({
        data: {
          voteSubmissionId: submission.id,
          candidateKeys: (validation.payload?.candidateKeys ?? []) as never,
          nonce: validation.payload?.nonce ?? '',
          isValid: validation.isValid,
          validatedAt: new Date(),
        },
      });

      if (!validation.isValid) {
        await tx.invalidBallot.create({
          data: {
            voteSubmissionId: submission.id,
            reasonCode: validation.reasonCode,
            reasonDetail: validation.reasonDetail ?? null,
          },
        });
      }

      return tx.voteSubmission.findUnique({
        where: { id: submission.id },
        include: {
          decryptedBallot: true,
          invalidBallots: true,
        },
      });
    });

    await this.liveTallyService.recomputeForElection(submission.onchainElection.id);

    return processedSubmission;
  }

  async processPendingSubmissions(electionId?: bigint) {
    const submissions = await this.prisma.voteSubmission.findMany({
      where: {
        electionRefId: electionId,
        decryptedBallot: null,
      },
      orderBy: [{ blockNumber: 'asc' }, { id: 'asc' }],
      select: { id: true },
    });

    const results: Awaited<ReturnType<typeof this.processSubmission>>[] = [];
    for (const submission of submissions) {
      results.push(await this.processSubmission(submission.id));
    }

    return {
      processedCount: results.length,
      submissions: results,
    };
  }

  private async validateEncryptedSubmission(submission: {
    voteSubmissionId: bigint;
    voterAddress: string;
    blockTimestamp: Date;
    encryptedBallot: string;
    election: {
      id: bigint;
      onchainElectionId: string;
      onchainElectionAddress: string;
      ballotPolicy: BallotPolicy | null;
      allowMultipleChoice: boolean | null;
      maxSelectionsPerSubmission: number | null;
      resetIntervalSeconds: number | null;
      timezoneWindowOffset: number | null;
      startAt: Date | null;
      endAt: Date | null;
      onchainState: OnchainElectionState | null;
      candidateManifestUri: string | null;
      electionCandidates: Array<{ candidateKey: string }>;
      electionKey: { privateKeyEncrypted: string };
    };
  }): Promise<ValidationResult> {
    try {
      const privateKeyPem = this.decryptStoredPrivateKey(
        submission.election.electionKey.privateKeyEncrypted,
      );
      const payload = this.decryptBallotPayload(
        submission.encryptedBallot,
        privateKeyPem,
      );

      if (payload.schemaVersion !== 1) {
        return {
          isValid: false,
          reasonCode: 'UNSUPPORTED_SCHEMA_VERSION',
          reasonDetail: `Unsupported schema version ${payload.schemaVersion}`,
          payload,
        };
      }

      if (
        submission.election.onchainElectionId &&
        payload.electionId !== submission.election.onchainElectionId
      ) {
        return {
          isValid: false,
          reasonCode: 'ELECTION_ID_MISMATCH',
          reasonDetail: 'Payload electionId does not match election',
          payload,
        };
      }

      if (
        submission.election.onchainElectionAddress &&
        payload.electionAddress.toLowerCase() !==
          submission.election.onchainElectionAddress.toLowerCase()
      ) {
        return {
          isValid: false,
          reasonCode: 'ELECTION_ADDRESS_MISMATCH',
          reasonDetail: 'Payload electionAddress does not match election',
          payload,
        };
      }

      if (
        payload.voterAddress.toLowerCase() !== submission.voterAddress.toLowerCase()
      ) {
        return {
          isValid: false,
          reasonCode: 'VOTER_ADDRESS_MISMATCH',
          reasonDetail: 'Payload voterAddress does not match submission sender',
          payload,
        };
      }

      if (!Array.isArray(payload.candidateKeys) || payload.candidateKeys.length === 0) {
        return {
          isValid: false,
          reasonCode: 'EMPTY_SELECTION',
          reasonDetail: 'candidateKeys must not be empty',
          payload,
        };
      }

      if (!payload.nonce || payload.nonce.trim() === '') {
        return {
          isValid: false,
          reasonCode: 'INVALID_JSON',
          reasonDetail: 'nonce is required',
          payload,
        };
      }

      const candidateKeySet = new Set(payload.candidateKeys);
      if (candidateKeySet.size !== payload.candidateKeys.length) {
        return {
          isValid: false,
          reasonCode: 'DUPLICATE_SELECTION',
          reasonDetail: 'candidateKeys contains duplicates',
          payload,
        };
      }

      const allowedCandidateKeys = await this.resolveAllowedCandidateKeys(
        submission.election.candidateManifestUri,
        submission.election.electionCandidates,
      );

      const unknownCandidate = payload.candidateKeys.find(
        (candidateKey) => !allowedCandidateKeys.has(candidateKey),
      );

      if (unknownCandidate) {
        return {
          isValid: false,
          reasonCode: 'UNKNOWN_CANDIDATE',
          reasonDetail: `Unknown candidateKey ${unknownCandidate}`,
          payload,
        };
      }

      if (
        submission.election.ballotPolicy === BallotPolicy.UNLIMITED_PAID &&
        payload.candidateKeys.length !== 1
      ) {
        return {
          isValid: false,
          reasonCode: 'BALLOT_POLICY_VIOLATION',
          reasonDetail: 'UNLIMITED_PAID ballots must select exactly one candidate',
          payload,
        };
      }

      if (submission.election.allowMultipleChoice === false) {
        if (payload.candidateKeys.length !== 1) {
          return {
            isValid: false,
            reasonCode: 'TOO_MANY_SELECTIONS',
            reasonDetail: 'Single-choice election requires exactly one candidate',
            payload,
          };
        }
      } else if (
        submission.election.maxSelectionsPerSubmission !== null &&
        payload.candidateKeys.length >
          submission.election.maxSelectionsPerSubmission
      ) {
        return {
          isValid: false,
          reasonCode: 'TOO_MANY_SELECTIONS',
          reasonDetail: `Maximum selections exceeded: ${payload.candidateKeys.length}`,
          payload,
        };
      }

      const ballotUsageValidation = await this.validateBallotUsage(submission);
      if (!ballotUsageValidation.isValid) {
        return {
          isValid: false,
          reasonCode: ballotUsageValidation.reasonCode,
          reasonDetail: ballotUsageValidation.reasonDetail,
          payload,
        };
      }

      return {
        isValid: true,
        payload,
      };
    } catch (error) {
      return {
        isValid: false,
        reasonCode: 'DECRYPTION_FAILED',
        reasonDetail:
          error instanceof Error ? error.message : 'Unknown decryption error',
      };
    }
  }

  private decryptStoredPrivateKey(privateKeyEncrypted: string) {
    const secret = process.env.PRIVATE_KEY_ENCRYPTION_SECRET;

    if (!secret) {
      throw new Error('PRIVATE_KEY_ENCRYPTION_SECRET is required');
    }

    const envelope = JSON.parse(privateKeyEncrypted) as {
      algorithm: string;
      iv: string;
      authTag: string;
      ciphertext: string;
    };

    if (envelope.algorithm !== 'aes-256-gcm') {
      throw new Error(`Unsupported private key envelope algorithm ${envelope.algorithm}`);
    }

    const key = createHash('sha256').update(secret).digest();
    const decipher = createDecipheriv(
      'aes-256-gcm',
      key,
      Buffer.from(envelope.iv, 'base64'),
    );
    decipher.setAuthTag(Buffer.from(envelope.authTag, 'base64'));

    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(envelope.ciphertext, 'base64')),
      decipher.final(),
    ]);

    return decrypted.toString('utf8');
  }

  private decryptBallotPayload(
    encryptedBallot: string,
    privateKeyPem: string,
  ): BallotPayloadV1 {
    const envelope = this.parseEncryptedBallotEnvelope(encryptedBallot);

    if (envelope.algorithm !== 'ecdh-p256-aes-256-gcm') {
      throw new Error(`Unsupported encrypted ballot algorithm ${envelope.algorithm}`);
    }

    const privateKey = createPrivateKey(privateKeyPem);
    const ephemeralPublicKey = createPublicKey({
      key: Buffer.from(envelope.ephemeralPublicKey, 'base64'),
      type: 'spki',
      format: 'der',
    });
    const sharedSecret = diffieHellman({
      privateKey,
      publicKey: ephemeralPublicKey,
    });
    const symmetricKey = createHash('sha256').update(sharedSecret).digest();

    const decipher = createDecipheriv(
      'aes-256-gcm',
      symmetricKey,
      Buffer.from(envelope.iv, 'base64'),
    );
    decipher.setAuthTag(Buffer.from(envelope.authTag, 'base64'));

    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(envelope.ciphertext, 'base64')),
      decipher.final(),
    ]).toString('utf8');

    return JSON.parse(plaintext) as BallotPayloadV1;
  }

  private parseEncryptedBallotEnvelope(
    encryptedBallot: string,
  ): EncryptedBallotEnvelope {
    const rawJson = encryptedBallot.startsWith('0x')
      ? Buffer.from(encryptedBallot.slice(2), 'hex').toString('utf8')
      : encryptedBallot;

    const parsed = JSON.parse(rawJson) as Partial<EncryptedBallotEnvelope>;

    if (
      !parsed.algorithm ||
      !parsed.ephemeralPublicKey ||
      !parsed.iv ||
      !parsed.authTag ||
      !parsed.ciphertext
    ) {
      throw new Error('Encrypted ballot envelope is incomplete');
    }

    return {
      algorithm: parsed.algorithm,
      ephemeralPublicKey: parsed.ephemeralPublicKey,
      iv: parsed.iv,
      authTag: parsed.authTag,
      ciphertext: parsed.ciphertext,
    };
  }

  private async resolveAllowedCandidateKeys(
    candidateManifestUri: string | null,
    electionCandidates: Array<{ candidateKey: string }>,
  ) {
    const manifestCandidateKeys = await this.fetchManifestCandidateKeys(candidateManifestUri);

    if (manifestCandidateKeys.size > 0) {
      return manifestCandidateKeys;
    }

    return new Set(
      electionCandidates
        .map((candidate) => candidate.candidateKey)
        .filter((candidateKey) => candidateKey.trim().length > 0),
    );
  }

  private async fetchManifestCandidateKeys(candidateManifestUri: string | null) {
    if (!candidateManifestUri) {
      return new Set<string>();
    }

    try {
      const response = await fetch(this.resolveManifestUri(candidateManifestUri));
      if (!response.ok) {
        return new Set<string>();
      }

      const payload = (await response.json()) as CandidateManifestEnvelope;
      if (!Array.isArray(payload.candidates)) {
        return new Set<string>();
      }

      return new Set(
        payload.candidates
          .map((candidate) => candidate.candidateKey?.trim() ?? '')
          .filter((candidateKey) => candidateKey.length > 0),
      );
    } catch {
      return new Set<string>();
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

  private async validateBallotUsage(submission: {
    voteSubmissionId: bigint;
    voterAddress: string;
    blockTimestamp: Date;
    election: {
      id: bigint;
      ballotPolicy: BallotPolicy | null;
      resetIntervalSeconds: number | null;
      timezoneWindowOffset: number | null;
      startAt: Date | null;
      endAt: Date | null;
    };
  }): Promise<
    | { isValid: true }
    | { isValid: false; reasonCode: string; reasonDetail: string }
  > {
    const ballotPolicy = submission.election.ballotPolicy;

    if (!ballotPolicy) {
      return {
        isValid: false,
        reasonCode: 'BALLOT_POLICY_VIOLATION',
        reasonDetail: 'Election ballotPolicy is not set',
      };
    }

    if (
      !this.canSubmitBallotOffchain(
        submission.blockTimestamp,
        submission.election.startAt,
        submission.election.endAt,
      )
    ) {
      return {
        isValid: false,
        reasonCode: 'BALLOT_POLICY_VIOLATION',
        reasonDetail: 'Submission timestamp is outside the active election window',
      };
    }

    const priorValidBallots = await this.prisma.decryptedBallot.findMany({
      where: {
        isValid: true,
        voteSubmissionId: {
          not: submission.voteSubmissionId,
        },
        voteSubmission: {
          electionRefId: submission.election.id,
          voterAddress: submission.voterAddress,
        },
      },
      include: {
        voteSubmission: {
          select: {
            blockTimestamp: true,
          },
        },
      },
    });

    const currentPeriodKey = this.currentPeriodKey(
      submission.blockTimestamp,
      ballotPolicy,
      submission.election.resetIntervalSeconds,
      submission.election.timezoneWindowOffset ?? 0,
    );

    const submittedBallotsInPeriod = priorValidBallots.reduce(
      (count, ballot) =>
        this.currentPeriodKey(
          ballot.voteSubmission.blockTimestamp,
          ballotPolicy,
          submission.election.resetIntervalSeconds,
          submission.election.timezoneWindowOffset ?? 0,
        ) === currentPeriodKey
          ? count + 1
          : count,
      0,
    );

    const remainingBallots = this.remainingBallotsForPeriod(
      ballotPolicy,
      submittedBallotsInPeriod,
    );

    if (remainingBallots === 0) {
      return {
        isValid: false,
        reasonCode: 'BALLOT_POLICY_VIOLATION',
        reasonDetail: `No remaining ballots for current period ${currentPeriodKey.toString()}`,
      };
    }

    return { isValid: true };
  }

  private canSubmitBallotOffchain(
    blockTimestamp: Date,
    startAt: Date | null,
    endAt: Date | null,
  ) {
    if (!startAt || !endAt) {
      return false;
    }

    const ts = blockTimestamp.getTime();
    return ts >= startAt.getTime() && ts < endAt.getTime();
  }

  private remainingBallotsForPeriod(
    ballotPolicy: BallotPolicy,
    submittedBallotsInPeriod: number,
  ) {
    if (this.isUnlimitedVoting(ballotPolicy)) {
      return Number.MAX_SAFE_INTEGER;
    }

    return submittedBallotsInPeriod === 0 ? 1 : 0;
  }

  private isUnlimitedVoting(ballotPolicy: BallotPolicy) {
    return ballotPolicy === BallotPolicy.UNLIMITED_PAID;
  }

  private currentPeriodKey(
    blockTimestamp: Date,
    ballotPolicy: BallotPolicy,
    resetIntervalSeconds: number | null,
    timezoneWindowOffset: number,
  ) {
    if (ballotPolicy === BallotPolicy.ONE_PER_ELECTION) {
      return 0;
    }

    if (ballotPolicy === BallotPolicy.UNLIMITED_PAID) {
      return 0;
    }

    if (!resetIntervalSeconds || resetIntervalSeconds <= 0) {
      throw new Error('resetIntervalSeconds must be set for ONE_PER_INTERVAL');
    }

    const timestampSeconds = Math.floor(blockTimestamp.getTime() / 1000);
    const adjusted = timestampSeconds + timezoneWindowOffset;

    return Math.floor(adjusted / resetIntervalSeconds);
  }
}
