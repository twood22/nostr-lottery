import type { NostrEvent } from '@nostrify/nostrify';
import { nip57 } from 'nostr-tools';
import { decode as decodeBolt11 } from 'light-bolt11-decoder';
import type { ParsedZapReceipt, TicketEntry, TicketCommitment } from './types';

/**
 * Parse a zap receipt (kind 9735) to extract relevant data
 */
export function parseZapReceipt(event: NostrEvent): ParsedZapReceipt | null {
  if (event.kind !== 9735) {
    return null;
  }

  // Get bolt11 invoice
  const bolt11Tag = event.tags.find(([name]) => name === 'bolt11')?.[1];
  if (!bolt11Tag) {
    console.warn('Zap receipt missing bolt11 tag:', event.id);
    return null;
  }

  // Decode bolt11 to get payment hash and amount
  let paymentHash: string;
  let amountSats: number;

  try {
    const decoded = decodeBolt11(bolt11Tag);

    // Find payment hash section
    const paymentHashSection = decoded.sections.find(
      (s: { name: string }) => s.name === 'payment_hash'
    );
    if (!paymentHashSection || !('value' in paymentHashSection)) {
      console.warn('Could not find payment_hash in bolt11:', event.id);
      return null;
    }
    paymentHash = paymentHashSection.value as string;

    // Get amount from bolt11 or from tags
    const amountSection = decoded.sections.find(
      (s: { name: string }) => s.name === 'amount'
    );
    if (amountSection && 'value' in amountSection) {
      // Amount in bolt11 is in millisatoshis
      amountSats = Math.floor(Number(amountSection.value) / 1000);
    } else {
      // Try to get from NIP-57 helper
      amountSats = nip57.getSatoshisAmountFromBolt11(bolt11Tag);
    }
  } catch (error) {
    console.warn('Failed to decode bolt11:', error);
    return null;
  }

  // Get sender pubkey from P tag (uppercase P = sender) or from description
  let senderPubkey: string | undefined;

  const senderTag = event.tags.find(([name]) => name === 'P')?.[1];
  if (senderTag) {
    senderPubkey = senderTag;
  } else {
    // Try to get from embedded zap request in description
    const descriptionTag = event.tags.find(([name]) => name === 'description')?.[1];
    if (descriptionTag) {
      try {
        const zapRequest = JSON.parse(descriptionTag);
        senderPubkey = zapRequest.pubkey;
      } catch {
        // Ignore parse errors
      }
    }
  }

  if (!senderPubkey) {
    console.warn('Could not determine sender pubkey:', event.id);
    return null;
  }

  // Get target event ID
  const targetEventId = event.tags.find(([name]) => name === 'e')?.[1];

  return {
    event,
    paymentHash,
    bolt11: bolt11Tag,
    amountSats,
    senderPubkey,
    targetEventId,
    timestamp: event.created_at,
  };
}

/**
 * Build ticket entries from zap receipts
 * Tickets are assigned deterministically by sorting zaps by payment_hash (lexicographically)
 * 1 sat = 1 ticket
 */
export function buildTicketEntries(
  zapReceipts: NostrEvent[],
  minTicketPurchase: number = 1
): TicketEntry[] {
  // Parse all zap receipts
  const parsedZaps = zapReceipts
    .map(parseZapReceipt)
    .filter((z): z is ParsedZapReceipt => z !== null)
    .filter((z) => z.amountSats >= minTicketPurchase);

  // Sort by payment_hash (lexicographically) for deterministic ordering
  parsedZaps.sort((a, b) => a.paymentHash.localeCompare(b.paymentHash));

  // Assign ticket ranges
  const entries: TicketEntry[] = [];
  let currentTicket = 1;

  for (const zap of parsedZaps) {
    const ticketCount = zap.amountSats; // 1 sat = 1 ticket
    const ticketStart = currentTicket;
    const ticketEnd = currentTicket + ticketCount - 1;

    entries.push({
      zapReceipt: zap.event,
      paymentHash: zap.paymentHash,
      buyerPubkey: zap.senderPubkey,
      amountSats: zap.amountSats,
      ticketStart,
      ticketEnd,
      timestamp: zap.timestamp,
    });

    currentTicket = ticketEnd + 1;
  }

  return entries;
}

/**
 * Calculate total tickets from entries
 */
export function getTotalTickets(entries: TicketEntry[]): number {
  if (entries.length === 0) return 0;
  return entries[entries.length - 1].ticketEnd;
}

/**
 * Find the ticket entry that owns a specific ticket number
 */
export function findTicketOwner(
  entries: TicketEntry[],
  ticketNumber: number
): TicketEntry | null {
  // Binary search for efficiency
  let left = 0;
  let right = entries.length - 1;

  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    const entry = entries[mid];

    if (ticketNumber < entry.ticketStart) {
      right = mid - 1;
    } else if (ticketNumber > entry.ticketEnd) {
      left = mid + 1;
    } else {
      return entry;
    }
  }

  return null;
}

/**
 * Create a commitment hash of ticket assignments
 * This is published before the draw block is known for verifiability
 */
export function createTicketCommitment(
  entries: TicketEntry[],
  drawBlock: number
): TicketCommitment {
  const totalTickets = getTotalTickets(entries);

  // Create a simplified representation for hashing
  const assignments = entries.map((e) => ({
    paymentHash: e.paymentHash,
    pubkey: e.buyerPubkey,
    sats: e.amountSats,
    start: e.ticketStart,
    end: e.ticketEnd,
  }));

  const ticketAssignments = JSON.stringify(assignments);

  // Create a deterministic hash of the assignments for verification
  const ticketHash = simpleHash(ticketAssignments);

  return {
    drawBlock,
    totalTickets,
    ticketHash,
    ticketAssignments,
  };
}

/**
 * Simple hash function for commitment (deterministic)
 * Uses a basic hash algorithm suitable for commitment verification
 */
function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  // Convert to hex and pad
  const hex = Math.abs(hash).toString(16).padStart(8, '0');
  return hex;
}

/**
 * Verify that ticket assignments match a commitment
 */
export function verifyTicketCommitment(
  entries: TicketEntry[],
  commitment: TicketCommitment
): boolean {
  const currentCommitment = createTicketCommitment(entries, commitment.drawBlock);
  return (
    currentCommitment.ticketHash === commitment.ticketHash &&
    currentCommitment.totalTickets === commitment.totalTickets
  );
}

/**
 * Get a summary of ticket distribution
 */
export function getTicketDistribution(entries: TicketEntry[]): {
  totalTickets: number;
  totalSats: number;
  uniqueBuyers: number;
  buyerStats: Array<{
    pubkey: string;
    tickets: number;
    percentage: number;
  }>;
} {
  const totalTickets = getTotalTickets(entries);
  const totalSats = entries.reduce((sum, e) => sum + e.amountSats, 0);

  // Group by buyer
  const buyerTotals = new Map<string, number>();
  for (const entry of entries) {
    const current = buyerTotals.get(entry.buyerPubkey) || 0;
    buyerTotals.set(entry.buyerPubkey, current + entry.amountSats);
  }

  const buyerStats = Array.from(buyerTotals.entries())
    .map(([pubkey, tickets]) => ({
      pubkey,
      tickets,
      percentage: totalTickets > 0 ? (tickets / totalTickets) * 100 : 0,
    }))
    .sort((a, b) => b.tickets - a.tickets);

  return {
    totalTickets,
    totalSats,
    uniqueBuyers: buyerTotals.size,
    buyerStats,
  };
}
