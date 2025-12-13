import { useState } from 'react';
import { nip19 } from 'nostr-tools';
import { useLottery } from '@/contexts/LotteryContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/useToast';
import { Link2, Check, X, ExternalLink } from 'lucide-react';

export function LotteryNoteInput() {
  const { lotteryNoteId, setLotteryNote } = useLottery();
  const { toast } = useToast();
  const [inputValue, setInputValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSetNote = () => {
    setError(null);

    if (!inputValue.trim()) {
      setError('Please enter a note ID or nevent');
      return;
    }

    try {
      let eventId: string;
      let pubkey: string | undefined;

      // Try to decode as nip19
      if (inputValue.startsWith('note1') || inputValue.startsWith('nevent1')) {
        const decoded = nip19.decode(inputValue);
        if (decoded.type === 'note') {
          eventId = decoded.data;
        } else if (decoded.type === 'nevent') {
          eventId = decoded.data.id;
          pubkey = decoded.data.author;
        } else {
          throw new Error('Invalid identifier type');
        }
      } else if (/^[a-f0-9]{64}$/i.test(inputValue)) {
        // Raw hex event ID
        eventId = inputValue.toLowerCase();
      } else {
        throw new Error('Invalid format. Use note1..., nevent1..., or 64-char hex');
      }

      // If no pubkey from nevent, we'll need to query for it
      // For now, use empty string - the context will handle it
      setLotteryNote(eventId, pubkey || '');

      toast({
        title: 'Lottery note set',
        description: 'Tracking zaps to this note.',
      });

      setInputValue('');
    } catch (err) {
      console.error('Failed to parse note ID:', err);
      setError(err instanceof Error ? err.message : 'Invalid note ID');
    }
  };

  const handleClearNote = () => {
    setLotteryNote('', '');
    toast({
      title: 'Lottery note cleared',
      description: 'No longer tracking any note.',
    });
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Link2 className="h-5 w-5" />
          Lottery Note
        </CardTitle>
        <CardDescription>
          Enter the note ID that participants should zap
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {lotteryNoteId ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Badge variant="default" className="bg-green-500">
                <Check className="h-3 w-3 mr-1" />
                Active
              </Badge>
              <code className="text-xs bg-muted px-2 py-1 rounded font-mono">
                {lotteryNoteId.slice(0, 8)}...{lotteryNoteId.slice(-8)}
              </code>
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                asChild
              >
                <a
                  href={`https://njump.me/${nip19.noteEncode(lotteryNoteId)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <ExternalLink className="h-4 w-4 mr-2" />
                  View on Nostr
                </a>
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleClearNote}
              >
                <X className="h-4 w-4 mr-2" />
                Clear
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex gap-2">
              <Input
                placeholder="note1... or nevent1... or hex event ID"
                value={inputValue}
                onChange={(e) => {
                  setInputValue(e.target.value);
                  setError(null);
                }}
                onKeyDown={(e) => e.key === 'Enter' && handleSetNote()}
              />
              <Button onClick={handleSetNote}>Set</Button>
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <p className="text-xs text-muted-foreground">
              Paste a note ID or nevent that you want to track for lottery ticket purchases.
              Users will zap this note to buy tickets.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
