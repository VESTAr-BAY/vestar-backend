import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import {
  BallotPolicy,
  PaymentMode,
  Prisma,
  PrivateElectionState,
  VisibilityMode,
} from '@prisma/client';
import {
  createPublicClient,
  decodeFunctionData,
  defineChain,
  getAddress,
  http,
  parseAbi,
  type Address,
  type Hex,
} from 'viem';
import { PrismaService as AppPrismaService } from '../../../prisma/prisma.service';
import { FinalizedTallyService } from '../../finalized-tally/finalized-tally.service';
import { PrivateBallotProcessorService } from '../../vote-submissions/private-ballot-processor.service';

const factoryAbi = parseAbi([
  'event ElectionCreated(bytes32 indexed seriesId, bytes32 indexed electionId, address indexed organizer, address electionAddress, uint8 visibilityMode, bool organizerVerifiedSnapshot, uint8 paymentMode, uint256 costPerBallot)',
]);

const privateVoteAbi = parseAbi([
  'event EncryptedVoteSubmitted(bytes32 indexed electionId, address indexed voter, bytes32 encryptedBallotHash, uint256 ballotsSpent, uint256 paymentAmount)',
  'function submitEncryptedVote(bytes encryptedBallot)',
]);

const electionAbi = parseAbi([
  'function electionId() view returns (bytes32)',
  'function seriesId() view returns (bytes32)',
  'function organizer() view returns (address)',
  'function organizerVerifiedSnapshot() view returns (bool)',
  'function state() view returns (uint8)',
  'function getElectionConfig() view returns ((bytes32 electionId,bytes32 seriesId,uint8 visibilityMode,bytes32 titleHash,bytes32 candidateManifestHash,string candidateManifestURI,uint64 startAt,uint64 endAt,uint64 resultRevealAt,uint8 minKarmaTier,uint8 ballotPolicy,uint64 resetInterval,uint8 paymentMode,uint256 costPerBallot,bool allowMultipleChoice,uint16 maxSelectionsPerSubmission,int32 timezoneWindowOffset,address paymentToken,bytes electionPublicKey,bytes32 privateKeyCommitmentHash,uint16 keySchemeVersion))',
]);

