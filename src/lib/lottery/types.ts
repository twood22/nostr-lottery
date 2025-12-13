import type { NostrEvent } from '@nostrify/nostrify';

/**
 * Configuration for a lottery round
 */
export interface LotteryConfig {
  /** Number of blocks between lottery rounds (default: 100) */
  blockCadence: number;
  /** Blocks before draw block when ticket sales close (e.g., 6 blocks before) */
  salesCloseBlocksBeforeDraw: number;
  /** Confirmations required before payout (default: 6) */
  confirmationsRequired: number;
  /** Minimum sats per ticket purchase */
  minTicketPurchase: number;
  /** Platform fee percentage (0-100) */
  platformFeePercent: number;
}

/**
 * Current Bitcoin block info from mempool.space
 */
export interface BitcoinBlock {
  height: number;
  hash: string;
  timestamp: number;
}

/**
 * A lottery round
 */
export interface LotteryRound {
  /** Unique identifier (based on draw block height) */
  id: string;
  /** The block height when this lottery was announced/started */
  startBlock: number;
  /** The block height when ticket sales close */
  salesCloseBlock: number;
  /** The block height that determines the winner */
  drawBlock: number;
  /** The block height when payout occurs (drawBlock + confirmations) */
  payoutBlock: number;
  /** Nostr event ID of the lottery announcement note */
  announcementEventId?: string;
  /** Nostr event ID of the ticket commitment note */
  commitmentEventId?: string;
  /** Nostr event ID of the winner announcement note */
  winnerEventId?: string;
  /** Current status of the lottery */
  status: LotteryStatus;
  /** All ticket entries */
  tickets: TicketEntry[];
  /** Total sats in the prize pool */
  totalPrizeSats: number;
  /** The winning ticket number (set after draw) */
  winningTicketNumber?: number;
  /** The winner's pubkey (set after draw) */
  winnerPubkey?: string;
  /** The draw block hash (set after draw) */
  drawBlockHash?: string;
  /** Whether payout has been completed */
  payoutCompleted: boolean;
  /** Payout transaction preimage (proof of payment) */
  payoutPreimage?: string;
}

/**
 * Lottery status
 */
export type LotteryStatus =
  | 'pending'      // Waiting for lottery to start
  | 'open'         // Accepting ticket purchases via zaps
  | 'closed'       // Ticket sales closed, waiting for draw block
  | 'drawing'      // Draw block reached, calculating winner
  | 'confirming'   // Winner determined, waiting for confirmations
  | 'paying'       // Sending prize to winner
  | 'completed'    // Lottery finished
  | 'failed';      // Something went wrong

/**
 * A single ticket entry from a zap
 */
export interface TicketEntry {
  /** Zap receipt event */
  zapReceipt: NostrEvent;
  /** Payment hash from the bolt11 invoice (used for deterministic ordering) */
  paymentHash: string;
  /** Pubkey of the ticket buyer */
  buyerPubkey: string;
  /** Lightning address of the buyer (from their profile) */
  buyerLud16?: string;
  /** Amount in sats */
  amountSats: number;
  /** Starting ticket number (1-indexed) */
  ticketStart: number;
  /** Ending ticket number (inclusive) */
  ticketEnd: number;
  /** Timestamp of the zap */
  timestamp: number;
}

/**
 * Commitment data published before draw (for verifiability)
 */
export interface TicketCommitment {
  /** Draw block height */
  drawBlock: number;
  /** Total number of tickets */
  totalTickets: number;
  /** Merkle root or hash of all ticket assignments */
  ticketHash: string;
  /** JSON string of all ticket assignments for verification */
  ticketAssignments: string;
}

/**
 * Winner selection result
 */
export interface WinnerResult {
  /** The winning ticket number */
  ticketNumber: number;
  /** The winning entry */
  winner: TicketEntry;
  /** The block hash used for randomness */
  blockHash: string;
  /** Verification data */
  verification: {
    blockHashHex: string;
    blockHashBigInt: string;
    totalTickets: number;
    winningTicketCalc: string;
  };
}

/**
 * Parsed zap receipt with extracted data
 */
export interface ParsedZapReceipt {
  event: NostrEvent;
  paymentHash: string;
  bolt11: string;
  amountSats: number;
  senderPubkey: string;
  targetEventId?: string;
  timestamp: number;
}
