import { useLottery } from '@/contexts/LotteryContext';
import { useAuthor } from '@/hooks/useAuthor';
import { genUserName } from '@/lib/genUserName';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Trophy, Check, Copy, ExternalLink, Bitcoin, Ticket, Calculator } from 'lucide-react';
import { useState } from 'react';
import { useToast } from '@/hooks/useToast';

export function WinnerDisplay() {
  const { winnerResult, drawBlockHash, currentRound, totalPrizeSats, totalTickets } = useLottery();
  const { toast } = useToast();
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const winner = winnerResult?.winner;
  const author = useAuthor(winner?.buyerPubkey);
  const metadata = author.data?.metadata;
  const displayName = metadata?.name || (winner ? genUserName(winner.buyerPubkey) : '');
  const avatar = metadata?.picture;

  const copyToClipboard = async (text: string, field: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
    toast({
      title: 'Copied!',
      description: `${field} copied to clipboard`,
    });
  };

  if (!currentRound) {
    return null;
  }

  // Not yet drawn
  if (!drawBlockHash) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-amber-500" />
            Winner
          </CardTitle>
          <CardDescription>
            Waiting for draw block {currentRound.drawBlock}...
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-muted animate-pulse flex items-center justify-center">
              <Trophy className="h-8 w-8 opacity-50" />
            </div>
            <p>Winner will be determined by Bitcoin block hash</p>
            <p className="text-sm mt-2">
              {currentRound.blocksUntilDraw} blocks remaining
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Drawn but no winner (no tickets)
  if (!winnerResult) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-amber-500" />
            No Winner
          </CardTitle>
          <CardDescription>
            Draw block reached but no tickets were sold
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <p>The lottery had no participants.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full overflow-hidden">
      <div className="h-2 bg-gradient-to-r from-amber-400 to-orange-500" />
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Trophy className="h-5 w-5 text-amber-500" />
              Winner Announced!
            </CardTitle>
            <CardDescription>
              Lottery #{currentRound.drawBlock}
            </CardDescription>
          </div>
          <Badge className="bg-amber-500 text-white text-lg px-4 py-2">
            {totalPrizeSats.toLocaleString()} sats
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Winner Profile */}
        <div className="flex items-center gap-4 p-4 bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/20 dark:to-orange-950/20 rounded-xl border border-amber-200/50 dark:border-amber-800/50">
          <Avatar className="h-16 w-16 ring-4 ring-amber-400">
            <AvatarImage src={avatar} alt={displayName} />
            <AvatarFallback className="text-xl">
              {displayName.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1">
            <div className="text-xl font-bold">{displayName}</div>
            <div className="text-sm text-muted-foreground font-mono">
              {winner?.buyerPubkey.slice(0, 16)}...
            </div>
            {metadata?.lud16 && (
              <div className="text-sm text-amber-600 dark:text-amber-400 mt-1">
                {metadata.lud16}
              </div>
            )}
          </div>
          <div className="text-right">
            <div className="text-3xl font-bold text-amber-600 dark:text-amber-400">
              #{winnerResult.ticketNumber}
            </div>
            <div className="text-sm text-muted-foreground">Winning Ticket</div>
          </div>
        </div>

        <Separator />

        {/* Verification Data */}
        <div className="space-y-4">
          <h4 className="font-semibold flex items-center gap-2">
            <Check className="h-4 w-4 text-green-500" />
            Verification Data
          </h4>

          <div className="space-y-3">
            {/* Block Hash */}
            <div className="p-3 bg-muted/50 rounded-lg">
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                <Bitcoin className="h-4 w-4" />
                Block Hash (Block {currentRound.drawBlock})
              </div>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-xs font-mono break-all bg-background p-2 rounded">
                  {drawBlockHash}
                </code>
                <Button
                  variant="ghost"
                  size="icon"
                  className="shrink-0"
                  onClick={() => copyToClipboard(drawBlockHash, 'Block hash')}
                >
                  {copiedField === 'Block hash' ? (
                    <Check className="h-4 w-4 text-green-500" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="shrink-0"
                  asChild
                >
                  <a
                    href={`https://mempool.space/block/${drawBlockHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </Button>
              </div>
            </div>

            {/* Calculation */}
            <div className="p-3 bg-muted/50 rounded-lg">
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                <Calculator className="h-4 w-4" />
                Winner Calculation
              </div>
              <code className="text-xs font-mono break-all bg-background p-2 rounded block">
                {winnerResult.verification.winningTicketCalc}
              </code>
            </div>

            {/* Total Tickets */}
            <div className="p-3 bg-muted/50 rounded-lg">
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                <Ticket className="h-4 w-4" />
                Total Tickets
              </div>
              <div className="font-mono">{totalTickets.toLocaleString()}</div>
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            Anyone can verify this result by fetching the zap receipts, sorting by payment_hash,
            and calculating (block_hash % total_tickets) + 1.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
