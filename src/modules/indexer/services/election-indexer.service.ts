import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import {
  BallotPolicy,
  ElectionSyncState,
  OnchainElectionState,
  PaymentMode,
  Prisma,
  VisibilityMode,
} from '@prisma/client';
import {
  createPublicClient,
  decodeFunctionData,
  encodeAbiParameters,
  getAddress,
  http,
  keccak256,
  parseAbi,
  type Address,
  type Hex,
} from 'viem';
import { createVestarChain } from '../../../common/utils/vestar-chain';
import { PrismaService as AppPrismaService } from '../../../prisma/prisma.service';
import { FinalizedTallyService } from '../../finalized-tally/finalized-tally.service';
import { LiveTallyService } from '../../live-tally/live-tally.service';
import { PrivateBallotProcessorService } from '../../vote-submissions/private-ballot-processor.service';

const factoryAbi = parseAbi([
  'event ElectionCreated(bytes32 indexed seriesId, bytes32 indexed electionId, address indexed organizer, address electionAddress, uint8 visibilityMode, bool organizerVerifiedSnapshot, uint8 paymentMode, uint256 costPerBallot)',
]);

const privateVoteAbi = parseAbi([
  'event EncryptedVoteSubmitted(bytes32 indexed electionId, address indexed voter, bytes32 encryptedBallotHash, uint256 ballotsSpent, uint256 paymentAmount)',
  'function submitEncryptedVote(bytes encryptedBallot)',
]);

const openVoteAbi = parseAbi([
  'event OpenVoteSubmitted(bytes32 indexed electionId, address indexed voter, uint256 selectionCount, bytes32 candidateBatchHash, uint256 ballotsSpent, uint256 paymentAmount)',
  'function submitOpenVote(string[] candidateKeys)',
]);

const electionAbi = parseAbi([
  'function electionId() view returns (bytes32)',
  'function seriesId() view returns (bytes32)',
  'function organizer() view returns (address)',
  'function organizerVerifiedSnapshot() view returns (bool)',
  'function state() view returns (uint8)',
  'function syncState() returns (uint8)',
  'function getElectionConfig() view returns ((bytes32 seriesId,uint8 visibilityMode,bytes32 titleHash,bytes32 candidateManifestHash,string candidateManifestURI,uint64 startAt,uint64 endAt,uint64 resultRevealAt,uint8 minKarmaTier,uint8 ballotPolicy,uint64 resetInterval,uint8 paymentMode,uint256 costPerBallot,bool allowMultipleChoice,uint16 maxSelectionsPerSubmission,int32 timezoneWindowOffset,address paymentToken,bytes electionPublicKey,bytes32 privateKeyCommitmentHash,uint16 keySchemeVersion))',
  'event ResultFinalized(bytes32 indexed electionId, bytes32 indexed resultManifestHash, string resultManifestURI)',
]);

const resultFinalizedAbi = parseAbi([
  'event ResultFinalized(bytes32 indexed electionId, bytes32 indexed resultManifestHash, string resultManifestURI)',
]);

const ZERO_BYTES32 = `0x${'0'.repeat(64)}` as const;
const syncableStateSnapshots: OnchainElectionState[] = [
  OnchainElectionState.SCHEDULED,
  OnchainElectionState.ACTIVE,
  OnchainElectionState.CLOSED,
  OnchainElectionState.KEY_REVEAL_PENDING,
];


