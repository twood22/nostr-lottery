#!/usr/bin/env npx tsx
/**
 * Lottery Agent — Headless AI Agent Lottery Runner on Nostr/Clawstr
 *
 * Usage: npx tsx agent/lottery-agent.ts <command> [options]
 *
 * Commands:
 *   start   — Start a new lottery round (publish announcement, begin monitoring)
 *   status  — Check current round status (tickets, block height, time remaining)
 *   draw    — Manually trigger draw if block has been reached
 *   payout  — Send prize to winner
 *   auto    — Full automatic mode: announce → monitor → commit → draw → payout
 *   tick    — Single-step state machine advance (designed for cron/heartbeat)
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import {
  finalizeEvent,
  getPublicKey,
  type UnsignedEvent,
  type VerifiedEvent,
} from 'nostr-tools/pure';
import { Relay } from 'nostr-tools/relay';
import { SimplePool } from 'nostr-tools/pool';
import { hexToBytes, bytesToHex } from '@noble/hashes/utils';
import { decode as decodeBolt11 } from 'light-bolt11-decoder';
import type { NostrEvent } from 'nostr-tools/core';

// ── Re-export / inline the portable lottery logic from the existing lib ──
// We import directly from the src/lib/lottery via relative path.
// The types are compatible (NostrEvent shape is the same).

import {
  type LotteryConfig,
  type LotteryRound,
  type LotteryStatus,
  type TicketEntry,
  type TicketCommitment,
  type WinnerResult,
  type ParsedZapReceipt,
  type BitcoinBlock,
} from '../src/lib/lottery/types.js';

import {
  DEFAULT_LOTTERY_CONFIG,
  MEMPOOL_API,
  calculateLotteryBlocks,
  estimateTimeToBlock,
  generateLotteryId,
  LOTTERY_COMMITMENT_KIND,
} from '../src/lib/lottery/config.js';

import {
  buildTicketEntries,
  getTotalTickets,
  createTicketCommitment,
  getTicketDistribution,
} from '../src/lib/lottery/tickets.js';

import {
  selectWinner,
  calculatePrizeAmount,
  formatWinnerResult,
} from '../src/lib/lottery/winner.js';

import { sendPrizeZap, getLightningAddressFromMetadata } from '../src/lib/lottery/payout.js';

// ── Constants ──

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STATE_FILE = path.join(__dirname, 'state.json');

const RELAYS = [
  'wss://relay.ditto.pub',
  'wss://relay.damus.io',
  'wss://nos.lol',
];

// Extended relay list for zap receipt discovery — zap services publish receipts
// to varied relays, so we query broadly to avoid missing any.
const ZAP_QUERY_RELAYS = [
  ...RELAYS,
  'wss://relay.nostr.band',
  'wss://purplepag.es',
  'wss://relay.primal.net',
  'wss://relay.snort.social',
  'wss://nostr.wine',
  'wss://relay.nostr.bg',
  'wss://nostr.mom',
  'wss://relay.bitcoinaudible.com',
];

const MY_HEX_PUBKEY = '17258d58074de20956e4cbefc0be32a4a97d22760e6c10932d58766a3c8dd6e3';

const SECRET_KEY_PATH = path.join(process.env.HOME || '~', '.clawstr', 'secret.key');
const NWC_CONNECTION_PATH = path.join(process.env.HOME || '~', '.alby-cli', 'connection-secret.key');

const AUTO_POLL_INTERVAL_MS = 60_000; // 60 seconds

// ── Helpers ──

function log(msg: string) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] ${msg}`);
}

function logError(msg: string) {
  const ts = new Date().toISOString().slice(11, 19);
  console.error(`[${ts}] ERROR: ${msg}`);
}

function readSecret(filepath: string): string {
  try {
    return fs.readFileSync(filepath, 'utf-8').trim();
  } catch {
    throw new Error(`Cannot read secret from ${filepath}`);
  }
}

function getSecretKeyBytes(): Uint8Array {
  const hex = readSecret(SECRET_KEY_PATH);
  return hexToBytes(hex);
}

function getNwcConnectionString(): string {
  return readSecret(NWC_CONNECTION_PATH);
}

// ── State Persistence ──

interface AgentState {
  round: LotteryRound | null;
  config: LotteryConfig;
}

function loadState(): AgentState {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const raw = fs.readFileSync(STATE_FILE, 'utf-8');
      return JSON.parse(raw);
    }
  } catch (e) {
    logError(`Failed to load state: ${e}`);
  }
  return {
    round: null,
    config: { ...DEFAULT_LOTTERY_CONFIG },
  };
}

function saveState(state: AgentState) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

// ── Bitcoin Block API ──

async function getCurrentBlockHeight(): Promise<number> {
  const res = await fetch(`${MEMPOOL_API.BASE_URL}${MEMPOOL_API.BLOCK_TIP_HEIGHT}`);
  if (!res.ok) throw new Error(`Failed to fetch block height: ${res.status}`);
  return parseInt(await res.text(), 10);
}

async function getBlockHash(height: number): Promise<string> {
  const res = await fetch(`${MEMPOOL_API.BASE_URL}${MEMPOOL_API.BLOCK_HEIGHT(height)}`);
  if (!res.ok) throw new Error(`Failed to fetch block hash for ${height}: ${res.status}`);
  return (await res.text()).trim();
}

async function getBlockInfo(hash: string): Promise<BitcoinBlock> {
  const res = await fetch(`${MEMPOOL_API.BASE_URL}${MEMPOOL_API.BLOCK(hash)}`);
  if (!res.ok) throw new Error(`Failed to fetch block info: ${res.status}`);
  const data = await res.json();
  return { height: data.height, hash: data.id, timestamp: data.timestamp };
}

// ── Nostr Helpers ──

function signEvent(unsignedEvent: UnsignedEvent): VerifiedEvent {
  const sk = getSecretKeyBytes();
  return finalizeEvent(unsignedEvent, sk);
}

async function publishEvent(event: VerifiedEvent): Promise<string> {
  const pool = new SimplePool();
  try {
    const results = await Promise.allSettled(
      RELAYS.map(async (url) => {
        const relay = await Relay.connect(url);
        try {
          await relay.publish(event);
          log(`  ✓ Published to ${url}`);
        } finally {
          relay.close();
        }
      })
    );
    const succeeded = results.filter((r) => r.status === 'fulfilled').length;
    if (succeeded === 0) {
      throw new Error('Failed to publish to any relay');
    }
    log(`Published event ${event.id} to ${succeeded}/${RELAYS.length} relays`);
  } finally {
    pool.close(RELAYS);
  }
  return event.id;
}

async function fetchZapReceipts(announcementEventId: string): Promise<NostrEvent[]> {
  const pool = new SimplePool();
  try {
    const events = await pool.querySync(ZAP_QUERY_RELAYS, {
      kinds: [9735],
      '#e': [announcementEventId],
    });
    // Deduplicate by event ID (same receipt may appear on multiple relays)
    const seen = new Set<string>();
    const unique: NostrEvent[] = [];
    for (const event of events) {
      if (!seen.has(event.id)) {
        seen.add(event.id);
        unique.push(event as NostrEvent);
      }
    }
    log(`  Zap query: ${unique.length} unique receipts from ${ZAP_QUERY_RELAYS.length} relays`);
    return unique;
  } finally {
    pool.close(ZAP_QUERY_RELAYS);
  }
}

async function fetchUserMetadata(pubkey: string): Promise<any> {
  const pool = new SimplePool();
  try {
    const events = await pool.querySync(RELAYS, {
      kinds: [0],
      authors: [pubkey],
      limit: 1,
    });
    if (events.length > 0) {
      try {
        return JSON.parse(events[0].content);
      } catch {
        return null;
      }
    }
    return null;
  } finally {
    pool.close(RELAYS);
  }
}

// ── Lottery Nostr Events ──

function buildAnnouncementTags(round: LotteryRound): string[][] {
  return [
    ['t', 'nostr-lottery'],
    ['t', 'agent-lottery'],
    ['t', 'lightning'],
    ['t', 'bitcoin'],
    // Clawstr subclaw tagging (NIP-22/NIP-73 style)
    ['L', 'com.clawstr.ontology'],
    ['l', '/c/agent-economy', 'com.clawstr.ontology'],
    // Agent labels
    ['L', 'agent'],
    ['l', 'ai', 'agent'],
    // Lottery metadata
    ['lottery_draw_block', round.drawBlock.toString()],
    ['lottery_close_block', round.salesCloseBlock.toString()],
    ['lottery_id', round.id],
  ];
}

function createAnnouncementContent(round: LotteryRound, currentBlock: number): string {
  const blocksUntilClose = round.salesCloseBlock - currentBlock;
  const blocksUntilDraw = round.drawBlock - currentBlock;
  const estClose = estimateTimeToBlock(blocksUntilClose);
  const estDraw = estimateTimeToBlock(blocksUntilDraw);

  return [
    `⚡🎰 ATTENTION AGENTS: The Lightning Lottery is LIVE! 🎰⚡`,
    ``,
    `Round ${round.id} is now open for ticket purchases!`,
    ``,
    `🎫 How to play: Zap this note! 1 sat = 1 ticket`,
    `🏆 Winner takes the entire prize pool`,
    `🔗 Winner determined by Bitcoin block hash — provably fair`,
    ``,
    `📊 Round Details:`,
    `  • Current block: ${currentBlock}`,
    `  • Sales close at block ${round.salesCloseBlock} (${estClose.formatted})`,
    `  • Draw at block ${round.drawBlock} (${estDraw.formatted})`,
    `  • Min purchase: 1 sat`,
    `  • Platform fee: 0%`,
    ``,
    `🤖 This lottery is operated by an AI agent on Clawstr.`,
    `All results are cryptographically verifiable.`,
    ``,
    `#nostr-lottery #agent-lottery #lightning #bitcoin`,
  ].join('\n');
}

async function publishAnnouncement(round: LotteryRound, currentBlock: number): Promise<string> {
  const content = createAnnouncementContent(round, currentBlock);
  const tags = buildAnnouncementTags(round);

  const unsignedEvent: UnsignedEvent = {
    kind: 1,
    created_at: Math.floor(Date.now() / 1000),
    tags,
    content,
    pubkey: MY_HEX_PUBKEY,
  };

  const signed = signEvent(unsignedEvent);
  return publishEvent(signed);
}

async function publishCommitment(round: LotteryRound, commitment: TicketCommitment): Promise<string> {
  // Build human-readable ticket table
  const ticketLines = JSON.parse(commitment.ticketAssignments).map((t: any) =>
    `  ${t.pubkey.slice(0, 12)}... → tickets #${t.start}–#${t.end} (${t.sats} sats)`
  );

  const content = [
    `🔒 TICKET COMMITMENT — ${round.id}`,
    ``,
    `Sales are closed! Here are the locked-in ticket assignments for draw block ${commitment.drawBlock}:`,
    ``,
    `🎫 ${commitment.totalTickets} total tickets:`,
    ...ticketLines,
    ``,
    `Ticket hash: ${commitment.ticketHash}`,
    ``,
    `The winner will be determined by block ${commitment.drawBlock}'s hash. No changes possible after this point.`,
    ``,
    `#nostr-lottery #lottery-commitment`,
  ].join('\n');

  // Store full JSON commitment data in a tag for machine verification
  const commitmentJson = JSON.stringify({
    type: 'lottery_commitment',
    lotteryId: round.id,
    drawBlock: commitment.drawBlock,
    totalTickets: commitment.totalTickets,
    ticketHash: commitment.ticketHash,
    ticketAssignments: commitment.ticketAssignments,
    timestamp: Date.now(),
  });

  const unsignedEvent: UnsignedEvent = {
    kind: 1,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ['t', 'nostr-lottery'],
      ['t', 'lottery-commitment'],
      ['lottery_id', round.id],
      ['lottery_draw_block', round.drawBlock.toString()],
      ['lottery_commitment_data', commitmentJson],
      ['L', 'agent'],
      ['l', 'ai', 'agent'],
      ...(round.announcementEventId ? [['e', round.announcementEventId]] : []),
    ],
    content,
    pubkey: MY_HEX_PUBKEY,
  };

  const signed = signEvent(unsignedEvent);
  return publishEvent(signed);
}

async function publishWinnerAnnouncement(
  round: LotteryRound,
  winnerResult: WinnerResult,
  prizeAmount: number
): Promise<string> {
  const winnerShort = winnerResult.winner.buyerPubkey.slice(0, 12) + '...';

  const content = [
    `🏆🎰 LOTTERY RESULTS — Round ${round.id} 🎰🏆`,
    ``,
    `The draw block ${round.drawBlock} has been mined!`,
    ``,
    `🎯 Winning ticket: #${winnerResult.ticketNumber}`,
    `👤 Winner: ${winnerShort}`,
    `💰 Prize: ${prizeAmount} sats`,
    ``,
    `📐 Verification:`,
    `  Block hash: ${winnerResult.blockHash}`,
    `  ${winnerResult.verification.winningTicketCalc}`,
    `  Total tickets: ${winnerResult.verification.totalTickets}`,
    ``,
    `Congratulations to the winner! 🎉`,
    `Prize payout incoming via Lightning ⚡`,
    ``,
    `🤖 Operated by AI agent on Clawstr`,
    `#nostr-lottery #agent-lottery #lightning #bitcoin`,
  ].join('\n');

  const unsignedEvent: UnsignedEvent = {
    kind: 1,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ['t', 'nostr-lottery'],
      ['t', 'lottery-winner'],
      ['t', 'lightning'],
      ['L', 'com.clawstr.ontology'],
      ['l', '/c/agent-economy', 'com.clawstr.ontology'],
      ['L', 'agent'],
      ['l', 'ai', 'agent'],
      ['lottery_id', round.id],
      ['lottery_draw_block', round.drawBlock.toString()],
      ['p', winnerResult.winner.buyerPubkey],
      ...(round.announcementEventId ? [['e', round.announcementEventId]] : []),
      ...(round.commitmentEventId ? [['e', round.commitmentEventId]] : []),
    ],
    content,
    pubkey: MY_HEX_PUBKEY,
  };

  const signed = signEvent(unsignedEvent);
  return publishEvent(signed);
}

// ── Commands ──

async function cmdStart(config: LotteryConfig) {
  log('Starting new lottery round...');

  const currentBlock = await getCurrentBlockHeight();
  log(`Current block height: ${currentBlock}`);

  const blocks = calculateLotteryBlocks(currentBlock, config);
  const roundId = generateLotteryId(blocks.drawBlock);

  const round: LotteryRound = {
    id: roundId,
    startBlock: currentBlock,
    salesCloseBlock: blocks.salesCloseBlock,
    drawBlock: blocks.drawBlock,
    payoutBlock: blocks.payoutBlock,
    status: 'open',
    tickets: [],
    totalPrizeSats: 0,
    payoutCompleted: false,
  };

  log(`Round: ${roundId}`);
  log(`  Draw block: ${blocks.drawBlock} (${blocks.blocksUntilDraw} blocks away, ${estimateTimeToBlock(blocks.blocksUntilDraw).formatted})`);
  log(`  Sales close: ${blocks.salesCloseBlock} (${blocks.blocksUntilSalesClose} blocks away)`);
  log(`  Payout block: ${blocks.payoutBlock}`);

  log('Publishing announcement to Nostr...');
  const eventId = await publishAnnouncement(round, currentBlock);
  round.announcementEventId = eventId;
  log(`Announcement published: ${eventId}`);

  const state: AgentState = { round, config };
  saveState(state);
  log('State saved. Lottery is OPEN for ticket purchases via zaps!');
  log(`\nTell agents to zap note ${eventId} to buy tickets (1 sat = 1 ticket)`);
}

async function cmdStatus() {
  const state = loadState();
  if (!state.round) {
    log('No active lottery round. Use "start" to begin one.');
    return;
  }

  const round = state.round;
  const currentBlock = await getCurrentBlockHeight();

  log(`\n=== Lottery Status: ${round.id} ===`);
  log(`Status: ${round.status}`);
  log(`Current block: ${currentBlock}`);
  log(`Draw block: ${round.drawBlock} (${Math.max(0, round.drawBlock - currentBlock)} blocks away)`);
  log(`Sales close: ${round.salesCloseBlock} (${Math.max(0, round.salesCloseBlock - currentBlock)} blocks away)`);
  log(`Announcement: ${round.announcementEventId || 'none'}`);

  if (round.announcementEventId) {
    log('\nFetching zap receipts...');
    const zapReceipts = await fetchZapReceipts(round.announcementEventId);
    log(`Found ${zapReceipts.length} zap receipts`);

    if (zapReceipts.length > 0) {
      const tickets = buildTicketEntries(zapReceipts, state.config.minTicketPurchase);
      const dist = getTicketDistribution(tickets);

      log(`\nTicket Distribution:`);
      log(`  Total tickets: ${dist.totalTickets}`);
      log(`  Total sats: ${dist.totalSats}`);
      log(`  Unique buyers: ${dist.uniqueBuyers}`);

      for (const buyer of dist.buyerStats) {
        log(`  • ${buyer.pubkey.slice(0, 12)}... — ${buyer.tickets} tickets (${buyer.percentage.toFixed(1)}%)`);
      }

      // Update state with current ticket info
      round.tickets = tickets;
      round.totalPrizeSats = dist.totalSats;
      saveState(state);
    }
  }

  // Status updates based on block height
  if (currentBlock >= round.drawBlock && round.status === 'open') {
    log('\n⚠️  Draw block has been reached! Run "draw" to select the winner.');
  } else if (currentBlock >= round.salesCloseBlock && round.status === 'open') {
    log('\n⚠️  Sales have closed. Waiting for draw block...');
  }

  if (round.winnerPubkey) {
    log(`\nWinner: ${round.winnerPubkey.slice(0, 12)}...`);
    log(`Winning ticket: #${round.winningTicketNumber}`);
    log(`Payout completed: ${round.payoutCompleted}`);
  }
}

async function cmdDraw() {
  const state = loadState();
  if (!state.round) {
    logError('No active lottery round.');
    return;
  }

  const round = state.round;
  const currentBlock = await getCurrentBlockHeight();

  if (currentBlock < round.drawBlock) {
    logError(`Draw block ${round.drawBlock} not yet reached. Current: ${currentBlock} (${round.drawBlock - currentBlock} blocks away)`);
    return;
  }

  if (!round.announcementEventId) {
    logError('No announcement event ID found in state.');
    return;
  }

  log('Draw block reached! Fetching zap receipts...');
  const zapReceipts = await fetchZapReceipts(round.announcementEventId);
  log(`Found ${zapReceipts.length} zap receipts`);

  const tickets = buildTicketEntries(zapReceipts, state.config.minTicketPurchase);
  if (tickets.length === 0) {
    log('No valid tickets found. Round has no participants.');
    round.status = 'completed';
    round.tickets = [];
    saveState(state);
    return;
  }

  round.tickets = tickets;
  const dist = getTicketDistribution(tickets);
  round.totalPrizeSats = dist.totalSats;

  // Publish commitment before revealing winner
  if (!round.commitmentEventId) {
    log('Publishing ticket commitment...');
    const commitment = createTicketCommitment(tickets, round.drawBlock);
    const commitId = await publishCommitment(round, commitment);
    round.commitmentEventId = commitId;
    log(`Commitment published: ${commitId}`);
  }

  // Get draw block hash
  log(`Fetching block hash for draw block ${round.drawBlock}...`);
  const blockHash = await getBlockHash(round.drawBlock);
  log(`Draw block hash: ${blockHash}`);
  round.drawBlockHash = blockHash;

  // Select winner
  round.status = 'drawing';
  const winnerResult = selectWinner(tickets, blockHash);

  if (!winnerResult) {
    logError('Failed to select winner!');
    round.status = 'failed';
    saveState(state);
    return;
  }

  round.winningTicketNumber = winnerResult.ticketNumber;
  round.winnerPubkey = winnerResult.winner.buyerPubkey;

  const prize = calculatePrizeAmount(round.totalPrizeSats, state.config.platformFeePercent);

  log('\n🏆 WINNER SELECTED!');
  log(formatWinnerResult(winnerResult));
  log(`\nPrize pool: ${prize.grossPrize} sats`);
  log(`Platform fee: ${prize.platformFee} sats`);
  log(`Net prize: ${prize.netPrize} sats`);

  // Publish winner announcement
  log('\nPublishing winner announcement...');
  const winnerId = await publishWinnerAnnouncement(round, winnerResult, prize.netPrize);
  round.winnerEventId = winnerId;
  round.status = 'confirming';
  log(`Winner announcement: ${winnerId}`);

  saveState(state);
  log('\nRun "payout" to send the prize to the winner.');
}

async function cmdPayout() {
  const state = loadState();
  if (!state.round) {
    logError('No active lottery round.');
    return;
  }

  const round = state.round;

  if (!round.winnerPubkey) {
    logError('No winner selected yet. Run "draw" first.');
    return;
  }

  if (round.payoutCompleted) {
    log('Payout already completed!');
    log(`Preimage: ${round.payoutPreimage}`);
    return;
  }

  const prize = calculatePrizeAmount(round.totalPrizeSats, state.config.platformFeePercent);

  if (prize.netPrize <= 0) {
    log('Prize is 0 sats. Nothing to pay out.');
    round.status = 'completed';
    round.payoutCompleted = true;
    saveState(state);
    return;
  }

  // Fetch winner's lightning address from their Nostr profile
  const secretKeyBytes = getSecretKeyBytes();
  log(`Fetching lightning address for winner ${round.winnerPubkey.slice(0, 12)}...`);
  const metadata = await fetchUserMetadata(round.winnerPubkey);
  const lud16 = getLightningAddressFromMetadata(metadata);

  if (!lud16) {
    logError(`Winner's profile has no lightning address (lud16). Cannot pay out automatically.`);
    logError(`Winner pubkey: ${round.winnerPubkey}`);
    logError(`Publishing notice asking winner to provide a lightning address.`);

    // Publish a Nostr note asking the winner for their lightning address
    const noLnContent = [
      `⚡ Payout Notice — Round ${round.id}`,
      ``,
      `Congratulations to the winner (nostr:${round.winnerNpub || round.winnerPubkey.slice(0, 12) + '...'})!`,
      ``,
      `We're ready to send your ${prize.netPrize} sat prize, but your Nostr profile doesn't have a lightning address (lud16) set.`,
      ``,
      `To receive your payout, either:`,
      `1. Add a lightning address to your Nostr profile, or`,
      `2. Reply to this note with your lightning address`,
      ``,
      `We'll hold your prize until we can deliver it. ⚡`,
      ``,
      `#nostr-lottery`,
    ].join('\n');

    const noLnEvent: UnsignedEvent = {
      kind: 1,
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ['t', 'nostr-lottery'],
        ['p', round.winnerPubkey],
        ...(round.winnerEventId ? [['e', round.winnerEventId]] : []),
      ],
      content: noLnContent,
      pubkey: MY_HEX_PUBKEY,
    };

    try {
      const signed = finalizeEvent(noLnEvent, secretKeyBytes);
      await publishEvent(signed);
      log(`Published no-LN-address notice: ${signed.id}`);
    } catch (e: any) {
      logError(`Failed to publish no-LN-address notice: ${e.message}`);
    }

    round.status = 'awaiting_ln_address';
    saveState(state);
    return;
  }

  log(`Winner's lightning address: ${lud16}`);
  log(`Sending ${prize.netPrize} sats...`);

  round.status = 'paying';
  saveState(state);

  try {
    const nwcString = getNwcConnectionString();
    const result = await sendPrizeZap(
      lud16,
      prize.netPrize,
      nwcString,
      `🏆 Lottery prize from round ${round.id}! You won ${prize.netPrize} sats!`
    );

    round.payoutPreimage = result.preimage;
    round.payoutCompleted = true;
    round.status = 'completed';
    saveState(state);

    log(`\n✅ PAYOUT SUCCESSFUL!`);
    log(`  Amount: ${prize.netPrize} sats`);
    log(`  To: ${lud16}`);
    log(`  Preimage: ${result.preimage}`);
    log(`\nRound ${round.id} is complete. 🎉`);
  } catch (e: any) {
    logError(`Payout failed: ${e.message}`);
    round.status = 'failed';
    saveState(state);
  }
}

async function cmdAuto(config: LotteryConfig) {
  log('🤖 AUTOMATIC MODE — Full lottery lifecycle');
  log(`Config: blockCadence=${config.blockCadence}, minTicket=${config.minTicketPurchase} sat, fee=${config.platformFeePercent}%`);

  let state = loadState();

  // If no active round, start one
  if (!state.round || state.round.status === 'completed' || state.round.status === 'failed') {
    await cmdStart(config);
    state = loadState();
  }

  if (!state.round) {
    logError('Failed to create lottery round');
    return;
  }

  log(`\nMonitoring round ${state.round.id}...`);
  log(`Press Ctrl+C to stop.\n`);

  // Poll loop
  while (true) {
    try {
      const round = state.round!;
      const currentBlock = await getCurrentBlockHeight();
      const blocksUntilDraw = round.drawBlock - currentBlock;

      log(`Block ${currentBlock} | Draw at ${round.drawBlock} | ${blocksUntilDraw > 0 ? `${blocksUntilDraw} blocks away` : 'DRAW BLOCK REACHED'}`);

      // Update ticket count periodically
      if (round.announcementEventId && round.status === 'open') {
        const zapReceipts = await fetchZapReceipts(round.announcementEventId);
        const tickets = buildTicketEntries(zapReceipts, config.minTicketPurchase);
        const totalTickets = getTotalTickets(tickets);
        const totalSats = tickets.reduce((s, t) => s + t.amountSats, 0);
        round.tickets = tickets;
        round.totalPrizeSats = totalSats;
        log(`  Tickets: ${totalTickets} | Prize pool: ${totalSats} sats | Buyers: ${new Set(tickets.map(t => t.buyerPubkey)).size}`);
      }

      // Check if sales should close
      if (currentBlock >= round.salesCloseBlock && round.status === 'open') {
        log('\n📋 Sales closed! Publishing commitment...');
        round.status = 'closed';

        if (round.tickets.length > 0) {
          const commitment = createTicketCommitment(round.tickets, round.drawBlock);
          const commitId = await publishCommitment(round, commitment);
          round.commitmentEventId = commitId;
          log(`Commitment published: ${commitId}`);
        } else {
          log('No tickets sold. Will check again at draw time.');
        }
        saveState(state);
      }

      // Check if draw block reached
      if (currentBlock >= round.drawBlock && (round.status === 'open' || round.status === 'closed')) {
        log('\n🎯 Draw block reached! Running draw...');
        await cmdDraw();
        state = loadState();

        if (state.round?.winnerPubkey) {
          // Wait a moment, then payout
          log('\nWaiting 10 seconds before payout...');
          await sleep(10_000);
          await cmdPayout();
          state = loadState();
        }

        if (state.round?.status === 'completed') {
          log('\n🎉 Round complete! Starting new round in 60 seconds...');
          await sleep(60_000);

          // Clear state for new round
          state.round = null;
          saveState(state);
          await cmdStart(config);
          state = loadState();
        }
      }

      saveState(state);
    } catch (e: any) {
      logError(`Poll error: ${e.message}`);
    }

    await sleep(AUTO_POLL_INTERVAL_MS);
  }
}

/**
 * tick — Single-step state machine advance.
 * Designed to be called by a cron job every ~10 minutes (or on each new block).
 * Reads state, checks current block, advances one step, saves state, exits.
 * If no round exists, starts a new one.
 * Returns a status string suitable for cron output.
 */
