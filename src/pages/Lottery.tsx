import { useSeoMeta } from '@unhead/react';
import { LotteryProvider } from '@/contexts/LotteryContext';
import {
  LotteryStatus,
  TicketList,
  WinnerDisplay,
  LotteryOperatorPanel,
  LotteryNoteInput,
} from '@/components/lottery';
import { LoginArea } from '@/components/auth/LoginArea';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Bitcoin, Ticket, Trophy, Settings, Zap } from 'lucide-react';

function LotteryPageContent() {
  const { user } = useCurrentUser();

  return (
    <div className="min-h-screen bg-gradient-to-b from-amber-50/50 to-orange-50/50 dark:from-gray-950 dark:to-gray-900">
      {/* Header */}
      <header className="border-b bg-background/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center">
                <Bitcoin className="h-6 w-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold">Lightning Lottery</h1>
                <p className="text-xs text-muted-foreground">Provably Fair on Nostr</p>
              </div>
            </div>
            <LoginArea className="max-w-60" />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        <div className="max-w-6xl mx-auto">
          {/* Hero Section */}
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 text-sm font-medium mb-4">
              <Zap className="h-4 w-4" />
              Winner determined by Bitcoin block hash
            </div>
            <h2 className="text-4xl font-bold mb-4">
              Zap to Buy Tickets
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              A provably fair lottery where 1 sat = 1 ticket.
              Tickets are ordered by payment hash, winner selected using Bitcoin block entropy.
            </p>
          </div>

          <Tabs defaultValue="lottery" className="space-y-8">
            <TabsList className="grid w-full max-w-md mx-auto grid-cols-3">
              <TabsTrigger value="lottery" className="flex items-center gap-2">
                <Ticket className="h-4 w-4" />
                Lottery
              </TabsTrigger>
              <TabsTrigger value="verify" className="flex items-center gap-2">
                <Trophy className="h-4 w-4" />
                Verify
              </TabsTrigger>
              {user && (
                <TabsTrigger value="operate" className="flex items-center gap-2">
                  <Settings className="h-4 w-4" />
                  Operate
                </TabsTrigger>
              )}
            </TabsList>

            <TabsContent value="lottery" className="space-y-8">
              <div className="grid gap-8 lg:grid-cols-2">
                <div className="space-y-6">
                  <LotteryStatus />
                  <LotteryNoteInput />
                </div>
                <div>
                  <TicketList />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="verify" className="space-y-8">
              <div className="grid gap-8 lg:grid-cols-2">
                <WinnerDisplay />
                <TicketList />
              </div>
            </TabsContent>

            {user && (
              <TabsContent value="operate" className="space-y-8">
                <div className="grid gap-8 lg:grid-cols-2">
                  <LotteryOperatorPanel />
                  <div className="space-y-6">
                    <LotteryStatus />
                    <LotteryNoteInput />
                  </div>
                </div>
              </TabsContent>
            )}
          </Tabs>

          {/* How It Works Section */}
          <div className="mt-16 py-12 border-t">
            <h3 className="text-2xl font-bold text-center mb-8">How It Works</h3>
            <div className="grid gap-6 md:grid-cols-4">
              <div className="text-center p-6">
                <div className="w-12 h-12 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center mx-auto mb-4">
                  <span className="text-xl font-bold text-amber-600 dark:text-amber-400">1</span>
                </div>
                <h4 className="font-semibold mb-2">Zap the Note</h4>
                <p className="text-sm text-muted-foreground">
                  Send sats to the lottery note. 1 sat = 1 ticket.
                </p>
              </div>
              <div className="text-center p-6">
                <div className="w-12 h-12 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center mx-auto mb-4">
                  <span className="text-xl font-bold text-amber-600 dark:text-amber-400">2</span>
                </div>
                <h4 className="font-semibold mb-2">Get Tickets</h4>
                <p className="text-sm text-muted-foreground">
                  Tickets assigned by payment hash order (deterministic).
                </p>
              </div>
              <div className="text-center p-6">
                <div className="w-12 h-12 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center mx-auto mb-4">
                  <span className="text-xl font-bold text-amber-600 dark:text-amber-400">3</span>
                </div>
                <h4 className="font-semibold mb-2">Block Mined</h4>
                <p className="text-sm text-muted-foreground">
                  Bitcoin block hash provides provable randomness.
                </p>
              </div>
              <div className="text-center p-6">
                <div className="w-12 h-12 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center mx-auto mb-4">
                  <span className="text-xl font-bold text-amber-600 dark:text-amber-400">4</span>
                </div>
                <h4 className="font-semibold mb-2">Winner Paid</h4>
                <p className="text-sm text-muted-foreground">
                  Prize sent via Lightning to the winner.
                </p>
              </div>
            </div>
          </div>

          {/* Verification Section */}
          <div className="mt-8 p-6 bg-muted/50 rounded-xl">
            <h4 className="font-semibold mb-3">Verify Any Draw</h4>
            <ol className="text-sm text-muted-foreground space-y-2 list-decimal list-inside">
              <li>Fetch all zap receipts (kind 9735) for the lottery note</li>
              <li>Sort zaps by their payment_hash (lexicographically)</li>
              <li>Assign tickets: 1 sat = 1 ticket, in sorted order</li>
              <li>Get the draw block hash from any Bitcoin explorer</li>
              <li>Calculate: (block_hash_as_bigint % total_tickets) + 1 = winning ticket</li>
            </ol>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t mt-16 py-8">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          <p>Built on Nostr with MKStack</p>
          <p className="mt-2">
            Open source and verifiable. The code determines the winner, not the operator.
          </p>
        </div>
      </footer>
    </div>
  );
}

export default function LotteryPage() {
  useSeoMeta({
    title: 'Lightning Lottery - Provably Fair on Nostr',
    description: 'A provably fair lottery where 1 sat = 1 ticket. Winner determined by Bitcoin block hash.',
  });

  return (
    <LotteryProvider>
      <LotteryPageContent />
    </LotteryProvider>
  );
}
