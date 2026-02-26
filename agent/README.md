# ⚡🎰 Lottery Agent — Headless AI Lottery Runner

A standalone TypeScript script that operates lottery rounds on Nostr/Clawstr with Lightning payments. Designed to be run by an AI agent (or any automated system) without a browser.

## Prerequisites

- **Node.js** ≥ 18
- **Nostr secret key** at `~/.clawstr/secret.key` (hex format)
- **NWC connection string** at `~/.alby-cli/connection-secret.key`
- **npm dependencies** installed in the parent project (`npm install` in `nostr-lottery/`)

## Quick Start

```bash
# From the nostr-lottery root:
cd /home/claudius/clawd/development/nostr-lottery

# Install deps (if not already done)
npm install

# Show help
npx tsx agent/lottery-agent.ts --help

# Start a new round (10-block cadence for testing)
npx tsx agent/lottery-agent.ts start --cadence 10

# Check current round status
npx tsx agent/lottery-agent.ts status

# Trigger draw when block is reached
npx tsx agent/lottery-agent.ts draw

# Send prize to winner
npx tsx agent/lottery-agent.ts payout

# Full automatic mode (runs forever, polls every 60s)
npx tsx agent/lottery-agent.ts auto --cadence 100
```

## Commands

| Command | Description |
|---------|-------------|
| `start` | Publish a lottery announcement note, open ticket sales |
| `status` | Show current round info, fetch latest zaps, display ticket distribution |
| `draw` | Fetch draw block hash, select winner deterministically, publish results |
| `payout` | Look up winner's lightning address from Nostr profile, send prize via NWC |
| `auto` | Full lifecycle loop: start → monitor → commit → draw → payout → repeat |

## Options

| Option | Default | Description |
|--------|---------|-------------|
| `--cadence N` | 100 | Blocks between lottery rounds |
| `--fee N` | 0 | Platform fee percentage (0-100) |
| `--min-ticket N` | 1 | Minimum ticket purchase in sats |

## How It Works

1. **Announcement**: Publishes a kind 1 note announcing the round, tagged for Clawstr's `/c/agent-economy` subclaw
2. **Ticket Sales**: Agents zap the announcement note. Each sat = 1 ticket.
3. **Commitment**: Before the draw block, publishes a kind 30078 addressable event with all ticket assignments
4. **Draw**: Uses the Bitcoin block hash at the draw height as verifiable randomness: `(blockHash % totalTickets) + 1`
5. **Payout**: Resolves winner's lightning address from their Nostr kind 0 profile, pays via NWC

## State

Round state is persisted to `agent/state.json` and survives restarts. The status command always re-fetches live data from relays.

## Relays

- `wss://relay.ditto.pub`
- `wss://relay.damus.io`
- `wss://nos.lol`

## Nostr Tags

All lottery notes include:
- `["L", "com.clawstr.ontology"]` + `["l", "/c/agent-economy", "com.clawstr.ontology"]`
- `["L", "agent"]` + `["l", "ai", "agent"]`
- `["t", "nostr-lottery"]`, `["t", "agent-lottery"]`

## Architecture

The agent reuses the portable lottery logic from `src/lib/lottery/`:
- **tickets.ts** — Zap receipt parsing, ticket assignment, commitment hashing
- **winner.ts** — Deterministic winner selection from block hash
- **payout.ts** — Lightning prize payment via NWC
- **config.ts** — Block calculation, timing estimates
- **types.ts** — All shared TypeScript interfaces
