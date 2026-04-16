import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { OnchainElectionState, VisibilityMode } from '@prisma/client';
import { createDecipheriv, createHash } from 'node:crypto';
import {
  createPublicClient,
  createWalletClient,
  getAddress,
  http,
  parseAbi,
  stringToHex,
  type Address,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { createVestarChain } from '../../common/utils/vestar-chain';
import { PrismaService } from '../../prisma/prisma.service';

const keyRevealAbi = parseAbi([
  'function state() view returns (uint8)',
  'function isRevealManager(address account) view returns (bool)',
  'function revealedPrivateKey() view returns (bytes)',
  'function revealPrivateKey(bytes privateKeyData)',
]);

@Injectable()
export class KeyRevealWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KeyRevealWorkerService.name);
  private timer: NodeJS.Timeout | null = null;
  private isRunning = false;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    const rpcUrl = process.env.INDEXER_RPC_URL;
    const revealPrivateKey = process.env.KEY_REVEAL_WORKER_PRIVATE_KEY;

    if (!rpcUrl || !revealPrivateKey) {
      this.logger.log(
        'Key reveal worker is disabled because INDEXER_RPC_URL or KEY_REVEAL_WORKER_PRIVATE_KEY is missing',
      );
      return;
    }

    const pollIntervalMs = Number(process.env.INDEXER_POLL_INTERVAL_MS ?? '10000');

    void this.runOnce();
    this.timer = setInterval(() => {
      void this.runOnce();
    }, pollIntervalMs);
  }

  onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async runOnce() {
    if (this.isRunning) {
      return;
    }

    const rpcUrl = process.env.INDEXER_RPC_URL;
    const revealPrivateKey = process.env.KEY_REVEAL_WORKER_PRIVATE_KEY;

    if (!rpcUrl || !revealPrivateKey) {
      return;
    }

    this.isRunning = true;

    try {
      const chain = await createVestarChain(rpcUrl, 'vestar-key-reveal-chain');

      const account = privateKeyToAccount(
        revealPrivateKey as `0x${string}`,
      );
      const publicClient = createPublicClient({
        chain,
        transport: http(rpcUrl),
      });
      const walletClient = createWalletClient({
        account,
        chain,
        transport: http(rpcUrl),
      });

      const elections = await this.prisma.onchainElection.findMany({
        where: {
          visibilityMode: VisibilityMode.PRIVATE,
          onchainState: OnchainElectionState.KEY_REVEAL_PENDING,
          draft: {
            electionKey: {
              is: {
                isRevealed: false,
              },
            },
          },
        },
        include: {
          draft: {
            include: {
              electionKey: true,
            },
          },
        },
        orderBy: { id: 'asc' },
      });

      for (const election of elections) {
        const electionKey = election.draft?.electionKey;
        if (!electionKey) {
          continue;
        }

        const electionAddress = getAddress(
          election.onchainElectionAddress as Address,
        );

        try {
          const [onchainState, revealedPrivateKeyBytes, isRevealManager] =
            await Promise.all([
              publicClient.readContract({
                address: electionAddress,
                abi: keyRevealAbi,
                functionName: 'state',
              }),
              publicClient.readContract({
                address: electionAddress,
                abi: keyRevealAbi,
                functionName: 'revealedPrivateKey',
              }),
              publicClient.readContract({
                address: electionAddress,
                abi: keyRevealAbi,
                functionName: 'isRevealManager',
                args: [account.address],
              }),
            ]);

          if (Number(onchainState) !== 3) {
            continue;
          }

          if (!isRevealManager) {
            this.logger.warn(
              `Reveal manager permission is missing for ${electionAddress}`,
            );
            continue;
          }

          if ((revealedPrivateKeyBytes as `0x${string}`) !== '0x') {
            await this.markElectionKeyAsRevealed(electionKey.id, election.id);
            continue;
          }

          const privateKeyPem = this.decryptPrivateKey(
            electionKey.privateKeyEncrypted,
          );

          this.logger.log(
            `Sending revealPrivateKey for ${election.onchainElectionId} (${electionAddress}) from ${account.address}`,
          );

          const txHash = await walletClient.writeContract({
            address: electionAddress,
            abi: keyRevealAbi,
            functionName: 'revealPrivateKey',
            args: [stringToHex(privateKeyPem)],
            account,
          });

          this.logger.log(
            `revealPrivateKey submitted for ${election.onchainElectionId} (${electionAddress}): ${txHash}`,
          );
          await publicClient.waitForTransactionReceipt({ hash: txHash });
          await this.markElectionKeyAsRevealed(electionKey.id, election.id);

          this.logger.log(
            `Private key revealed for ${election.onchainElectionId} (${electionAddress})`,
          );
        } catch (error) {
          this.logger.warn(
            `Failed to reveal private key for ${election.onchainElectionAddress}: ${
              error instanceof Error ? error.message : 'unknown error'
            }`,
          );
        }
      }
    } finally {
      this.isRunning = false;
    }
  }

  private async markElectionKeyAsRevealed(
    electionKeyId: bigint,
    onchainElectionDbId: bigint,
  ) {
    await this.prisma.$transaction([
      this.prisma.electionKey.update({
        where: { id: electionKeyId },
        data: {
          isRevealed: true,
          revealedAt: new Date(),
        },
      }),
      this.prisma.onchainElection.update({
        where: { id: onchainElectionDbId },
        data: {
          onchainState: OnchainElectionState.KEY_REVEALED,
        },
      }),
    ]);
  }

  private decryptPrivateKey(privateKeyEncrypted: string) {
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
      throw new Error(
        `Unsupported private key envelope algorithm ${envelope.algorithm}`,
      );
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
}