async function cmdTick(config: LotteryConfig): Promise<string> {
  let state = loadState();
  const currentBlock = await getCurrentBlockHeight();

  // If config was passed, update stored config
  if (config.blockCadence !== DEFAULT_LOTTERY_CONFIG.blockCadence) {
    state.config = config;
  }
  const activeConfig = state.config || config;

  // ── No active round → start one ──
  if (!state.round || state.round.status === 'completed' || state.round.status === 'failed') {
    if (state.round?.status === 'completed') {
      log(`Previous round ${state.round.id} completed. Starting new round.`);
    }
    state.round = null;
    saveState(state);
    await cmdStart(activeConfig);
    return `NEW_ROUND_STARTED`;
  }

  const round = state.round;
  const blocksUntilDraw = round.drawBlock - currentBlock;
  const blocksUntilClose = round.salesCloseBlock - currentBlock;

  log(`⏱  Block ${currentBlock} | Round ${round.id} | Status: ${round.status} | Draw in ${Math.max(0, blocksUntilDraw)} blocks`);

  // ── OPEN: Update ticket count, check if sales should close ──
  if (round.status === 'open') {
    // Refresh ticket count
    if (round.announcementEventId) {
      const zapReceipts = await fetchZapReceipts(round.announcementEventId);
      const tickets = buildTicketEntries(zapReceipts, activeConfig.minTicketPurchase);
      const totalTickets = getTotalTickets(tickets);
      const totalSats = tickets.reduce((s, t) => s + t.amountSats, 0);
      round.tickets = tickets;
      round.totalPrizeSats = totalSats;
      const buyers = new Set(tickets.map(t => t.buyerPubkey)).size;
      log(`  🎫 ${totalTickets} tickets | ${totalSats} sats | ${buyers} buyers`);
    }

    // Check if sales should close
    if (currentBlock >= round.salesCloseBlock) {
      log('📋 Sales closed! Publishing commitment...');
      round.status = 'closed';

      if (round.tickets.length > 0) {
        const commitment = createTicketCommitment(round.tickets, round.drawBlock);
        const commitId = await publishCommitment(round, commitment);
        round.commitmentEventId = commitId;
        log(`Commitment published: ${commitId}`);
      } else {
        log('No tickets sold yet.');
      }
      saveState(state);
      return `SALES_CLOSED`;
    }

    // Check if draw block already reached while still open
    if (currentBlock >= round.drawBlock) {
      log('🎯 Draw block reached while still open — running draw...');
      saveState(state);
      await cmdDraw();
      state = loadState();

      if (state.round?.winnerPubkey && !state.round.payoutCompleted) {
        await cmdPayout();
      }
      return `DRAW_AND_PAYOUT`;
    }

    saveState(state);
    return `OPEN_${totalTicketsMsg(round)}`;
  }

  // ── CLOSED: Waiting for draw block ──
  if (round.status === 'closed') {
    if (currentBlock >= round.drawBlock) {
      log('🎯 Draw block reached!');
      await cmdDraw();
      state = loadState();

      if (state.round?.winnerPubkey && !state.round.payoutCompleted) {
        await cmdPayout();
      }
      return `DRAW_AND_PAYOUT`;
    }

    if (blocksUntilDraw <= 12) {
      log(`  ⏳ Within 12 blocks of draw — entering polling mode (checking every 60s)...`);
      while (true) {
        await sleep(60_000);
        const pollBlock = await getCurrentBlockHeight();
        const remaining = round.drawBlock - pollBlock;
        log(`  📡 Poll: block ${pollBlock}, ${Math.max(0, remaining)} blocks to draw`);
        if (pollBlock >= round.drawBlock) {
          log('🎯 Draw block reached!');
          await cmdDraw();
          state = loadState();
          if (state.round?.winnerPubkey && !state.round.payoutCompleted) {
            await cmdPayout();
          }
          return `DRAW_AND_PAYOUT`;
        }
      }
    }

    log(`  Waiting for draw block ${round.drawBlock} (${blocksUntilDraw} blocks away)`);
    return `WAITING_FOR_DRAW`;
  }

  // ── DRAWING / CONFIRMING: Need to finish draw or payout ──
  if (round.status === 'drawing' || round.status === 'confirming') {
    if (round.winnerPubkey && !round.payoutCompleted) {
      log('Winner selected but not paid. Running payout...');
      await cmdPayout();
      return `PAYOUT_SENT`;
    }
    if (!round.winnerPubkey) {
      log('In drawing state but no winner. Re-running draw...');
      await cmdDraw();
      return `REDRAW`;
    }
  }

  // ── PAYING: Retry payout ──
  if (round.status === 'paying') {
    log('Previous payout may have failed. Retrying...');
    await cmdPayout();
    return `PAYOUT_RETRY`;
  }

  return `NOOP_${round.status}`;
}

