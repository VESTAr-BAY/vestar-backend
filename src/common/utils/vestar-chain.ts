import {
  createPublicClient,
  defineChain,
  http,
  webSocket,
  type Chain,
  type Transport,
} from 'viem';
import { ipc } from 'viem/node';

type VestarTransportConfig = {
  endpoint: string;
  label: string;
  transport: Transport;
  transportKind: 'http' | 'ws' | 'ipc';
};

const chainIdCache = new Map<string, Promise<number>>();

function parseChainId(rawChainId: string) {
  const chainId = Number(rawChainId);

  if (!Number.isInteger(chainId) || chainId <= 0) {
    throw new Error(`Invalid VESTAR_CHAIN_ID/INDEXER_CHAIN_ID: ${rawChainId}`);
  }

  return chainId;
}

export function getConfiguredVestarChainId() {
  const rawChainId = process.env.VESTAR_CHAIN_ID ?? process.env.INDEXER_CHAIN_ID;

  if (!rawChainId) {
    return null;
  }

  return parseChainId(rawChainId);
}

export function getIndexerTransportConfig(): VestarTransportConfig | null {
  const ipcPath = process.env.INDEXER_IPC_PATH?.trim();
  if (ipcPath) {
    return {
      endpoint: ipcPath,
      label: `ipc:${ipcPath}`,
      transport: ipc(ipcPath),
      transportKind: 'ipc',
    };
  }

  const rpcUrl = process.env.INDEXER_RPC_URL?.trim();
  if (!rpcUrl) {
    return null;
  }

  if (rpcUrl.startsWith('ws://') || rpcUrl.startsWith('wss://')) {
    return {
      endpoint: rpcUrl,
      label: `ws:${rpcUrl}`,
      transport: webSocket(rpcUrl),
      transportKind: 'ws',
    };
  }

  return {
    endpoint: rpcUrl,
    label: `http:${rpcUrl}`,
    transport: http(rpcUrl),
    transportKind: 'http',
  };
}

export function requireIndexerTransportConfig(): VestarTransportConfig {
  const config = getIndexerTransportConfig();

  if (!config) {
    throw new Error(
      'Missing chain transport configuration. Set INDEXER_IPC_PATH or INDEXER_RPC_URL.',
    );
  }

  return config;
}

export async function resolveVestarChainId(transportConfig: VestarTransportConfig) {
  const configuredChainId = getConfiguredVestarChainId();

  if (configuredChainId !== null) {
    return configuredChainId;
  }

  let pendingChainId = chainIdCache.get(transportConfig.label);

  if (!pendingChainId) {
    pendingChainId = createPublicClient({
      transport: transportConfig.transport,
    }).getChainId();
    chainIdCache.set(transportConfig.label, pendingChainId);
  }

  try {
    return await pendingChainId;
  } catch (error) {
    chainIdCache.delete(transportConfig.label);
    throw error;
  }
}

export async function createVestarChain(
  transportConfig: VestarTransportConfig,
  name = 'vestar-chain',
): Promise<Chain> {
  const chainId = await resolveVestarChainId(transportConfig);

  return defineChain({
    id: chainId,
    name,
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: {
      default: {
        http:
          transportConfig.transportKind === 'http'
            ? [transportConfig.endpoint]
            : [],
        webSocket:
          transportConfig.transportKind === 'ws'
            ? [transportConfig.endpoint]
            : undefined,
      },
    },
  });
}
