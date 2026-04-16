import { createPublicClient, defineChain, http, type Chain } from 'viem';

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

export async function resolveVestarChainId(rpcUrl: string) {
  const configuredChainId = getConfiguredVestarChainId();

  if (configuredChainId !== null) {
    return configuredChainId;
  }

  let pendingChainId = chainIdCache.get(rpcUrl);

  if (!pendingChainId) {
    pendingChainId = createPublicClient({
      transport: http(rpcUrl),
    }).getChainId();
    chainIdCache.set(rpcUrl, pendingChainId);
  }

  try {
    return await pendingChainId;
  } catch (error) {
    chainIdCache.delete(rpcUrl);
    throw error;
  }
}

export async function createVestarChain(
  rpcUrl: string,
  name = 'vestar-chain',
): Promise<Chain> {
  const chainId = await resolveVestarChainId(rpcUrl);

  return defineChain({
    id: chainId,
    name,
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: {
      default: { http: [rpcUrl] },
    },
  });
}
