import type { TicketEntry, WinnerResult } from './types';
import { findTicketOwner, getTotalTickets } from './tickets';

/**
 * Select a winner using a Bitcoin block hash as the source of randomness
 *
 * Algorithm:
 * 1. Take the block hash (hex string)
 * 2. Convert to a BigInt
 * 3. Modulo by total tickets + 1 (since tickets are 1-indexed)
 * 4. Find the ticket owner
 *
 * This is deterministic and verifiable by anyone with:
 * - The list of ticket assignments
 * - The block hash
 */
export function selectWinner(
  entries: TicketEntry[],
  blockHash: string
): WinnerResult | null {
  if (entries.length === 0) {
    return null;
  }

  const totalTickets = getTotalTickets(entries);
  if (totalTickets === 0) {
    return null;
  }

  // Convert block hash to BigInt
  // Block hash is a 64-character hex string (256 bits)
  const hashBigInt = BigInt('0x' + blockHash);

  // Calculate winning ticket number (1-indexed)
  // We use modulo totalTickets and add 1 to get a number from 1 to totalTickets
  const winningTicketNumber = Number(hashBigInt % BigInt(totalTickets)) + 1;

  // Find the winner
  const winner = findTicketOwner(entries, winningTicketNumber);
  if (!winner) {
    console.error('Could not find ticket owner for ticket', winningTicketNumber);
    return null;
  }

  return {
    ticketNumber: winningTicketNumber,
    winner,
    blockHash,
    verification: {
      blockHashHex: blockHash,
      blockHashBigInt: hashBigInt.toString(),
      totalTickets,
      winningTicketCalc: `(${hashBigInt.toString()} % ${totalTickets}) + 1 = ${winningTicketNumber}`,
    },
  };
}

/**
 * Verify a winner selection independently
 * Anyone can call this with the same inputs to verify the result
 */
export function verifyWinnerSelection(
  entries: TicketEntry[],
  blockHash: string,
  claimedWinningTicket: number,
  claimedWinnerPubkey: string
): {
  isValid: boolean;
  reason?: string;
  calculatedTicket?: number;
  calculatedWinner?: string;
} {
  const result = selectWinner(entries, blockHash);

  if (!result) {
    return {
      isValid: false,
      reason: 'Could not calculate winner from provided data',
    };
  }

  if (result.ticketNumber !== claimedWinningTicket) {
    return {
      isValid: false,
      reason: `Claimed ticket ${claimedWinningTicket} does not match calculated ticket ${result.ticketNumber}`,
      calculatedTicket: result.ticketNumber,
      calculatedWinner: result.winner.buyerPubkey,
    };
  }

  if (result.winner.buyerPubkey !== claimedWinnerPubkey) {
    return {
      isValid: false,
      reason: `Claimed winner ${claimedWinnerPubkey} does not match calculated winner ${result.winner.buyerPubkey}`,
      calculatedTicket: result.ticketNumber,
      calculatedWinner: result.winner.buyerPubkey,
    };
  }

  return {
    isValid: true,
    calculatedTicket: result.ticketNumber,
    calculatedWinner: result.winner.buyerPubkey,
  };
}

/**
 * Format winner result for display
 */
export function formatWinnerResult(result: WinnerResult): string {
  return [
    `Winning Ticket: #${result.ticketNumber}`,
    `Winner: ${result.winner.buyerPubkey.slice(0, 8)}...`,
    `Prize: ${result.winner.amountSats} sats worth of tickets`,
    '',
    'Verification:',
    `Block Hash: ${result.blockHash}`,
    `Calculation: ${result.verification.winningTicketCalc}`,
  ].join('\n');
}

/**
 * Calculate prize amount after platform fee
 */
export function calculatePrizeAmount(
  totalSats: number,
  platformFeePercent: number
): {
  grossPrize: number;
  platformFee: number;
  netPrize: number;
} {
  const platformFee = Math.floor((totalSats * platformFeePercent) / 100);
  const netPrize = totalSats - platformFee;

  return {
    grossPrize: totalSats,
    platformFee,
    netPrize,
  };
}
