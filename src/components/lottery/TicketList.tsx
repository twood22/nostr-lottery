import { useLottery } from '@/contexts/LotteryContext';
import { useAuthor } from '@/hooks/useAuthor';
import { genUserName } from '@/lib/genUserName';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Ticket, Trophy } from 'lucide-react';
import type { TicketEntry } from '@/lib/lottery/types';

interface TicketRowProps {
  entry: TicketEntry;
  isWinner?: boolean;
  winningTicket?: number;
}

function TicketRow({ entry, isWinner, winningTicket }: TicketRowProps) {
  const author = useAuthor(entry.buyerPubkey);
  const metadata = author.data?.metadata;
  const displayName = metadata?.name || genUserName(entry.buyerPubkey);
  const avatar = metadata?.picture;

  return (
    <div
      className={`flex items-center gap-3 p-3 rounded-lg transition-colors ${
        isWinner
          ? 'bg-amber-100 dark:bg-amber-900/30 border-2 border-amber-500'
          : 'bg-muted/50 hover:bg-muted'
      }`}
    >
      <Avatar className="h-10 w-10">
        <AvatarImage src={avatar} alt={displayName} />
        <AvatarFallback>{displayName.slice(0, 2).toUpperCase()}</AvatarFallback>
      </Avatar>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium truncate">{displayName}</span>
          {isWinner && (
            <Badge className="bg-amber-500 text-white">
              <Trophy className="h-3 w-3 mr-1" />
              Winner!
            </Badge>
          )}
        </div>
        <div className="text-xs text-muted-foreground truncate">
          {entry.buyerPubkey.slice(0, 8)}...{entry.buyerPubkey.slice(-8)}
        </div>
      </div>

      <div className="text-right">
        <div className="font-bold text-lg">{entry.amountSats.toLocaleString()}</div>
        <div className="text-xs text-muted-foreground">sats</div>
      </div>

      <div className="text-right min-w-[100px]">
        <div className="flex items-center gap-1 justify-end">
          <Ticket className="h-4 w-4 text-muted-foreground" />
          <span className="font-mono text-sm">
            #{entry.ticketStart.toLocaleString()}
            {entry.ticketEnd !== entry.ticketStart && (
              <>-{entry.ticketEnd.toLocaleString()}</>
            )}
          </span>
        </div>
        {isWinner && winningTicket && (
          <div className="text-xs text-amber-600 dark:text-amber-400 font-medium">
            Winning: #{winningTicket}
          </div>
        )}
      </div>
    </div>
  );
}

function TicketRowSkeleton() {
  return (
    <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
      <Skeleton className="h-10 w-10 rounded-full" />
      <div className="flex-1">
        <Skeleton className="h-4 w-32 mb-1" />
        <Skeleton className="h-3 w-24" />
      </div>
      <Skeleton className="h-6 w-16" />
      <Skeleton className="h-4 w-20" />
    </div>
  );
}

export function TicketList() {
  const { tickets, isLoadingTickets, totalTickets, winnerResult } = useLottery();

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Ticket className="h-5 w-5" />
              Ticket Assignments
            </CardTitle>
            <CardDescription>
              Sorted by payment hash (deterministic ordering)
            </CardDescription>
          </div>
          <Badge variant="outline" className="text-lg px-3 py-1">
            {totalTickets.toLocaleString()} tickets
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        {isLoadingTickets ? (
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
              <TicketRowSkeleton key={i} />
            ))}
          </div>
        ) : tickets.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Ticket className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p className="text-lg font-medium">No tickets yet</p>
            <p className="text-sm">Zap the lottery note to buy tickets!</p>
          </div>
        ) : (
          <ScrollArea className="h-[400px] pr-4">
            <div className="space-y-2">
              {tickets.map((entry) => {
                const isWinner = winnerResult
                  ? entry.buyerPubkey === winnerResult.winner.buyerPubkey &&
                    entry.ticketStart <= winnerResult.ticketNumber &&
                    entry.ticketEnd >= winnerResult.ticketNumber
                  : false;

                return (
                  <TicketRow
                    key={entry.paymentHash}
                    entry={entry}
                    isWinner={isWinner}
                    winningTicket={winnerResult?.ticketNumber}
                  />
                );
              })}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