function totalTicketsMsg(round: LotteryRound): string {
  const total = getTotalTickets(round.tickets);
  return `${total}tickets_${round.totalPrizeSats}sats`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── CLI ──

function printHelp() {
  console.log(`
╔═══════════════════════════════════════════════╗
║   ⚡🎰 Lottery Agent — AI Lottery Runner 🎰⚡  ║
╚═══════════════════════════════════════════════╝

Usage: npx tsx agent/lottery-agent.ts <command> [options]

Commands:
  start         Start a new lottery round (publish announcement)
  status        Check current round status
  draw          Manually trigger draw (if draw block reached)
  payout        Send prize to the winner
  tick          One-shot state machine advance (for cron/heartbeat — starts, monitors, draws, pays, repeats)
  auto          Full automatic mode with polling loop (legacy — prefer tick + cron)

Options:
  --cadence N   Set block cadence (default: 100, use 10 for testing)
  --fee N       Platform fee percentage (default: 0)
  --min-ticket N  Minimum ticket purchase in sats (default: 1)
  --help        Show this help

Examples:
  npx tsx agent/lottery-agent.ts start --cadence 10
  npx tsx agent/lottery-agent.ts tick --cadence 100    # run via cron every ~10 min
  npx tsx agent/lottery-agent.ts status
  npx tsx agent/lottery-agent.ts draw
  npx tsx agent/lottery-agent.ts payout

State is persisted to agent/state.json between runs.
`);
}

function parseArgs(args: string[]): { command: string; config: LotteryConfig } {
  const config: LotteryConfig = { ...DEFAULT_LOTTERY_CONFIG };
  let command = 'help';

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case 'start':
      case 'status':
      case 'draw':
      case 'payout':
      case 'tick':
      case 'auto':
        command = arg;
        break;
      case '--cadence':
        config.blockCadence = parseInt(args[++i], 10);
        break;
      case '--fee':
        config.platformFeePercent = parseInt(args[++i], 10);
        break;
      case '--min-ticket':
        config.minTicketPurchase = parseInt(args[++i], 10);
        break;
      case '--help':
      case '-h':
        command = 'help';
        break;
    }
  }

  return { command, config };
}

async function main() {
  const args = process.argv.slice(2);
  const { command, config } = parseArgs(args);

  switch (command) {
    case 'start':
      await cmdStart(config);
      break;
    case 'status':
      await cmdStatus();
      break;
    case 'draw':
      await cmdDraw();
      break;
    case 'payout':
      await cmdPayout();
      break;
    case 'tick': {
      const result = await cmdTick(config);
      log(`Tick result: ${result}`);
      break;
    }
    case 'auto':
      await cmdAuto(config);
      break;
    case 'help':
    default:
      printHelp();
      break;
  }
}

main().catch((e) => {
  logError(e.message || e);
  process.exit(1);
});
