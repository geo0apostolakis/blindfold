# Blindfold

Private AI chat that you pay for without a name. A wallet pays a dollar stablecoin and gets back blind-signed credit tickets. The chat spends the tickets and never sees the wallet, so the server cannot tell which payment a prompt came from.

Next.js 16 · viem · RSA blind signatures (RFC 9474) · OpenRouter

## How it works

1. **Quote** (`/api/quote`). The server prices the purchase in dollars and holds that much AI capacity for ten minutes. $1 buys 8,000 credits, and one credit is $0.0001 of real AI cost. Selling out is decided here, before anyone pays.
2. **Pay.** The wallet sends the stablecoin (USDC by default) to the treasury address.
3. **Claim** (`/api/claim`). The browser makes random tickets in sizes of 1,000, 100, 10 and 1 credits and blinds them. The wallet signs a claim naming the transfer and a hash of the blinded tickets, and the server signs the blinded tickets with one RSA key per size. It never sees the finished tickets, so it cannot link them back to the wallet later.
4. **Deposit** (`/api/session`). The chat tops up an anonymous session, keyed by the hash of a random secret the browser made, with just enough tickets.
5. **Chat** (`/api/chat`). The server holds the worst-case cost of the message, asks OpenRouter, charges the real cost times 1.2 and gives the rest back. Prompts are never stored or logged.

The browser pins the server's public ticket keys and warns if they change, because swapping keys per user is the one way a server could tell people apart.

## Protecting the budget

- The shop never sells more credits than the money really left can pay for. That is the lowest of `OPENROUTER_BUDGET_USD`, the key's limit and the account balance, minus a 10% buffer, counting every credit already sold. Then it shows sold out, and existing credits keep working.
- Every model call is sent with zero-data-retention routing and a price ceiling (`provider.max_price`), and holds are sized from that ceiling, so the worst case of a message is always covered.
- Answers are capped at 800 tokens, only the last 8 messages are sent, models come from an allowlist, and chat is limited to 20 messages a minute per session and 120 site-wide.
- One wallet can buy up to 100,000 credits in 24 hours.
- Also set a hard limit on the OpenRouter key itself.

All the numbers live in `lib/limits.ts` and `lib/config.ts`.

## Run the local demo

Needs [Foundry](https://getfoundry.sh) for the local chain.

```bash
npm install
npm run chain        # terminal 1: local blockchain (anvil)
npm run setup        # terminal 2: deploys a test stablecoin, writes .env.local
npx next dev -p 3005 # terminal 2: the app
```

Without `OPENROUTER_API_KEY` in `.env.local` the app runs in demo mode, with canned answers and costs simulated from real model prices. Add the key for real answers.

To click through it in a browser, add the network `http://127.0.0.1:8545` (chain id 31337) to MetaMask or Rabby and import a demo wallet using a key from `scripts/local-chain.ts`. Those are public development keys. Never send real funds to them.

## Tests

```bash
APP_URL=http://localhost:3005 npm run e2e   # the whole money path, 27 checks
```

It pays, claims, unblinds and verifies tickets, then tries to break it with a claim signed by another wallet, the same transfer claimed twice, a ticket spent twice, a ticket claiming a bigger size, a tampered ticket, the per-wallet cap, an unknown model. It also checks that no prompt reaches the store and no session record holds a wallet.

```bash
OPENROUTER_API_KEY= OPENROUTER_BUDGET_USD=0.85 BLINDFOLD_STORE_FILE=.data/soldout.json npx next dev -p 3006
APP_URL=http://localhost:3006 npm run soldout   # proves it sells out instead of overselling
```

## Going to production

```bash
npm run gen-keys                      # writes .data/prod-blind-keys.env (mode 600), prints fingerprints
NEXT_DIST_DIR=.next-prod npx next build
set -a; source .data/prod-blind-keys.env; set +a
NEXT_DIST_DIR=.next-prod npx next start -p 3000
```

Every setting is listed in `.env.example`. Production refuses to sign without `BLINDFOLD_BLIND_KEYS`. Publish the key fingerprints somewhere public, so a key swap is visible to everyone.

## Not done yet

- Only run on the local chain. Base Sepolia and Base are configured but have not been used with real USDC.
- Never clicked through with a real browser wallet. The money path is tested by `scripts/e2e.mts` with the same ticket code the browser uses.
- The store is a JSON file. A Postgres backend is needed before any serverless deploy, and hosting must have request logging off, because default platform logs record IPs.
- Timing is the weak spot. Buying and chatting in the same minute while few people use it can point at you. Tickets do not expire, so the advice is to buy now and chat later.

## License

MIT
