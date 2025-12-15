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
import { WalletModal } from '@/components/WalletModal';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNWC } from '@/hooks/useNWCContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Bitcoin, Wallet, AlertCircle, CheckCircle } from 'lucide-react';

function LotteryOperatorDashboard() {
  const { user } = useCurrentUser();
  const { connections } = useNWC();
  const hasWallet = connections.length > 0 && connections.some(c => c.isConnected);

  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-amber-50/50 to-orange-50/50 dark:from-gray-950 dark:to-gray-900">
        <div className="container mx-auto px-4 py-16">
          <div className="max-w-md mx-auto text-center">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center mx-auto mb-6">
              <Bitcoin className="h-10 w-10 text-white" />
            </div>
            <h1 className="text-3xl font-bold mb-4">Lightning Lottery</h1>
            <p className="text-muted-foreground mb-8">
              Operator Dashboard - Login to manage your lottery
            </p>
            <Card>
              <CardHeader>
                <CardTitle>Login Required</CardTitle>
                <CardDescription>
                  Sign in with your Nostr account to operate a lottery
                </CardDescription>
              </CardHeader>
              <CardContent>
                <LoginArea className="w-full flex" />
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    );
  }

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
                <p className="text-xs text-muted-foreground">Operator Dashboard</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <WalletModal>
                <Button variant="outline" size="sm">
                  <Wallet className="h-4 w-4 mr-2" />
                  {hasWallet ? 'Wallet Connected' : 'Connect Wallet'}
                  {hasWallet && <CheckCircle className="h-3 w-3 ml-2 text-green-500" />}
                </Button>
              </WalletModal>
              <LoginArea className="max-w-60" />
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        <div className="max-w-7xl mx-auto space-y-8">
          {/* Wallet Warning */}
          {!hasWallet && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Wallet Not Connected</AlertTitle>
              <AlertDescription className="flex items-center justify-between">
                <span>Connect your Alby wallet via NWC to send prize payouts.</span>
                <WalletModal>
                  <Button variant="outline" size="sm">
                    <Wallet className="h-4 w-4 mr-2" />
                    Connect NWC
                  </Button>
                </WalletModal>
              </AlertDescription>
            </Alert>
          )}

          {/* Setup Instructions */}
          <Card>
            <CardHeader>
              <CardTitle>Quick Setup</CardTitle>
              <CardDescription>
                Get your lottery running in 4 steps
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-4">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center shrink-0">
                    <span className="font-bold text-amber-600 dark:text-amber-400">1</span>
                  </div>
                  <div>
                    <p className="font-medium">Connect Wallet</p>
                    <p className="text-sm text-muted-foreground">Add your Alby NWC connection string</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center shrink-0">
                    <span className="font-bold text-amber-600 dark:text-amber-400">2</span>
                  </div>
                  <div>
                    <p className="font-medium">Publish Lottery Note</p>
                    <p className="text-sm text-muted-foreground">Create the note users will zap</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center shrink-0">
                    <span className="font-bold text-amber-600 dark:text-amber-400">3</span>
                  </div>
                  <div>
                    <p className="font-medium">Monitor Tickets</p>
                    <p className="text-sm text-muted-foreground">Watch zaps come in as tickets</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center shrink-0">
                    <span className="font-bold text-amber-600 dark:text-amber-400">4</span>
                  </div>
                  <div>
                    <p className="font-medium">Pay Winner</p>
                    <p className="text-sm text-muted-foreground">Send prize via Lightning</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Main Dashboard Grid */}
          <div className="grid gap-8 lg:grid-cols-2">
            {/* Left Column - Controls */}
            <div className="space-y-6">
              <LotteryOperatorPanel />
              <LotteryNoteInput />
            </div>

            {/* Right Column - Status & Data */}
            <div className="space-y-6">
              <LotteryStatus />
              <WinnerDisplay />
            </div>
          </div>

          {/* Ticket List - Full Width */}
          <TicketList />

          {/* How It Works */}
          <Card>
            <CardHeader>
              <CardTitle>How the Lottery Works</CardTitle>
            </CardHeader>
            <CardContent className="prose prose-sm dark:prose-invert max-w-none">
              <div className="grid gap-6 md:grid-cols-2">
                <div>
                  <h4 className="font-semibold mb-2">Ticket Assignment</h4>
                  <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                    <li>Users zap your lottery note to buy tickets</li>
                    <li>1 sat = 1 ticket</li>
                    <li>Tickets sorted by payment_hash (deterministic)</li>
                    <li>Publish commitment before draw block</li>
                  </ul>
                </div>
                <div>
                  <h4 className="font-semibold mb-2">Winner Selection</h4>
                  <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                    <li>Draw block hash provides randomness</li>
                    <li>Formula: (hash % tickets) + 1 = winner</li>
                    <li>Wait 6 confirmations before payout</li>
                    <li>Anyone can verify independently</li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t mt-16 py-6">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          <p>Provably fair - winner determined by Bitcoin block hash</p>
        </div>
      </footer>
    </div>
  );
}

export default function LotteryPage() {
  useSeoMeta({
    title: 'Lightning Lottery - Operator Dashboard',
    description: 'Operate a provably fair lottery on Nostr. Winner determined by Bitcoin block hash.',
  });

  return (
    <LotteryProvider>
      <LotteryOperatorDashboard />
    </LotteryProvider>
  );
}