@Injectable()
export class ElectionIndexerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ElectionIndexerService.name);
  private readonly electionCursorKey = 'factory-election-created';
  private readonly voteCursorKey = 'private-vote-submitted';
  private readonly openVoteCursorKey = 'open-vote-submitted';
  private timer: NodeJS.Timeout | null = null;
  private currentElectionFromBlock: bigint | null = null;
  private currentVoteFromBlock: bigint | null = null;
  private currentOpenVoteFromBlock: bigint | null = null;

  constructor(
    private readonly prisma: AppPrismaService,
    private readonly finalizedTallyService: FinalizedTallyService,
    private readonly liveTallyService: LiveTallyService,
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
    const [electionCursor, voteCursor, openVoteCursor] = await Promise.all([
      this.getPersistedCursor(this.electionCursorKey),
      this.getPersistedCursor(this.voteCursorKey),
      this.getPersistedCursor(this.openVoteCursorKey),
    ]);

    this.currentElectionFromBlock = electionCursor
      ? BigInt(electionCursor.blockNumber)
      : configuredStartBlock;
    this.currentVoteFromBlock = voteCursor
      ? BigInt(voteCursor.blockNumber)
      : configuredStartBlock;
    this.currentOpenVoteFromBlock = openVoteCursor
      ? BigInt(openVoteCursor.blockNumber)
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
      this.currentVoteFromBlock === null ||
      this.currentOpenVoteFromBlock === null
    ) {
      return;
    }

    try {
      const chain = await createVestarChain(rpcUrl, 'vestar-indexer-chain');
      const client = createPublicClient({
        chain,
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

      if (this.currentOpenVoteFromBlock <= latestBlock) {
        await this.indexOpenVoteRange(
          client,
          this.currentOpenVoteFromBlock,
          latestBlock,
        );

        this.currentOpenVoteFromBlock = latestBlock + 1n;
        await this.persistCursor(
          this.openVoteCursorKey,
          this.currentOpenVoteFromBlock,
        );
      }

      await this.reconcilePreparedElections(client, latestBlock);
      await this.reconcilePrivateVoteSubmissions(client, latestBlock);
      await this.reconcileOnchainElectionStates(client);
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

    const privateElections = await this.prisma.onchainElection.findMany({
      where: {
        visibilityMode: VisibilityMode.PRIVATE,
      },
      select: {
        id: true,
        onchainElectionAddress: true,
        onchainElectionId: true,
      },
    });

    const addresses = privateElections
      .map((election) => election.onchainElectionAddress)
      .filter((address): address is string => Boolean(address))
      .map((address) => getAddress(address));

    if (addresses.length === 0) {
      return;
    }

    const dbElectionByAddress = new Map(
      privateElections
        .filter(
          (
            election,
          ): election is typeof election & {
            onchainElectionAddress: string;
            onchainElectionId: string;
          } => Boolean(election.onchainElectionAddress && election.onchainElectionId),
        )
        .map((election) => [getAddress(election.onchainElectionAddress), election]),
    );

    const dbElectionByOnchainId = new Map(
      privateElections
        .filter(
          (
            election,
          ): election is typeof election & {
            onchainElectionAddress: string;
            onchainElectionId: string;
          } => Boolean(election.onchainElectionAddress && election.onchainElectionId),
        )
        .map((election) => [election.onchainElectionId.toLowerCase(), election]),
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

      const dbElection =
        dbElectionByAddress.get(log.address) ??
        (log.args.electionId
          ? dbElectionByOnchainId.get(
              (log.args.electionId as string).toLowerCase(),
            )
          : undefined);

      if (!dbElection) {
        this.logger.warn(
          `Private vote submission election not found for address ${log.address} / electionId ${
            (log.args.electionId as string | undefined) ?? 'unknown'
          }`,
        );
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
      const encryptedBallotHash = keccak256(decoded.args[0] as Hex);

      if (
        encryptedBallotHash.toLowerCase() !==
        String(log.args.encryptedBallotHash ?? '').toLowerCase()
      ) {
        this.logger.warn(
          `Private vote submission ballot hash mismatch for tx ${log.transactionHash}`,
        );
        continue;
      }

      const createdSubmission = await this.prisma.privateVoteSubmission.upsert({
        where: { onchainTxHash: log.transactionHash },
        create: {
          electionRefId: dbElection.id,
          onchainTxHash: log.transactionHash,
          voterAddress: transaction.from,
          blockNumber: Number(log.blockNumber),
          blockTimestamp: new Date(Number(block.timestamp) * 1000),
          encryptedBallot,
          paymentAmount: BigInt(log.args.paymentAmount ?? 0n).toString(),
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
      } else {
        await this.liveTallyService.recomputeForElection(dbElection.id);
      }
    }
  }

  private async indexOpenVoteRange(
    client: ReturnType<typeof createPublicClient>,
    fromBlock: bigint,
    toBlock: bigint,
  ) {
    if (fromBlock > toBlock) {
      return;
    }

    const openElections = await this.prisma.onchainElection.findMany({
      where: {
        visibilityMode: VisibilityMode.OPEN,
      },
      select: {
        id: true,
        onchainElectionAddress: true,
        onchainElectionId: true,
      },
    });

    const addresses = openElections
      .map((election) => election.onchainElectionAddress)
      .filter((address): address is string => Boolean(address))
      .map((address) => getAddress(address));

    if (addresses.length === 0) {
      return;
    }

    const dbElectionByAddress = new Map(
      openElections
        .filter(
          (
            election,
          ): election is typeof election & {
            onchainElectionAddress: string;
            onchainElectionId: string;
          } => Boolean(election.onchainElectionAddress && election.onchainElectionId),
        )
        .map((election) => [getAddress(election.onchainElectionAddress), election]),
    );

    const dbElectionByOnchainId = new Map(
      openElections
        .filter(
          (
            election,
          ): election is typeof election & {
            onchainElectionAddress: string;
            onchainElectionId: string;
          } => Boolean(election.onchainElectionAddress && election.onchainElectionId),
        )
        .map((election) => [election.onchainElectionId.toLowerCase(), election]),
    );

    const logs = await client.getLogs({
      address: addresses,
      event: openVoteAbi[0],
      fromBlock,
      toBlock,
    });

    for (const log of logs) {
      if (!log.transactionHash || !log.blockNumber) {
        continue;
      }

      const dbElection =
        dbElectionByAddress.get(log.address) ??
        (log.args.electionId
          ? dbElectionByOnchainId.get(
              (log.args.electionId as string).toLowerCase(),
            )
          : undefined);

      if (!dbElection) {
        this.logger.warn(
          `Open vote submission election not found for address ${log.address} / electionId ${
            (log.args.electionId as string | undefined) ?? 'unknown'
          }`,
        );
        continue;
      }

      const [transaction, block] = await Promise.all([
        client.getTransaction({ hash: log.transactionHash }),
        client.getBlock({ blockNumber: log.blockNumber }),
      ]);

      const decoded = decodeFunctionData({
        abi: openVoteAbi,
        data: transaction.input,
      });

      if (decoded.functionName !== 'submitOpenVote') {
        continue;
      }

      const candidateKeys = Array.isArray(decoded.args[0])
        ? (decoded.args[0] as unknown[]).filter(
            (candidateKey): candidateKey is string =>
              typeof candidateKey === 'string',
          )
        : [];

      const selectionCount = Number(log.args.selectionCount ?? 0n);
      if (candidateKeys.length === 0 || candidateKeys.length !== selectionCount) {
        this.logger.warn(
          `Open vote submission candidate length mismatch for tx ${log.transactionHash}`,
        );
        continue;
      }

      const candidateBatchHash = keccak256(
        encodeAbiParameters([{ type: 'string[]' }], [candidateKeys]),
      );

      if (
        candidateBatchHash.toLowerCase() !==
        String(log.args.candidateBatchHash ?? '').toLowerCase()
      ) {
        this.logger.warn(
          `Open vote submission candidate batch hash mismatch for tx ${log.transactionHash}`,
        );
        continue;
      }

      await this.prisma.openVoteSubmission.upsert({
        where: { onchainTxHash: log.transactionHash },
        create: {
          electionRefId: dbElection.id,
          onchainTxHash: log.transactionHash,
          voterAddress: transaction.from,
          blockNumber: Number(log.blockNumber),
          blockTimestamp: new Date(Number(block.timestamp) * 1000),
          candidateKeys: candidateKeys as Prisma.InputJsonValue,
          selectionCount,
          paymentAmount: BigInt(log.args.paymentAmount ?? 0n).toString(),
        },
        update: {},
      });

      await this.liveTallyService.recomputeForElection(dbElection.id);
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
    const pendingPreparedCount = await this.prisma.electionDraft.count({
      where: { syncState: ElectionSyncState.PREPARED },
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
    const undecryptedSubmissionCount =
      await this.prisma.privateVoteSubmission.count({
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

  private async reconcileOnchainElectionStates(
    client: ReturnType<typeof createPublicClient>,
  ) {
    const electionsToRefresh = await this.prisma.onchainElection.findMany({
      where: {
        onchainState: {
          in: [
            OnchainElectionState.SCHEDULED,
            OnchainElectionState.ACTIVE,
            OnchainElectionState.CLOSED,
            OnchainElectionState.KEY_REVEAL_PENDING,
            OnchainElectionState.KEY_REVEALED,
            OnchainElectionState.FINALIZED,
          ],
        },
      },
      select: {
        id: true,
        onchainElectionId: true,
        onchainElectionAddress: true,
        onchainState: true,
      },
    });

    for (const election of electionsToRefresh) {
      if (!election.onchainElectionAddress) {
        continue;
      }

      try {
        const nextState = await client.simulateContract({
          address: getAddress(election.onchainElectionAddress),
          abi: electionAbi,
          functionName: 'syncState',
        });

        const mappedState = this.mapOnchainStateToDbState(
          Number(nextState.result),
        );
        if (mappedState === election.onchainState) {
          if (mappedState === OnchainElectionState.FINALIZED) {
            await this.ensureFinalizedProjection(
              client,
              election.id,
              getAddress(election.onchainElectionAddress),
            );
          }
          continue;
        }

        await this.prisma.onchainElection.update({
          where: { id: election.id },
          data: {
            onchainState: mappedState,
            isStateSyncing: syncableStateSnapshots.includes(mappedState),
            lastStateSyncRequestedAt: syncableStateSnapshots.includes(
              mappedState,
            )
              ? new Date()
              : null,
          },
        });

        if (mappedState === OnchainElectionState.FINALIZED) {
          await this.ensureFinalizedProjection(
            client,
            election.id,
            getAddress(election.onchainElectionAddress),
          );
        }
      } catch (error) {
        this.logger.warn(
          `Failed to refresh onchain state for election ${election.onchainElectionId}: ${
            error instanceof Error ? error.message : 'unknown error'
          }`,
        );
      }
    }
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
    const candidateManifestHash = config.candidateManifestHash as string;
    const candidateManifestUri = config.candidateManifestURI as string;

    const electionKey =
      commitmentHash.toLowerCase() === ZERO_BYTES32
        ? null
        : await this.prisma.electionKey.findUnique({
            where: { privateKeyCommitmentHash: commitmentHash },
            include: { draft: true },
          });

    const draft = electionKey?.draft ?? null;

    const nextOnchainState = this.mapOnchainStateToDbState(Number(onchainState));

    await this.prisma.$transaction(async (tx) => {
      const existingSeriesByOnchainId = await tx.electionSeries.findUnique({
        where: { onchainSeriesId: seriesId },
        select: { id: true },
      });
      if (draft) {
        if (
          existingSeriesByOnchainId &&
          existingSeriesByOnchainId.id !== draft.seriesId
        ) {
          await tx.electionDraft.update({
            where: { id: draft.id },
            data: {
              seriesId: existingSeriesByOnchainId.id,
              syncState: ElectionSyncState.INDEXED,
            },
          });

          const remainingDraftCount = await tx.electionDraft.count({
            where: { seriesId: draft.seriesId },
          });

          if (remainingDraftCount === 0) {
            await tx.electionSeries.delete({
              where: { id: draft.seriesId },
            });
          }
        } else {
          await tx.electionSeries.update({
            where: { id: draft.seriesId },
            data: { onchainSeriesId: seriesId },
          });

          await tx.electionDraft.update({
            where: { id: draft.id },
            data: {
              syncState: ElectionSyncState.INDEXED,
            },
          });
        }
      } else if (!existingSeriesByOnchainId) {
        await tx.electionSeries.create({
          data: {
            onchainSeriesId: seriesId,
            seriesPreimage: null,
          },
        });
      }

      const onchainElection = await tx.onchainElection.upsert({
        where: {
          onchainElectionId: electionId as string,
        },
        create: {
          draftId: draft?.id ?? null,
          onchainSeriesId: onchainSeriesId as string,
          onchainElectionId: electionId as string,
          onchainElectionAddress: electionAddress,
          candidateManifestHash,
          candidateManifestUri,
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
          onchainState: nextOnchainState,
        },
        update: {
          draftId: draft ? draft.id : undefined,
          onchainSeriesId: onchainSeriesId as string,
          onchainElectionAddress: electionAddress,
          candidateManifestHash,
          candidateManifestUri,
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
          onchainState: nextOnchainState,
        },
      });

      if (draft) {
        await tx.$executeRaw(
          Prisma.sql`
            DELETE FROM "invalid_onchain_elections"
            WHERE "election_ref_id" = ${onchainElection.id}
          `,
        );
      } else {
        await tx.$executeRaw(
          Prisma.sql`
            INSERT INTO "invalid_onchain_elections" (
              "election_ref_id",
              "reason_code",
              "reason_detail",
              "created_at",
              "updated_at"
            )
            VALUES (
              ${onchainElection.id},
              ${'MISSING_DRAFT_MAPPING'},
              ${`No prepared draft matched commitment hash ${commitmentHash}`},
              NOW(),
              NOW()
            )
            ON CONFLICT ("election_ref_id")
            DO UPDATE SET
              "reason_code" = EXCLUDED."reason_code",
              "reason_detail" = EXCLUDED."reason_detail",
              "updated_at" = NOW()
          `,
        );
      }
    });

    if (nextOnchainState === OnchainElectionState.FINALIZED) {
      const onchainElection = await this.prisma.onchainElection.findUnique({
        where: { onchainElectionId: electionId as string },
        select: { id: true },
      });

      if (onchainElection) {
        const finalizedAt = await this.getFinalizedAtFromChain(
          client,
          electionAddress,
        );
        await this.finalizedTallyService.finalizeForElection(
          onchainElection.id,
          finalizedAt,
        );
      }
    }
  }

  private async getFinalizedAtFromChain(
    client: ReturnType<typeof createPublicClient>,
    electionAddress: Address,
  ): Promise<Date> {
    const logs = await client.getLogs({
      address: electionAddress,
      event: resultFinalizedAbi[0],
      fromBlock: 0n,
      toBlock: 'latest',
    });

    const latestLog = logs[logs.length - 1];
    if (!latestLog?.blockNumber) {
      return new Date();
    }

    const block = await client.getBlock({ blockNumber: latestLog.blockNumber });
    return new Date(Number(block.timestamp) * 1000);
  }

  private async ensureFinalizedProjection(
    client: ReturnType<typeof createPublicClient>,
    electionDbId: bigint,
    electionAddress: Address,
  ) {
    const existingCount = await this.prisma.finalizedTally.count({
      where: { electionRefId: electionDbId },
    });

    if (existingCount > 0) {
      return;
    }

    const finalizedAt = await this.getFinalizedAtFromChain(client, electionAddress);
    await this.finalizedTallyService.finalizeForElection(
      electionDbId,
      finalizedAt,
    );
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
        return OnchainElectionState.SCHEDULED;
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
