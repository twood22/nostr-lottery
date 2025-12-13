import { useCallback } from 'react';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNWC } from '@/hooks/useNWCContext';
import { useToast } from '@/hooks/useToast';
import { useLottery } from '@/contexts/LotteryContext';
import { LOTTERY_TAG, LOTTERY_COMMITMENT_KIND } from '@/lib/lottery/config';
import { createTicketCommitment } from '@/lib/lottery/tickets';
import { sendPrizeZap } from '@/lib/lottery/payout';
import type { WinnerResult } from '@/lib/lottery/types';

/**
 * Hook for lottery operator actions:
 * - Publishing lottery announcements
 * - Publishing ticket commitments
 * - Publishing winner announcements
 * - Sending prize payouts
 */
export function useLotteryOperations() {
  const { user } = useCurrentUser();
  const { toast } = useToast();
  const { mutateAsync: publishEvent } = useNostrPublish();
  const { getActiveConnection, connections } = useNWC();
  const {
    currentRound,
    tickets,
    totalTickets,
    totalPrizeSats,
    setLotteryNote,
  } = useLottery();

  /**
   * Publish a lottery announcement note
   * Users will zap this note to buy tickets
   */
  const publishLotteryAnnouncement = useCallback(async () => {
    if (!user) {
      toast({
        title: 'Login required',
        description: 'You must be logged in to create a lottery.',
        variant: 'destructive',
      });
      return null;
    }

    if (!currentRound) {
      toast({
        title: 'Block data not ready',
        description: 'Waiting for Bitcoin block data.',
        variant: 'destructive',
      });
      return null;
    }

    const content = [
      `Lightning Lottery Round #${currentRound.drawBlock}`,
      '',
      `Zap this note to buy tickets!`,
      `1 sat = 1 ticket`,
      '',
      `Draw Block: ${currentRound.drawBlock}`,
      `Sales Close: Block ${currentRound.salesCloseBlock}`,
      `Payout: Block ${currentRound.payoutBlock}`,
      '',
      `Blocks until sales close: ${currentRound.blocksUntilSalesClose}`,
      '',
      `Winner determined by Bitcoin block hash - provably fair!`,
      '',
      `#${LOTTERY_TAG} #bitcoin #lightning`,
    ].join('\n');

    try {
      const event = await publishEvent({
        kind: 1,
        content,
        tags: [
          ['t', LOTTERY_TAG],
          ['t', 'bitcoin'],
          ['t', 'lightning'],
          ['draw_block', currentRound.drawBlock.toString()],
          ['sales_close_block', currentRound.salesCloseBlock.toString()],
        ],
      });

      // Set this as the active lottery note
      setLotteryNote(event.id, user.pubkey);

      toast({
        title: 'Lottery announced!',
        description: 'Your lottery note has been published. Share it to get participants!',
      });

      return event;
    } catch (error) {
      console.error('Failed to publish lottery announcement:', error);
      toast({
        title: 'Failed to publish',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
      return null;
    }
  }, [user, currentRound, publishEvent, setLotteryNote, toast]);

  /**
   * Publish a ticket commitment before the draw block
   * This proves the ticket assignments were determined before the randomness was known
   */
  const publishTicketCommitment = useCallback(async () => {
    if (!user) {
      toast({
        title: 'Login required',
        description: 'You must be logged in to publish commitment.',
        variant: 'destructive',
      });
      return null;
    }

    if (!currentRound) {
      toast({
        title: 'No active lottery',
        description: 'There is no active lottery round.',
        variant: 'destructive',
      });
      return null;
    }

    if (tickets.length === 0) {
      toast({
        title: 'No tickets',
        description: 'There are no tickets to commit.',
        variant: 'destructive',
      });
      return null;
    }

    const commitment = createTicketCommitment(tickets, currentRound.drawBlock);

    const content = [
      `Ticket Commitment for Lottery #${currentRound.drawBlock}`,
      '',
      `Total Tickets: ${commitment.totalTickets}`,
      `Commitment Hash: ${commitment.ticketHash}`,
      '',
      `This commitment was published before block ${currentRound.drawBlock} was mined.`,
      `Anyone can verify the winner by checking the ticket assignments below.`,
    ].join('\n');

    try {
      const event = await publishEvent({
        kind: LOTTERY_COMMITMENT_KIND,
        content,
        tags: [
          ['d', `lottery-commitment-${currentRound.drawBlock}`],
          ['t', LOTTERY_TAG],
          ['draw_block', currentRound.drawBlock.toString()],
          ['total_tickets', commitment.totalTickets.toString()],
          ['ticket_hash', commitment.ticketHash],
          ['ticket_assignments', commitment.ticketAssignments],
          ['alt', `Lottery ticket commitment for block ${currentRound.drawBlock}`],
        ],
      });

      toast({
        title: 'Commitment published!',
        description: 'Ticket assignments are now provably committed.',
      });

      return event;
    } catch (error) {
      console.error('Failed to publish commitment:', error);
      toast({
        title: 'Failed to publish',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
      return null;
    }
  }, [user, currentRound, tickets, publishEvent, toast]);

  /**
   * Publish the winner announcement
   */
  const publishWinnerAnnouncement = useCallback(async (
    winnerResult: WinnerResult,
    payoutPreimage?: string
  ) => {
    if (!user) {
      toast({
        title: 'Login required',
        description: 'You must be logged in to announce winner.',
        variant: 'destructive',
      });
      return null;
    }

    if (!currentRound) {
      toast({
        title: 'No active lottery',
        description: 'There is no active lottery round.',
        variant: 'destructive',
      });
      return null;
    }

    const content = [
      `Lottery #${currentRound.drawBlock} Winner Announced!`,
      '',
      `Winning Ticket: #${winnerResult.ticketNumber}`,
      `Winner: nostr:${winnerResult.winner.buyerPubkey}`,
      `Prize: ${totalPrizeSats} sats`,
      '',
      `Verification:`,
      `Block Hash: ${winnerResult.blockHash}`,
      `Calculation: ${winnerResult.verification.winningTicketCalc}`,
      '',
      payoutPreimage ? `Payment Preimage: ${payoutPreimage}` : 'Payout pending...',
      '',
      `#${LOTTERY_TAG} #bitcoin #lightning`,
    ].join('\n');

    try {
      const tags: string[][] = [
        ['t', LOTTERY_TAG],
        ['p', winnerResult.winner.buyerPubkey],
        ['draw_block', currentRound.drawBlock.toString()],
        ['block_hash', winnerResult.blockHash],
        ['winning_ticket', winnerResult.ticketNumber.toString()],
        ['total_tickets', totalTickets.toString()],
        ['prize_sats', totalPrizeSats.toString()],
      ];

      if (payoutPreimage) {
        tags.push(['preimage', payoutPreimage]);
      }

      const event = await publishEvent({
        kind: 1,
        content,
        tags,
      });

      toast({
        title: 'Winner announced!',
        description: `Ticket #${winnerResult.ticketNumber} wins ${totalPrizeSats} sats!`,
      });

      return event;
    } catch (error) {
      console.error('Failed to publish winner:', error);
      toast({
        title: 'Failed to publish',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
      return null;
    }
  }, [user, currentRound, totalTickets, totalPrizeSats, publishEvent, toast]);

  /**
   * Send the prize to the winner
   */
  const sendPrize = useCallback(async (
    winnerPubkey: string,
    winnerLud16: string,
    amountSats: number
  ): Promise<{ preimage: string } | null> => {
    const connection = getActiveConnection();

    if (!connection?.connectionString) {
      toast({
        title: 'No wallet connected',
        description: 'Please connect a wallet via NWC to send the prize.',
        variant: 'destructive',
      });
      return null;
    }

    try {
      toast({
        title: 'Sending prize...',
        description: `Sending ${amountSats} sats to winner...`,
      });

      const result = await sendPrizeZap(
        winnerLud16,
        amountSats,
        connection.connectionString,
        `Lottery prize! You won ${amountSats} sats!`
      );

      toast({
        title: 'Prize sent!',
        description: `Successfully sent ${amountSats} sats to the winner.`,
      });

      return { preimage: result.preimage };
    } catch (error) {
      console.error('Failed to send prize:', error);
      toast({
        title: 'Prize payment failed',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
      return null;
    }
  }, [getActiveConnection, toast]);

  return {
    publishLotteryAnnouncement,
    publishTicketCommitment,
    publishWinnerAnnouncement,
    sendPrize,
    hasWalletConnected: connections.length > 0,
  };
}
