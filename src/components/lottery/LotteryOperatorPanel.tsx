import { useState } from 'react';
import { useLottery } from '@/contexts/LotteryContext';
import { useLotteryOperations } from '@/hooks/useLotteryOperations';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useAuthor } from '@/hooks/useAuthor';
import { getLightningAddressFromMetadata } from '@/lib/lottery/payout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Megaphone,
  FileCheck,
  Trophy,
  Send,
  Settings,
  Wallet,
  AlertCircle,
  Loader2,
  Check,
} from 'lucide-react';

export function LotteryOperatorPanel() {
  const { user } = useCurrentUser();
  const {
    config,
    updateConfig,
    currentRound,
    tickets,
    totalPrizeSats,
    winnerResult,
    lotteryNoteId,
  } = useLottery();
  const {
    publishLotteryAnnouncement,
    publishTicketCommitment,
    publishWinnerAnnouncement,
    sendPrize,
    hasWalletConnected,
  } = useLotteryOperations();

  const [isPublishing, setIsPublishing] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);
  const [isAnnouncing, setIsAnnouncing] = useState(false);
  const [isPaying, setIsPaying] = useState(false);
  const [blockCadenceInput, setBlockCadenceInput] = useState(config.blockCadence.toString());

  // Get winner's lightning address
  const winnerAuthor = useAuthor(winnerResult?.winner.buyerPubkey);
  const winnerLud16 = getLightningAddressFromMetadata(winnerAuthor.data?.metadata);

  const handlePublishAnnouncement = async () => {
    setIsPublishing(true);
    try {
      await publishLotteryAnnouncement();
    } finally {
      setIsPublishing(false);
    }
  };

  const handlePublishCommitment = async () => {
    setIsCommitting(true);
    try {
      await publishTicketCommitment();
    } finally {
      setIsCommitting(false);
    }
  };

  const handleAnnounceWinner = async () => {
    if (!winnerResult) return;
    setIsAnnouncing(true);
    try {
      await publishWinnerAnnouncement(winnerResult);
    } finally {
      setIsAnnouncing(false);
    }
  };

  const handleSendPrize = async () => {
    if (!winnerResult || !winnerLud16) return;
    setIsPaying(true);
    try {
      const result = await sendPrize(
        winnerResult.winner.buyerPubkey,
        winnerLud16,
        totalPrizeSats
      );
      if (result) {
        // Re-announce with preimage
        await publishWinnerAnnouncement(winnerResult, result.preimage);
      }
    } finally {
      setIsPaying(false);
    }
  };

  const handleUpdateCadence = () => {
    const newCadence = parseInt(blockCadenceInput, 10);
    if (!isNaN(newCadence) && newCadence > 0) {
      updateConfig({ blockCadence: newCadence });
    }
  };

  if (!user) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Operator Panel
          </CardTitle>
          <CardDescription>Login required to manage lottery</CardDescription>
        </CardHeader>
        <CardContent>
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Please log in with a Nostr account to operate a lottery.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Settings className="h-5 w-5" />
          Operator Panel
        </CardTitle>
        <CardDescription>
          Manage your lottery round
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Configuration */}
        <div className="space-y-4">
          <h4 className="font-semibold">Configuration</h4>
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <Label htmlFor="blockCadence">Block Cadence</Label>
              <Input
                id="blockCadence"
                type="number"
                value={blockCadenceInput}
                onChange={(e) => setBlockCadenceInput(e.target.value)}
                placeholder="100"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Lottery runs every N blocks
              </p>
            </div>
            <Button variant="outline" onClick={handleUpdateCadence}>
              Update
            </Button>
          </div>
        </div>

        <Separator />

        {/* Wallet Status */}
        <div className="space-y-2">
          <h4 className="font-semibold flex items-center gap-2">
            <Wallet className="h-4 w-4" />
            Wallet Status
          </h4>
          {hasWalletConnected ? (
            <Badge variant="default" className="bg-green-500">
              <Check className="h-3 w-3 mr-1" />
              NWC Connected
            </Badge>
          ) : (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Connect a wallet via NWC to send prizes. Go to settings to add a wallet.
              </AlertDescription>
            </Alert>
          )}
        </div>

        <Separator />

        {/* Actions */}
        <div className="space-y-4">
          <h4 className="font-semibold">Actions</h4>

          {/* Step 1: Publish Announcement */}
          <div className="p-4 border rounded-lg space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold">
                  1
                </div>
                <span className="font-medium">Publish Lottery Note</span>
              </div>
              {lotteryNoteId && (
                <Badge variant="secondary">
                  <Check className="h-3 w-3 mr-1" />
                  Published
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              Create a note that users will zap to buy tickets.
            </p>
            <Button
              onClick={handlePublishAnnouncement}
              disabled={isPublishing || !!lotteryNoteId}
              className="w-full"
            >
              {isPublishing ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Megaphone className="h-4 w-4 mr-2" />
              )}
              {lotteryNoteId ? 'Already Published' : 'Publish Announcement'}
            </Button>
          </div>

          {/* Step 2: Publish Commitment */}
          <div className="p-4 border rounded-lg space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold">
                  2
                </div>
                <span className="font-medium">Publish Commitment</span>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              Commit ticket assignments before the draw block (for verifiability).
            </p>
            <Button
              onClick={handlePublishCommitment}
              disabled={isCommitting || tickets.length === 0 || !currentRound || currentRound.status !== 'closed'}
              variant="outline"
              className="w-full"
            >
              {isCommitting ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <FileCheck className="h-4 w-4 mr-2" />
              )}
              Publish Commitment ({tickets.length} entries)
            </Button>
          </div>

          {/* Step 3: Announce Winner */}
          <div className="p-4 border rounded-lg space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold">
                  3
                </div>
                <span className="font-medium">Announce Winner</span>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              Publish the winner once the draw block is mined.
            </p>
            <Button
              onClick={handleAnnounceWinner}
              disabled={isAnnouncing || !winnerResult}
              variant="outline"
              className="w-full"
            >
              {isAnnouncing ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Trophy className="h-4 w-4 mr-2" />
              )}
              {winnerResult
                ? `Announce Winner (Ticket #${winnerResult.ticketNumber})`
                : 'Waiting for draw...'}
            </Button>
          </div>

          {/* Step 4: Send Prize */}
          <div className="p-4 border rounded-lg space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold">
                  4
                </div>
                <span className="font-medium">Send Prize</span>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              Send the prize to the winner via Lightning.
            </p>
            {winnerResult && !winnerLud16 && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Winner doesn't have a lightning address (lud16) in their profile.
                </AlertDescription>
              </Alert>
            )}
            <Button
              onClick={handleSendPrize}
              disabled={
                isPaying ||
                !winnerResult ||
                !winnerLud16 ||
                !hasWalletConnected ||
                totalPrizeSats === 0
              }
              className="w-full"
            >
              {isPaying ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Send className="h-4 w-4 mr-2" />
              )}
              Send {totalPrizeSats.toLocaleString()} sats
              {winnerLud16 && ` to ${winnerLud16}`}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
