# ⚡ Lightning Lottery on Nostr

A provably fair lottery system built on Nostr where users buy tickets by zapping a note, and the winner is determined by a Bitcoin block hash. Complete transparency, zero trust required.

![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-5.5-blue)
![React](https://img.shields.io/badge/React-18.3-blue)
![Nostr](https://img.shields.io/badge/Nostr-NIP--57-purple)

## 🎯 Features

- **Provably Fair**: Winner determined by Bitcoin block hash - anyone can verify
- **Lightning Native**: Buy tickets and receive prizes via Lightning Network
- **Zero Trust**: Deterministic ticket assignment by payment hash sorting
- **Configurable**: Adjust block cadence (default: every 100 blocks)
- **Operator Dashboard**: Complete workflow from announcement to payout
- **NWC Integration**: Connect Alby wallet for automated prize distribution

## 🎲 How It Works

1. **Operator publishes a lottery note** on Nostr
2. **Users zap the note** to buy tickets (1 sat = 1 ticket)
3. **Tickets assigned deterministically** - sorted by payment_hash from zap receipts
4. **Sales close** 6 blocks before the draw block
5. **Winner determined** using Bitcoin block hash: `(block_hash % total_tickets) + 1`
6. **Prize paid** via Lightning to the winner's `lud16` address

### Provable Fairness

The lottery is provably fair because:
- Ticket assignments are deterministic (sorted by payment_hash)
- Operator commits ticket list before the draw block is mined
- Winner selection uses Bitcoin block hash (unpredictable, immutable)
- Anyone can verify: fetch zap receipts + block hash + re-run calculation

**Verification Formula:**
```
winning_ticket = (Bitcoin_block_hash % total_tickets) + 1
```

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ and npm
- A Nostr account (for operators)
- Alby wallet with NWC (for prize payouts)

### Installation

```bash
# Clone the repository
git clone https://github.com/twood22/nostr-lottery.git
cd nostr-lottery

# Install dependencies
npm install

# Start development server
npm run dev
```

Visit `http://localhost:5173` to access the operator dashboard.

### Setup Your Lottery

1. **Login** with your Nostr account (the lottery operator npub)

2. **Connect Wallet**
   - Go to Alby Hub → Wallet Connections
   - Create connection with permissions: `pay_invoice`, `list_transactions`
   - Copy the `nostr+walletconnect://...` URI
   - Click "Connect Wallet" and paste

3. **Publish Lottery Note**
   - Click "Publish Announcement"
   - Share the note - users will zap it to buy tickets

4. **Monitor & Manage**
   - Watch ticket sales in real-time
   - Publish commitment before draw block (optional but recommended)
   - Announce winner after draw block
   - Send prize via Lightning

## 📖 Architecture

### Tech Stack

- **Frontend**: React 18 + TypeScript + TailwindCSS
- **UI Components**: shadcn/ui (Radix UI + Tailwind)
- **Nostr**: Nostrify for protocol integration
- **Lightning**: @getalby/sdk for NWC
- **Block Data**: mempool.space API
- **Build**: Vite
- **Testing**: Vitest + React Testing Library

### Key Components

```
src/
├── components/lottery/       # Lottery UI components
│   ├── LotteryStatus.tsx    # Prize pool, countdown, status
│   ├── TicketList.tsx       # Ticket assignments with winner highlight
│   ├── WinnerDisplay.tsx    # Winner info + verification data
│   └── LotteryOperatorPanel.tsx  # 4-step operator workflow
├── contexts/
│   └── LotteryContext.tsx   # Lottery state management
├── hooks/
│   ├── useBitcoinBlock.ts   # Bitcoin block height monitoring
│   └── useLotteryOperations.ts  # Publish notes, send prizes
└── lib/lottery/
    ├── types.ts             # Type definitions
    ├── config.ts            # Configuration & block calculations
    ├── tickets.ts           # Deterministic ticket assignment
    ├── winner.ts            # Winner selection algorithm
    └── payout.ts            # Prize distribution via Lightning
```

## 🔧 Configuration

### Block Cadence

Adjust how often lotteries run (default: 100 blocks ≈ ~16 hours):

```typescript
// In the operator dashboard
Block Cadence: 100  // Change to any value
```

### Advanced Settings

Edit `src/lib/lottery/config.ts`:

```typescript
export const DEFAULT_LOTTERY_CONFIG: LotteryConfig = {
  blockCadence: 100,                    // Lottery frequency
  salesCloseBlocksBeforeDraw: 6,        // When sales close
  confirmationsRequired: 6,              // Wait before payout
  minTicketPurchase: 1,                 // Minimum sats per ticket
  platformFeePercent: 0,                // Platform fee (0-100)
};
```

## 🧪 Testing

```bash
# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Type check
npx tsc --noEmit

# Lint
npx eslint
```

## 📝 Nostr Event Kinds

The lottery uses standard Nostr event kinds:

- **Kind 1**: Lottery announcements and winner announcements
- **Kind 9735**: Zap receipts (NIP-57) for ticket purchases
- **Kind 30078**: Ticket commitment (addressable event)

### Custom Tags

Lottery notes include these tags:
```json
[
  ["t", "nostr-lottery"],
  ["draw_block", "928400"],
  ["sales_close_block", "928394"]
]
```

## 🔐 Security Considerations

### For Operators

- **Never share your nsec** - use browser extensions (nos2x, Alby, etc.)
- **NWC connections** are stored locally - clear on logout
- **Prize wallet** should have limited funds
- **Commitment publication** proves ticket assignments before randomness

### For Participants

- **Verify independently**: Fetch zap receipts + block hash to confirm winner
- **Check operator reputation**: Look at past lotteries and payouts
- **Small amounts**: Start with small ticket purchases until trust is established

## 🤝 Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Guidelines

- Use TypeScript strict mode
- Follow existing code style (ESLint + Prettier)
- Add tests for new features
- Update documentation as needed

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details

## 🙏 Acknowledgments

- Built with [MKStack](https://soapbox.pub/mkstack) - The complete framework for building Nostr clients
- Powered by [Nostrify](https://github.com/soapbox-pub/nostrify) for Nostr protocol integration
- Lightning payments via [Alby SDK](https://github.com/getAlby/js-sdk)
- Bitcoin block data from [mempool.space](https://mempool.space)

## 🔗 Links

- **Live Demo**: [Coming soon]
- **Report Issues**: [GitHub Issues](https://github.com/twood22/nostr-lottery/issues)
- **Nostr**: Find me at `npub1...` (operator)

## 💡 Future Ideas

- [ ] Multiple concurrent lotteries
- [ ] Recurring automatic lotteries
- [ ] Custom prize distribution (split between multiple winners)
- [ ] Integration with Cashu ecash
- [ ] Mobile app version
- [ ] Public lottery archive/history page

---

**Made with ⚡ on Nostr**

*"The code determines the winner, not the operator."*
