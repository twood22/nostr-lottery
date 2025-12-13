import { useQuery } from '@tanstack/react-query';
import { MEMPOOL_API } from '@/lib/lottery/config';
import type { BitcoinBlock } from '@/lib/lottery/types';

/**
 * Fetch the current Bitcoin block height from mempool.space
 */
async function fetchBlockHeight(): Promise<number> {
  const response = await fetch(`${MEMPOOL_API.BASE_URL}${MEMPOOL_API.BLOCK_TIP_HEIGHT}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch block height: ${response.statusText}`);
  }
  const height = await response.text();
  return parseInt(height, 10);
}

/**
 * Fetch the current Bitcoin block tip hash from mempool.space
 */
async function fetchBlockTipHash(): Promise<string> {
  const response = await fetch(`${MEMPOOL_API.BASE_URL}${MEMPOOL_API.BLOCK_TIP_HASH}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch block hash: ${response.statusText}`);
  }
  return response.text();
}

/**
 * Fetch block hash for a specific height
 */
export async function fetchBlockHashAtHeight(height: number): Promise<string> {
  const response = await fetch(`${MEMPOOL_API.BASE_URL}${MEMPOOL_API.BLOCK_HEIGHT(height)}`);
  if (!response.ok) {
    if (response.status === 404) {
      throw new Error(`Block ${height} not found yet`);
    }
    throw new Error(`Failed to fetch block hash: ${response.statusText}`);
  }
  return response.text();
}

/**
 * Fetch full block data
 */
export async function fetchBlock(hash: string): Promise<{
  id: string;
  height: number;
  timestamp: number;
}> {
  const response = await fetch(`${MEMPOOL_API.BASE_URL}${MEMPOOL_API.BLOCK(hash)}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch block: ${response.statusText}`);
  }
  return response.json();
}

/**
 * Hook to monitor the current Bitcoin block height
 * Polls mempool.space API at configurable intervals
 */
export function useBitcoinBlock(options?: {
  /** Polling interval in ms (default: 30000 = 30s) */
  pollingInterval?: number;
  /** Whether to enable polling (default: true) */
  enabled?: boolean;
}) {
  const { pollingInterval = 30000, enabled = true } = options ?? {};

  const heightQuery = useQuery({
    queryKey: ['bitcoin', 'height'],
    queryFn: fetchBlockHeight,
    refetchInterval: enabled ? pollingInterval : false,
    staleTime: 10000, // 10 seconds
    enabled,
  });

  const hashQuery = useQuery({
    queryKey: ['bitcoin', 'tipHash'],
    queryFn: fetchBlockTipHash,
    refetchInterval: enabled ? pollingInterval : false,
    staleTime: 10000,
    enabled,
  });

  const currentBlock: BitcoinBlock | null =
    heightQuery.data && hashQuery.data
      ? {
          height: heightQuery.data,
          hash: hashQuery.data,
          timestamp: Date.now(),
        }
      : null;

  return {
    currentBlock,
    height: heightQuery.data,
    hash: hashQuery.data,
    isLoading: heightQuery.isLoading || hashQuery.isLoading,
    isError: heightQuery.isError || hashQuery.isError,
    error: heightQuery.error || hashQuery.error,
    refetch: async () => {
      await Promise.all([heightQuery.refetch(), hashQuery.refetch()]);
    },
  };
}

/**
 * Hook to fetch a specific block's hash (e.g., the draw block)
 */
export function useBlockHash(height: number | undefined, options?: {
  enabled?: boolean;
  pollingInterval?: number;
}) {
  const { enabled = true, pollingInterval } = options ?? {};

  return useQuery({
    queryKey: ['bitcoin', 'blockHash', height],
    queryFn: () => fetchBlockHashAtHeight(height!),
    enabled: enabled && height !== undefined,
    retry: (failureCount, error) => {
      // Keep retrying if block not found yet (it's in the future)
      if (error instanceof Error && error.message.includes('not found yet')) {
        return true;
      }
      return failureCount < 3;
    },
    retryDelay: pollingInterval ?? 30000,
    refetchInterval: pollingInterval,
    staleTime: Infinity, // Block hashes never change once mined
  });
}
