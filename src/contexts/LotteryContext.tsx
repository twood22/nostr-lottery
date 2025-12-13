import { createContext, useContext, useCallback, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNostr } from '@nostrify/react';
import { useBitcoinBlock, fetchBlockHashAtHeight } from '@/hooks/useBitcoinBlock';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import {
  DEFAULT_LOTTERY_CONFIG,
  calculateLotteryBlocks,
  generateLotteryId,
} from '@/lib/lottery/config';
import { buildTicketEntries, getTotalTickets, getTicketDistribution } from '@/lib/lottery/tickets';
import { selectWinner, calculatePrizeAmount } from '@/lib/lottery/winner';
import type {
  LotteryConfig,
  LotteryStatus,
  TicketEntry,
  WinnerResult,
} from '@/lib/lottery/types';

interface LotteryContextValue {
  // Configuration
  config: LotteryConfig;
  updateConfig: (config: Partial<LotteryConfig>) => void;

  // Bitcoin block state
  currentBlockHeight: number | undefined;
  isLoadingBlock: boolean;

  // Current lottery round info
  currentRound: {
    id: string;
    startBlock: number;
    salesCloseBlock: number;
    drawBlock: number;
    payoutBlock: number;
    blocksUntilSalesClose: number;
    blocksUntilDraw: number;
    blocksUntilPayout: number;
    status: LotteryStatus;
  } | null;

  // Ticket data
  tickets: TicketEntry[];
  totalTickets: number;
  totalPrizeSats: number;
  uniqueBuyers: number;
  isLoadingTickets: boolean;

  // Winner data
  winnerResult: WinnerResult | null;
  drawBlockHash: string | null;

  // Active lottery note (the one being zapped)
  lotteryNoteId: string | null;
  lotteryNotePubkey: string | null;
  setLotteryNote: (eventId: string, pubkey: string) => void;

  // Actions
  refreshTickets: () => Promise<void>;
  refreshBlock: () => Promise<void>;
}

const LotteryContext = createContext<LotteryContextValue | null>(null);

interface LotteryProviderProps {
  children: ReactNode;
  /** The pubkey of the lottery operator (whose notes receive zaps) */
  operatorPubkey?: string;
  /** Initial configuration overrides */
  initialConfig?: Partial<LotteryConfig>;
}

export function LotteryProvider({
  children,
  operatorPubkey,
  initialConfig,
}: LotteryProviderProps) {
  const { nostr } = useNostr();

  // Configuration state
  const [config, setConfig] = useLocalStorage<LotteryConfig>(
    'lottery:config',
    { ...DEFAULT_LOTTERY_CONFIG, ...initialConfig }
  );

  // Active lottery note being zapped
  const [lotteryNoteId, setLotteryNoteId] = useLocalStorage<string | null>(
    'lottery:activeNoteId',
    null
  );
  const [lotteryNotePubkey, setLotteryNotePubkey] = useLocalStorage<string | null>(
    'lottery:activeNotePubkey',
    operatorPubkey ?? null
  );

  // Bitcoin block monitoring
  const { height: currentBlockHeight, isLoading: isLoadingBlock, refetch: refetchBlock } = useBitcoinBlock({
    pollingInterval: 30000, // 30 seconds
  });

  // Calculate current round info
  const currentRound = currentBlockHeight
    ? (() => {
        const blocks = calculateLotteryBlocks(currentBlockHeight, config);
        let status: LotteryStatus = 'pending';

        if (currentBlockHeight >= blocks.payoutBlock) {
          status = 'completed';
        } else if (currentBlockHeight >= blocks.drawBlock + config.confirmationsRequired) {
          status = 'paying';
        } else if (currentBlockHeight >= blocks.drawBlock) {
          status = 'confirming';
        } else if (currentBlockHeight >= blocks.salesCloseBlock) {
          status = 'closed';
        } else if (lotteryNoteId) {
          status = 'open';
        }

        return {
          id: generateLotteryId(blocks.drawBlock),
          startBlock: blocks.currentRoundStart,
          salesCloseBlock: blocks.salesCloseBlock,
          drawBlock: blocks.drawBlock,
          payoutBlock: blocks.payoutBlock,
          blocksUntilSalesClose: blocks.blocksUntilSalesClose,
          blocksUntilDraw: blocks.blocksUntilDraw,
          blocksUntilPayout: blocks.blocksUntilPayout,
          status,
        };
      })()
    : null;

  // Fetch zap receipts for the lottery note
  const {
    data: zapReceipts = [],
    isLoading: isLoadingTickets,
    refetch: refetchTickets,
  } = useQuery({
    queryKey: ['lottery', 'zaps', lotteryNoteId],
    queryFn: async (c) => {
      if (!lotteryNoteId) return [];

      const signal = AbortSignal.any([c.signal, AbortSignal.timeout(10000)]);

      // Query for zap receipts (kind 9735) targeting our lottery note
      const events = await nostr.query(
        [{ kinds: [9735], '#e': [lotteryNoteId] }],
        { signal }
      );

      return events;
    },
    enabled: !!lotteryNoteId,
    refetchInterval: 30000, // Refresh every 30 seconds
    staleTime: 10000,
  });

  // Build ticket entries from zap receipts
  const tickets = buildTicketEntries(zapReceipts, config.minTicketPurchase);
  const totalTickets = getTotalTickets(tickets);
  const distribution = getTicketDistribution(tickets);
  const prizeCalc = calculatePrizeAmount(distribution.totalSats, config.platformFeePercent);

  // Fetch draw block hash when available
  const {
    data: drawBlockHash,
  } = useQuery({
    queryKey: ['lottery', 'drawBlockHash', currentRound?.drawBlock],
    queryFn: async () => {
      if (!currentRound?.drawBlock) return null;
      return fetchBlockHashAtHeight(currentRound.drawBlock);
    },
    enabled: !!currentRound && currentBlockHeight !== undefined && currentBlockHeight >= currentRound.drawBlock,
    staleTime: Infinity, // Block hash never changes
  });

  // Calculate winner when we have the draw block hash
  const winnerResult = drawBlockHash && tickets.length > 0
    ? selectWinner(tickets, drawBlockHash)
    : null;

  // Update config
  const updateConfig = useCallback((updates: Partial<LotteryConfig>) => {
    setConfig((prev) => ({ ...prev, ...updates }));
  }, [setConfig]);

  // Set active lottery note
  const setLotteryNote = useCallback((eventId: string, pubkey: string) => {
    setLotteryNoteId(eventId);
    setLotteryNotePubkey(pubkey);
  }, [setLotteryNoteId, setLotteryNotePubkey]);

  // Refresh functions
  const refreshTickets = useCallback(async () => {
    await refetchTickets();
  }, [refetchTickets]);

  const refreshBlock = useCallback(async () => {
    await refetchBlock();
  }, [refetchBlock]);

  const value: LotteryContextValue = {
    config,
    updateConfig,
    currentBlockHeight,
    isLoadingBlock,
    currentRound,
    tickets,
    totalTickets,
    totalPrizeSats: prizeCalc.netPrize,
    uniqueBuyers: distribution.uniqueBuyers,
    isLoadingTickets,
    winnerResult,
    drawBlockHash: drawBlockHash ?? null,
    lotteryNoteId,
    lotteryNotePubkey,
    setLotteryNote,
    refreshTickets,
    refreshBlock,
  };

  return (
    <LotteryContext.Provider value={value}>
      {children}
    </LotteryContext.Provider>
  );
}

export function useLottery() {
  const context = useContext(LotteryContext);
  if (!context) {
    throw new Error('useLottery must be used within a LotteryProvider');
  }
  return context;
}
