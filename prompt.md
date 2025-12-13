# Nostr Lightning Lottery

Build a provably fair lottery system on Nostr where users buy tickets by zapping a note, and the winner is determined by a future Bitcoin block hash. The lottery runs every 100 blocks for now, but make the cadence configurable.

## How It Works

1. **Lottery opens** — The lottery npub posts a note announcing the lottery. Users zap this note to buy tickets (1 sat = 1 ticket).

2. **Ticket sales close** — At a predetermined Bitcoin block height (e.g., block b+94), we stop counting new zaps. The lottery posts a commitment to the ticket assignments before the winning block is known.

3. **Winner determined** — At block b+100, the block hash becomes the source of randomness. We use it to pick a winning ticket number.

4. **Payout** — At block b+106 (after 6 confirmations), we pay the winner by zapping their lightning address.

## Key Design Principles

- **Provably fair**: Anyone can verify the winner by fetching the zap receipts, the block hash, and re-running the calculation
- **Deterministic ticket ordering**: Tickets are assigned by sorting all zaps by their `payment_hash` (lexicographically). This removes operator discretion.
- **Commitment before randomness**: Ticket assignments must be published before the draw block is mined, preventing manipulation

## Tech Stack

- **MKStack** — Framework for building Nostr apps (React + TypeScript + Nostrify)
- **Nostrify** — For all Nostr interactions (publishing events, querying relays, etc.)
- **Alby + NWC** — Lightning wallet integration via Nostr Wallet Connect. I already have a node and LNURL set up to receive zaps, so we just need to use alby + NWC to get zap data to construct the ticket list then to send out winnings to the winner.
- **mempool.space API** — For fetching Bitcoin block heights and hashes

### MKStack Setup
Use the MCPs in this directory. Read the README.md and AGENDS.MD.

## Lightning Integration (Alby)

We're using an existing Alby wallet with a lightning address for receiving and sending payments.

### Receiving Zaps
- The lottery npub has an Alby lightning address set in its profile (`lud16` field)
- When users zap the lottery note, Alby receives the payment and publishes zap receipts (kind 9735) to relays
- No custom LNURL service needed — Alby handles everything

### Getting Zap Data
To build the ticket list, we need to correlate two data sources:
1. **Nostr relays** — Query for kind 9735 zap receipts that reference our lottery note
2. **Alby wallet via NWC** — Use `listTransactions` to get payment details

Match zaps to wallet transactions using the `payment_hash` (decode the bolt11 invoice in the zap receipt to get it).

### Sending the Prize
See https://github.com/getAlby/js-lightning-tools?tab=readme-ov-file or https://github.com/getAlby/js-lightning-tools/blob/master/examples/zaps-nwc.js
Use `@getalby/lightning-tools` to send a zap to the winner:
- Look up the winner's `lud16` from their Nostr profile (kind 0)
- Use `LightningAddress.zap()` with an NWC provider to send the prize

### Required Packages
```bash
npm install @getalby/sdk @getalby/lightning-tools
```

### Environment Variables
```
NWC_URL=nostr+walletconnect://...  # From Alby Hub > Wallet Connections
LOTTERY_NSEC=nsec1...              # Lottery operator's Nostr key
RELAYS=etc...
```

The NWC connection needs these permissions: `pay_invoice`, `list_transactions`, `get_balance`, `lookup_invoice`

## Winner Selection

The winning ticket number is derived from the Bitcoin block hash at the draw block:
- Take the block hash
- Convert to a number
- Modulo by total tickets
- That's the winning ticket

Ticket ranges are assigned based on payment_hash sort order. Example: if Alice's payment_hash sorts first and she zapped 5000 sats, she gets tickets 1-5000. Bob sorts second with 3000 sats, he gets 5001-8000. Etc.

## What to Build

### Backend/Bot
- Post lottery announcement notes
- Monitor for zaps to the lottery note
- Watch Bitcoin block height (poll mempool.space)
- At sales close: fetch all zaps, build ticket list, post commitment
- At draw block + 6 confirmations: calculate winner, send prize, post winner announcement

### Frontend
- Display active lottery (prize pool, blocks remaining, recent zaps)
- Show ticket assignments after sales close
- Display winner and verification data after draw
- Allow anyone to independently verify the result

## References

- NIP-57 (Lightning Zaps) — Zap receipts are kind 9735 events containing the bolt11 invoice and embedded zap request
- BTRY (github.com/aftermath2/btry) — Existing Lightning lottery implementation using block hashes for randomness. scope this out
- Alby SDK docs — guides.getalby.com/developer-guide