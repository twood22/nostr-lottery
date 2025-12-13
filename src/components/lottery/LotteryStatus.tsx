import { useLottery } from '@/contexts/LotteryContext';
import { estimateTimeToBlock } from '@/lib/lottery/config';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Clock, Zap, Trophy, Bitcoin, Users, Ticket } from 'lucide-react';

const statusColors: Record<string, string> = {
  pending: 'bg-gray-500',
  open: 'bg-green-500',
  closed: 'bg-yellow-500',
  drawing: 'bg-blue-500',
  confirming: 'bg-purple-500',
  paying: 'bg-orange-500',
  completed: 'bg-emerald-500',
  failed: 'bg-red-500',
};

const statusLabels: Record<string, string> = {
  pending: 'Waiting to Start',
  open: 'Accepting Tickets',
  closed: 'Sales Closed',
  drawing: 'Drawing Winner',
  confirming: 'Confirming',
  paying: 'Sending Prize',
  completed: 'Completed',
  failed: 'Failed',
};

export function LotteryStatus() {
  const {
    currentBlockHeight,
    isLoadingBlock,
    currentRound,
    totalTickets,
    totalPrizeSats,
    uniqueBuyers,
  } = useLottery();

  if (isLoadingBlock || !currentRound) {
    return (
      <Card className="w-full">
        <CardHeader>
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-64" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-16 w-full" />
        </CardContent>
      </Card>
    );
  }

  const timeToSalesClose = estimateTimeToBlock(currentRound.blocksUntilSalesClose);
  const timeToDrawBlock = estimateTimeToBlock(currentRound.blocksUntilDraw);

  // Calculate progress through the round
  const totalBlocksInRound = currentRound.drawBlock - currentRound.startBlock;
  const blocksElapsed = currentBlockHeight! - currentRound.startBlock;
  const progressPercent = Math.min(100, (blocksElapsed / totalBlocksInRound) * 100);

  return (
    <Card className="w-full overflow-hidden">
      <div className={`h-2 ${statusColors[currentRound.status]}`} />
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Bitcoin className="h-5 w-5 text-orange-500" />
              Lightning Lottery
            </CardTitle>
            <CardDescription>
              Round #{currentRound.drawBlock}
            </CardDescription>
          </div>
          <Badge
            variant="secondary"
            className={`${statusColors[currentRound.status]} text-white`}
          >
            {statusLabels[currentRound.status]}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Prize Pool */}
        <div className="text-center p-6 bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/20 dark:to-orange-950/20 rounded-xl border border-amber-200/50 dark:border-amber-800/50">
          <div className="flex items-center justify-center gap-2 text-amber-600 dark:text-amber-400 mb-2">
            <Trophy className="h-5 w-5" />
            <span className="text-sm font-medium uppercase tracking-wide">Prize Pool</span>
          </div>
          <div className="text-4xl font-bold text-amber-600 dark:text-amber-400">
            {totalPrizeSats.toLocaleString()} <span className="text-2xl">sats</span>
          </div>
          <div className="mt-2 text-sm text-muted-foreground">
            {(totalPrizeSats / 100000000).toFixed(8)} BTC
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-3 gap-4">
          <div className="text-center p-4 bg-muted/50 rounded-lg">
            <Ticket className="h-5 w-5 mx-auto mb-2 text-blue-500" />
            <div className="text-2xl font-bold">{totalTickets.toLocaleString()}</div>
            <div className="text-xs text-muted-foreground">Total Tickets</div>
          </div>
          <div className="text-center p-4 bg-muted/50 rounded-lg">
            <Users className="h-5 w-5 mx-auto mb-2 text-green-500" />
            <div className="text-2xl font-bold">{uniqueBuyers}</div>
            <div className="text-xs text-muted-foreground">Participants</div>
          </div>
          <div className="text-center p-4 bg-muted/50 rounded-lg">
            <Bitcoin className="h-5 w-5 mx-auto mb-2 text-orange-500" />
            <div className="text-2xl font-bold">{currentBlockHeight?.toLocaleString()}</div>
            <div className="text-xs text-muted-foreground">Current Block</div>
          </div>
        </div>

        {/* Progress */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Round Progress</span>
            <span className="font-medium">{progressPercent.toFixed(0)}%</span>
          </div>
          <Progress value={progressPercent} className="h-2" />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Block {currentRound.startBlock}</span>
            <span>Draw Block {currentRound.drawBlock}</span>
          </div>
        </div>

        {/* Countdown */}
        {currentRound.status === 'open' && (
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 bg-yellow-50 dark:bg-yellow-950/20 rounded-lg border border-yellow-200/50 dark:border-yellow-800/50">
              <div className="flex items-center gap-2 text-yellow-600 dark:text-yellow-400 mb-1">
                <Clock className="h-4 w-4" />
                <span className="text-xs font-medium">Sales Close</span>
              </div>
              <div className="text-lg font-bold">{currentRound.blocksUntilSalesClose} blocks</div>
              <div className="text-xs text-muted-foreground">{timeToSalesClose.formatted}</div>
            </div>
            <div className="p-4 bg-blue-50 dark:bg-blue-950/20 rounded-lg border border-blue-200/50 dark:border-blue-800/50">
              <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400 mb-1">
                <Zap className="h-4 w-4" />
                <span className="text-xs font-medium">Draw Block</span>
              </div>
              <div className="text-lg font-bold">{currentRound.blocksUntilDraw} blocks</div>
              <div className="text-xs text-muted-foreground">{timeToDrawBlock.formatted}</div>
            </div>
          </div>
        )}

        {currentRound.status === 'closed' && (
          <div className="p-4 bg-yellow-50 dark:bg-yellow-950/20 rounded-lg border border-yellow-200/50 dark:border-yellow-800/50 text-center">
            <Clock className="h-6 w-6 mx-auto mb-2 text-yellow-600 dark:text-yellow-400" />
            <div className="text-sm font-medium">Waiting for draw block...</div>
            <div className="text-lg font-bold">{currentRound.blocksUntilDraw} blocks to go</div>
            <div className="text-xs text-muted-foreground">{timeToDrawBlock.formatted}</div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