@Injectable()
export class ElectionIndexerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ElectionIndexerService.name);
  private readonly electionCursorKey = 'factory-election-created';
  private readonly voteCursorKey = 'private-vote-submitted';
  private timer: NodeJS.Timeout | null = null;
  private currentElectionFromBlock: bigint | null = null;
  private currentVoteFromBlock: bigint | null = null;

  constructor(
    private readonly prisma: AppPrismaService,
    private readonly finalizedTallyService: FinalizedTallyService,
    private readonly privateBallotProcessorService: PrivateBallotProcessorService,
  ) {}

  onModuleInit() {
    const rpcUrl = process.env.INDEXER_RPC_URL;
    const factoryAddress = process.env.INDEXER_FACTORY_ADDRESS;

    if (!rpcUrl || !factoryAddress) {
      this.logger.log('Indexer is disabled because INDEXER_RPC_URL or INDEXER_FACTORY_ADDRESS is missing');
      return;
    }

    const pollIntervalMs = Number(process.env.INDEXER_POLL_INTERVAL_MS ?? '10000');

    void this.initializeCursorAndPoll();
    this.timer = setInterval(() => {
      void this.pollOnce();
    }, pollIntervalMs);
  }

  onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async initializeCursorAndPoll() {
    const configuredStartBlock = BigInt(process.env.INDEXER_START_BLOCK ?? '0');
    const [electionCursor, voteCursor] = await Promise.all([
      this.getPersistedCursor(this.electionCursorKey),
      this.getPersistedCursor(this.voteCursorKey),
    ]);

    this.currentElectionFromBlock = electionCursor
      ? BigInt(electionCursor.blockNumber)
      : configuredStartBlock;
    this.currentVoteFromBlock = voteCursor
      ? BigInt(voteCursor.blockNumber)
      : configuredStartBlock;

    await this.pollOnce();
  }

  private async pollOnce() {
    const rpcUrl = process.env.INDEXER_RPC_URL;
    const factoryAddress = process.env.INDEXER_FACTORY_ADDRESS;

    if (
      !rpcUrl ||
      !factoryAddress ||
      this.currentElectionFromBlock === null ||
      this.currentVoteFromBlock === null
    ) {
      return;
    }

    try {
      const client = createPublicClient({
        chain: defineChain({
          id: 1,
          name: 'vestar-indexer-chain',
          nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
          rpcUrls: {
            default: { http: [rpcUrl] },
          },
        }),
        transport: http(rpcUrl),
      });

      const latestBlock = await client.getBlockNumber();
      if (this.currentElectionFromBlock <= latestBlock) {
        await this.indexElectionRange(
          client,
          getAddress(factoryAddress),
          this.currentElectionFromBlock,
          latestBlock,
        );

        this.currentElectionFromBlock = latestBlock + 1n;
        await this.persistCursor(
          this.electionCursorKey,
          this.currentElectionFromBlock,
        );
      }

      if (this.currentVoteFromBlock <= latestBlock) {
        await this.indexPrivateVoteRange(
          client,
          this.currentVoteFromBlock,
          latestBlock,
        );

        this.currentVoteFromBlock = latestBlock + 1n;
        await this.persistCursor(this.voteCursorKey, this.currentVoteFromBlock);
      }

      await this.reconcilePreparedElections(client, latestBlock);
      await this.reconcilePrivateVoteSubmissions(client, latestBlock);
    } catch (error) {
      this.logger.error('Election indexer poll failed', error as Error);
    }
  }

  private async indexElectionRange(
    client: ReturnType<typeof createPublicClient>,
    factoryAddress: Address,
    fromBlock: bigint,
    toBlock: bigint,
  ) {
    if (fromBlock > toBlock) {
      return;
    }

    const logs = await client.getLogs({
      address: factoryAddress,
      event: factoryAbi[0],
      fromBlock,
      toBlock,
    });

    for (const log of logs) {
      const seriesId = log.args.seriesId as `0x${string}` | undefined;
      const electionAddress = log.args.electionAddress as Address | undefined;
      if (!electionAddress || !seriesId) {
        continue;
      }

      await this.indexElection(client, electionAddress, seriesId);
    }
  }

  private async indexPrivateVoteRange(
    client: ReturnType<typeof createPublicClient>,
    fromBlock: bigint,
    toBlock: bigint,
  ) {
    if (fromBlock > toBlock) {
      return;
    }

    const privateElections = await this.prisma.election.findMany({
      where: {
        visibilityMode: VisibilityMode.PRIVATE,
        onchainElectionAddress: { not: null },
      },
      select: {
        id: true,
        onchainElectionAddress: true,
      },
    });

    const addresses = privateElections
      .map((election) => election.onchainElectionAddress)
      .filter((address): address is string => Boolean(address))
      .map((address) => getAddress(address));

    if (addresses.length === 0) {
      return;
    }

    const electionIdByAddress = new Map(
      privateElections
        .filter(
          (election): election is typeof election & { onchainElectionAddress: string } =>
            Boolean(election.onchainElectionAddress),
        )
        .map((election) => [getAddress(election.onchainElectionAddress), election.id]),
    );

    const logs = await client.getLogs({
      address: addresses,
      event: privateVoteAbi[0],
      fromBlock,
      toBlock,
    });

    for (const log of logs) {
      if (!log.transactionHash || !log.blockNumber) {
        continue;
      }

      const electionAddress = log.address;
      const dbElectionId = electionIdByAddress.get(electionAddress);
      if (!dbElectionId) {
        continue;
      }

      const [transaction, block] = await Promise.all([
        client.getTransaction({ hash: log.transactionHash }),
        client.getBlock({ blockNumber: log.blockNumber }),
      ]);

      const decoded = decodeFunctionData({
        abi: privateVoteAbi,
        data: transaction.input,
      });

      if (decoded.functionName !== 'submitEncryptedVote') {
        continue;
      }

      const encryptedBallot = this.normalizeEncryptedBallotArg(
        decoded.args[0] as Hex,
      );

      const createdSubmission = await this.prisma.voteSubmission.upsert({
        where: { onchainTxHash: log.transactionHash },
        create: {
          electionId: dbElectionId,
          onchainTxHash: log.transactionHash,
          voterAddress: transaction.from,
          blockNumber: Number(log.blockNumber),
          blockTimestamp: new Date(Number(block.timestamp) * 1000),
          encryptedBallot,
        },
        update: {},
        include: {
          decryptedBallot: true,
        },
      });

      if (!createdSubmission.decryptedBallot) {
        await this.privateBallotProcessorService.processSubmission(
          createdSubmission.id,
        );
      }
    }
  }

  private async persistCursor(cursorKey: string, nextFromBlock: bigint) {
    await this.prisma.$executeRaw`
      INSERT INTO "indexer_cursors" ("key", "block_number", "updated_at")
      VALUES (${cursorKey}, ${nextFromBlock.toString()}, NOW())
      ON CONFLICT ("key")
      DO UPDATE SET
        "block_number" = EXCLUDED."block_number",
        "updated_at" = NOW()
    `;
  }

  private async getPersistedCursor(cursorKey: string): Promise<{
    key: string;
    blockNumber: string;
  } | null> {
    const rows = await this.prisma.$queryRaw<
      Array<{ key: string; block_number: string }>
    >(Prisma.sql`
      SELECT "key", "block_number"
      FROM "indexer_cursors"
      WHERE "key" = ${cursorKey}
      LIMIT 1
    `);

    const row = rows[0];
    if (!row) {
      return null;
    }

    return {
      key: row.key,
      blockNumber: row.block_number,
    };
  }

  private async reconcilePreparedElections(
    client: ReturnType<typeof createPublicClient>,
    latestBlock: bigint,
  ) {
    const pendingPreparedCount = await this.prisma.election.count({
      where: { state: PrivateElectionState.PREPARED },
    });

    if (pendingPreparedCount === 0) {
      return;
    }

    const lookbackBlocks = BigInt(
      process.env.INDEXER_RECONCILE_LOOKBACK_BLOCKS ?? '100',
    );
    const fromBlock =
      latestBlock > lookbackBlocks ? latestBlock - lookbackBlocks : 0n;
    const factoryAddress = process.env.INDEXER_FACTORY_ADDRESS;

    if (!factoryAddress) {
      return;
    }

    await this.indexElectionRange(
      client,
      getAddress(factoryAddress),
      fromBlock,
      latestBlock,
    );
  }

  private async reconcilePrivateVoteSubmissions(
    client: ReturnType<typeof createPublicClient>,
    latestBlock: bigint,
  ) {
    const undecryptedSubmissionCount = await this.prisma.voteSubmission.count({
      where: { decryptedBallot: null },
    });

    if (undecryptedSubmissionCount === 0) {
      return;
    }

    const lookbackBlocks = BigInt(
      process.env.INDEXER_RECONCILE_LOOKBACK_BLOCKS ?? '100',
    );
    const fromBlock =
      latestBlock > lookbackBlocks ? latestBlock - lookbackBlocks : 0n;

    await this.indexPrivateVoteRange(client, fromBlock, latestBlock);
  }

  private async indexElection(
    client: ReturnType<typeof createPublicClient>,
    electionAddress: Address,
    seriesId: `0x${string}`,
  ) {
    const [electionId, onchainSeriesId, organizer, organizerVerifiedSnapshot, onchainState, config] =
      await Promise.all([
        client.readContract({
          address: electionAddress,
          abi: electionAbi,
          functionName: 'electionId',
        }),
        client.readContract({
          address: electionAddress,
          abi: electionAbi,
          functionName: 'seriesId',
        }),
        client.readContract({
          address: electionAddress,
          abi: electionAbi,
          functionName: 'organizer',
        }),
        client.readContract({
          address: electionAddress,
          abi: electionAbi,
          functionName: 'organizerVerifiedSnapshot',
        }),
        client.readContract({
          address: electionAddress,
          abi: electionAbi,
          functionName: 'state',
        }),
        client.readContract({
          address: electionAddress,
          abi: electionAbi,
          functionName: 'getElectionConfig',
        }),
      ]);

    if ((onchainSeriesId as string) !== seriesId) {
      this.logger.warn(
        `SeriesId mismatch for election ${electionAddress}: event=${seriesId}, contract=${onchainSeriesId as string}`,
      );
    }

    const commitmentHash = config.privateKeyCommitmentHash as `0x${string}`;

    const electionKey = await this.prisma.electionKey.findUnique({
      where: { privateKeyCommitmentHash: commitmentHash },
      include: { election: true },
    });

    if (!electionKey?.election) {
      this.logger.warn(
        `Prepared election not found for commitment hash ${commitmentHash}`,
      );
      return;
    }

    const election = electionKey.election;

    const nextState = this.mapOnchainStateToDbState(Number(onchainState));

    await this.prisma.$transaction(async (tx) => {
      await tx.electionGroup.update({
        where: { id: election.groupId },
        data: { onchainSeriesId: seriesId },
      });

      await tx.election.update({
        where: { id: election.id },
        data: {
          onchainElectionId: electionId as string,
          onchainElectionAddress: electionAddress,
          organizerWalletAddress: organizer as string,
          organizerVerifiedSnapshot: organizerVerifiedSnapshot as boolean,
          visibilityMode: this.mapVisibilityMode(Number(config.visibilityMode)),
          paymentMode: this.mapPaymentMode(Number(config.paymentMode)),
          ballotPolicy: this.mapBallotPolicy(Number(config.ballotPolicy)),
          startAt: new Date(Number(config.startAt) * 1000),
          endAt: new Date(Number(config.endAt) * 1000),
          resultRevealAt: new Date(Number(config.resultRevealAt) * 1000),
          minKarmaTier: Number(config.minKarmaTier),
          resetIntervalSeconds: Number(config.resetInterval),
          allowMultipleChoice: Boolean(config.allowMultipleChoice),
          maxSelectionsPerSubmission: Number(config.maxSelectionsPerSubmission),
          timezoneWindowOffset: Number(config.timezoneWindowOffset),
          paymentToken:
            config.paymentToken === '0x0000000000000000000000000000000000000000'
              ? null
              : (config.paymentToken as string),
          costPerBallot: BigInt(config.costPerBallot).toString(),
          state: nextState,
        },
      });
    });

    if (nextState === PrivateElectionState.FINALIZED) {
      await this.finalizedTallyService.finalizeForElection(election.id);
    }
  }

  private mapVisibilityMode(value: number): VisibilityMode {
    return value === 0 ? VisibilityMode.OPEN : VisibilityMode.PRIVATE;
  }

  private mapPaymentMode(value: number): PaymentMode {
    return value === 0 ? PaymentMode.FREE : PaymentMode.PAID;
  }

  private mapBallotPolicy(value: number): BallotPolicy {
    switch (value) {
      case 0:
        return BallotPolicy.ONE_PER_ELECTION;
      case 1:
        return BallotPolicy.ONE_PER_INTERVAL;
      default:
        return BallotPolicy.UNLIMITED_PAID;
    }
  }

  private mapOnchainStateToDbState(value: number): PrivateElectionState {
    switch (value) {
      case 0:
      case 1:
        return PrivateElectionState.ACTIVE;
      case 2:
      case 3:
      case 4:
      case 5:
        return PrivateElectionState.FINALIZED;
      case 6:
        return PrivateElectionState.CANCELLED;
      default:
        return PrivateElectionState.ONCHAIN_PENDING;
    }
  }

  private normalizeEncryptedBallotArg(encryptedBallot: Hex) {
    try {
      return Buffer.from(encryptedBallot.slice(2), 'hex').toString('utf8');
    } catch {
      return encryptedBallot;
    }
  }
}
