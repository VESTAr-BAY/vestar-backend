import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { OnchainElectionState } from '@prisma/client';
import {
  createPublicClient,
  createWalletClient,
  getAddress,
  http,
  parseAbi,
  type Address,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { createVestarChain } from '../../common/utils/vestar-chain';
import { PrismaService } from '../../prisma/prisma.service';

const stateSyncAbi = parseAbi([
  'function state() view returns (uint8)',
  'function syncState() returns (uint8)',
]);

@Injectable()
export class StateSyncWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(StateSyncWorkerService.name);
  private timer: NodeJS.Timeout | null = null;
  private isRunning = false;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    const rpcUrl = process.env.INDEXER_RPC_URL;
    const workerPrivateKey =
      process.env.STATE_SYNC_WORKER_PRIVATE_KEY ??
      process.env.KEY_REVEAL_WORKER_PRIVATE_KEY;

    if (!rpcUrl || !workerPrivateKey) {
      this.logger.log(
        'State sync worker is disabled because INDEXER_RPC_URL or worker private key is missing',
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
    const workerPrivateKey =
      process.env.STATE_SYNC_WORKER_PRIVATE_KEY ??
      process.env.KEY_REVEAL_WORKER_PRIVATE_KEY;

    if (!rpcUrl || !workerPrivateKey) {
      return;
    }

    this.isRunning = true;

    try {
      const chain = await createVestarChain(rpcUrl, 'vestar-state-sync-chain');

      const account = privateKeyToAccount(workerPrivateKey as `0x${string}`);
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
          isStateSyncing: true,
          onchainState: {
            notIn: [OnchainElectionState.FINALIZED, OnchainElectionState.CANCELLED],
          },
        },
        select: {
          id: true,
          onchainElectionId: true,
          onchainElectionAddress: true,
          onchainState: true,
        },
        orderBy: { id: 'asc' },
      });

      for (const election of elections) {
        const electionAddress = getAddress(
          election.onchainElectionAddress as Address,
        );

        try {
          this.logger.log(
            `Sending syncState for ${election.onchainElectionId} (${electionAddress}) from ${account.address}; current snapshot=${election.onchainState}`,
          );

          const txHash = await walletClient.writeContract({
            address: electionAddress,
            abi: stateSyncAbi,
            functionName: 'syncState',
            account,
          });

          await this.prisma.onchainElection.update({
            where: { id: election.id },
            data: { lastStateSyncTxHash: txHash },
          });

          this.logger.log(
            `syncState submitted for ${election.onchainElectionId} (${electionAddress}): ${txHash}`,
          );
          await publicClient.waitForTransactionReceipt({ hash: txHash });

          const nextState = await publicClient.readContract({
            address: electionAddress,
            abi: stateSyncAbi,
            functionName: 'state',
          });

          await this.prisma.onchainElection.update({
            where: { id: election.id },
            data: {
              onchainState: this.mapOnchainStateToDbState(Number(nextState)),
              isStateSyncing: false,
            },
          });

          this.logger.log(
            `syncState confirmed for ${election.onchainElectionId} (${electionAddress}); nextState=${this.mapOnchainStateToDbState(
              Number(nextState),
            )}`,
          );
        } catch (error) {
          this.logger.warn(
            `Failed to sync state for ${election.onchainElectionId} (${electionAddress}): ${
              error instanceof Error ? error.message : 'unknown error'
            }`,
          );

          await this.prisma.onchainElection.update({
            where: { id: election.id },
            data: { isStateSyncing: false },
          });
        }
      }
    } finally {
      this.isRunning = false;
    }
  }

  private mapOnchainStateToDbState(value: number): OnchainElectionState {
    switch (value) {
      case 0:
        return OnchainElectionState.SCHEDULED;
      case 1:
        return OnchainElectionState.ACTIVE;
      case 2:
        return OnchainElectionState.CLOSED;
      case 3:
        return OnchainElectionState.KEY_REVEAL_PENDING;
      case 4:
        return OnchainElectionState.KEY_REVEALED;
      case 5:
        return OnchainElectionState.FINALIZED;
      case 6:
        return OnchainElectionState.CANCELLED;
      default:
        throw new Error(`Unknown on-chain election state: ${value}`);
    }
  }
}
