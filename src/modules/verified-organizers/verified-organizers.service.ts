import { Injectable, Logger } from '@nestjs/common';
import { VerifiedOrganizerStatus } from '@prisma/client';
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  getAddress,
  http,
  parseAbi,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { PrismaService } from '../../prisma/prisma.service';

const organizerRegistryAbi = parseAbi([
  'function setVerification(address organizer, bool verified, uint64 effectiveTime, uint64 revokedTime)',
]);

const VESTAR_CHAIN_ID = 1660990954;

type CreateVerifiedOrganizerDto = {
  walletAddress: string;
  status: VerifiedOrganizerStatus;
  organizationName: string;
  contactEmail?: string | null;
  organizationLogoUrl?: string | null;
  rejectionReason?: string | null;
  verifiedBy?: bigint | null;
  verifiedAt?: Date | string | null;
};

type UpdateVerifiedOrganizerDto = Partial<CreateVerifiedOrganizerDto>;

@Injectable()
export class VerifiedOrganizersService {
  private readonly logger = new Logger(VerifiedOrganizersService.name);

  constructor(private readonly prisma: PrismaService) {}

  findAll(status?: VerifiedOrganizerStatus) {
    return this.prisma.verifiedOrganizer.findMany({
      where: status ? { status } : undefined,
      orderBy: { id: 'asc' },
    });
  }

  findOne(id: bigint) {
    return this.prisma.verifiedOrganizer.findUnique({ where: { id } });
  }

  findByWallet(walletAddress: string) {
    return this.prisma.verifiedOrganizer.findFirst({
      where: {
        walletAddress: {
          equals: walletAddress,
          mode: 'insensitive',
        },
        status: VerifiedOrganizerStatus.VERIFIED,
      },
    });
  }

  findRequestStatusByWallet(walletAddress: string) {
    return this.prisma.verifiedOrganizer.findFirst({
      where: {
        walletAddress: {
          equals: walletAddress,
          mode: 'insensitive',
        },
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async requestVerification(data: {
    walletAddress: string;
    organizationName: string;
    contactEmail?: string | null;
  }) {
    const existing = await this.prisma.verifiedOrganizer.findFirst({
      where: {
        walletAddress: {
          equals: data.walletAddress,
          mode: 'insensitive',
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    if (!existing) {
      return this.prisma.verifiedOrganizer.create({
        data: {
          walletAddress: data.walletAddress,
          status: VerifiedOrganizerStatus.PENDING,
          organizationName: data.organizationName,
          contactEmail: data.contactEmail ?? null,
          organizationLogoUrl: null,
          rejectionReason: null,
          verifiedBy: null,
          verifiedAt: null,
        },
      });
    }

    return this.prisma.verifiedOrganizer.update({
      where: { id: existing.id },
      data: {
        walletAddress: data.walletAddress,
        status: VerifiedOrganizerStatus.PENDING,
        organizationName: data.organizationName,
        contactEmail: data.contactEmail ?? null,
        rejectionReason: null,
        verifiedBy: null,
        verifiedAt: null,
      },
    });
  }

  async approve(id: bigint, params?: { verifiedBy?: bigint | null }) {
    const verifiedAt = new Date();
    const organizer = await this.prisma.verifiedOrganizer.findUnique({
      where: { id },
      select: { walletAddress: true },
    });

    if (organizer) {
      await this.syncVerificationOnChain(organizer.walletAddress, true, verifiedAt);
    }

    return this.prisma.verifiedOrganizer.update({
      where: { id },
      data: {
        status: VerifiedOrganizerStatus.VERIFIED,
        rejectionReason: null,
        verifiedBy: params?.verifiedBy ?? null,
        verifiedAt,
      },
    });
  }

  async reject(id: bigint, params?: { rejectionReason?: string | null; verifiedBy?: bigint | null }) {
    const revokedAt = new Date();
    const organizer = await this.prisma.verifiedOrganizer.findUnique({
      where: { id },
      select: { walletAddress: true },
    });

    if (organizer) {
      await this.syncVerificationOnChain(organizer.walletAddress, false, revokedAt);
    }

    return this.prisma.verifiedOrganizer.update({
      where: { id },
      data: {
        status: VerifiedOrganizerStatus.REJECTED,
        rejectionReason: params?.rejectionReason ?? null,
        verifiedBy: params?.verifiedBy ?? null,
        verifiedAt: null,
      },
    });
  }

  create(data: CreateVerifiedOrganizerDto) {
    return this.prisma.verifiedOrganizer.create({
      data: {
        ...data,
        verifiedAt: data.verifiedAt ? new Date(data.verifiedAt) : undefined,
      },
    });
  }

  update(id: bigint, data: UpdateVerifiedOrganizerDto) {
    return this.prisma.verifiedOrganizer.update({
      where: { id },
      data: {
        ...data,
        verifiedAt:
          data.verifiedAt === undefined ? undefined : data.verifiedAt ? new Date(data.verifiedAt) : null,
      },
    });
  }

  private async syncVerificationOnChain(
    walletAddress: string,
    verified: boolean,
    timestamp: Date,
  ) {
    const rpcUrl = process.env.INDEXER_RPC_URL;
    const registryAddress = process.env.ORGANIZER_REGISTRY_ADDRESS;
    const adminPrivateKey =
      process.env.ORGANIZER_REGISTRY_PRIVATE_KEY ??
      process.env.KEY_REVEAL_WORKER_PRIVATE_KEY;

    if (!rpcUrl || !registryAddress || !adminPrivateKey) {
      this.logger.warn(
        'Organizer registry sync skipped because INDEXER_RPC_URL, ORGANIZER_REGISTRY_ADDRESS, or signer private key is missing',
      );
      return;
    }

    const chain = defineChain({
      id: VESTAR_CHAIN_ID,
      name: 'vestar-organizer-registry-chain',
      nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
      rpcUrls: {
        default: { http: [rpcUrl] },
      },
    });

    const account = privateKeyToAccount(adminPrivateKey as `0x${string}`);
    const publicClient = createPublicClient({
      chain,
      transport: http(rpcUrl),
    });
    const client = createWalletClient({
      account,
      chain,
      transport: http(rpcUrl),
    });

    const txHash = await client.writeContract({
      address: getAddress(registryAddress),
      abi: organizerRegistryAbi,
      functionName: 'setVerification',
      args: [
        getAddress(walletAddress),
        verified,
        verified ? BigInt(Math.floor(timestamp.getTime() / 1000)) : 0n,
        verified ? 0n : BigInt(Math.floor(timestamp.getTime() / 1000)),
      ],
      account,
    });

    await publicClient.waitForTransactionReceipt({ hash: txHash });

    this.logger.log(
      `Organizer registry verification tx submitted for ${walletAddress}: ${txHash}`,
    );
  }
}
