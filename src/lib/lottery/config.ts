import type { LotteryConfig } from './types';

/**
 * Default lottery configuration
 * The lottery runs every 100 blocks with sales closing 6 blocks before the draw
 */
export const DEFAULT_LOTTERY_CONFIG: LotteryConfig = {
  blockCadence: 100,
  salesCloseBlocksBeforeDraw: 6,
  confirmationsRequired: 6,
  minTicketPurchase: 1,
  platformFeePercent: 0, // No platform fee by default
};

/**
 * Mempool.space API endpoints
 */
export const MEMPOOL_API = {
  BASE_URL: 'https://mempool.space/api',
  BLOCK_TIP_HEIGHT: '/blocks/tip/height',
  BLOCK_TIP_HASH: '/blocks/tip/hash',
  BLOCK_HEIGHT: (height: number) => `/block-height/${height}`,
  BLOCK: (hash: string) => `/block/${hash}`,
};

/**
 * Calculate lottery block milestones based on current block and cadence
 */
export function calculateLotteryBlocks(
  currentBlock: number,
  config: LotteryConfig = DEFAULT_LOTTERY_CONFIG
): {
  currentRoundStart: number;
  salesCloseBlock: number;
  drawBlock: number;
  payoutBlock: number;
  nextRoundStart: number;
  blocksUntilSalesClose: number;
  blocksUntilDraw: number;
  blocksUntilPayout: number;
} {
  const { blockCadence, salesCloseBlocksBeforeDraw, confirmationsRequired } = config;

  // Find the start of the current round (last multiple of blockCadence)
  const currentRoundStart = Math.floor(currentBlock / blockCadence) * blockCadence;

  // Draw block is the next multiple of blockCadence
  const drawBlock = currentRoundStart + blockCadence;

  // Sales close before the draw block
  const salesCloseBlock = drawBlock - salesCloseBlocksBeforeDraw;

  // Payout after confirmations
  const payoutBlock = drawBlock + confirmationsRequired;

  // Next round starts at the draw block
  const nextRoundStart = drawBlock;

  return {
    currentRoundStart,
    salesCloseBlock,
    drawBlock,
    payoutBlock,
    nextRoundStart,
    blocksUntilSalesClose: Math.max(0, salesCloseBlock - currentBlock),
    blocksUntilDraw: Math.max(0, drawBlock - currentBlock),
    blocksUntilPayout: Math.max(0, payoutBlock - currentBlock),
  };
}

/**
 * Estimate time until a future block (assuming ~10 min/block)
 */
export function estimateTimeToBlock(blocksAway: number): {
  minutes: number;
  hours: number;
  formatted: string;
} {
  const MINUTES_PER_BLOCK = 10;
  const minutes = blocksAway * MINUTES_PER_BLOCK;
  const hours = minutes / 60;

  let formatted: string;
  if (minutes < 60) {
    formatted = `~${Math.round(minutes)} min`;
  } else if (hours < 24) {
    formatted = `~${hours.toFixed(1)} hours`;
  } else {
    const days = hours / 24;
    formatted = `~${days.toFixed(1)} days`;
  }

  return { minutes, hours, formatted };
}

/**
 * Generate a unique lottery ID based on the draw block
 */
export function generateLotteryId(drawBlock: number): string {
  return `lottery-${drawBlock}`;
}

/**
 * Get the lottery npub's tag for identifying lottery notes
 * This tag is used to mark notes as lottery-related
 */
export const LOTTERY_TAG = 'nostr-lottery';

/**
 * Custom kind for lottery commitment events (addressable)
 * Using kind 30078 which is in the addressable range
 */
export const LOTTERY_COMMITMENT_KIND = 30078;
