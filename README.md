# StockFolio

StockFolio is a TypeScript full-stack application for tracking Indian equity portfolios across NSE and BSE. It keeps market-data integration behind the server boundary and models portfolio changes as immutable transactions so holdings and profit/loss can be calculated reliably.

## Portfolio accounting

- Users record the quantity, execution price, and exchange trade date shown on their broker contract note.
- Today's market price is an editable form suggestion. Past dates intentionally start with an empty price so a current quote is never mistaken for a historical execution.
- The server persists the submitted execution price; later market-data changes never rewrite a transaction.
- SELL requests are rejected unless sufficient quantity exists on the selected date and every later ledger balance remains non-negative.
- Remaining cost and realized profit/loss use FIFO lot matching. Total profit/loss combines realized results with the unrealized value of open lots.
- Absolute return uses total purchase cost. Annualized return is money-weighted XIRR over dated purchases, sales, and the current value of open holdings.
- Transactions use date-only accounting by design; intraday execution time is outside the application scope.

## Architecture

- `web`: React 18, React Router, Vite, and Tailwind CSS
- `server`: Express, Zod, Pino, and the IndianAPI market-data adapter
- `database`: PostgreSQL accessed through parameterized `pg` queries and explicit transactions

The browser never receives the market-data API key. In development, Vite proxies API traffic to the Express server.

## Requirements

- Node.js 20.12 or newer
- pnpm 11
- PostgreSQL 15 or newer
- An IndianAPI key

## Local setup

1. Install dependencies:

   ```bash
   pnpm install
   ```

2. Copy `server/.env.example` to `server/.env` and set `DATABASE_URL` and `STOCK_API_KEY`.

3. Create the database schema:

   ```bash
   pnpm --filter stockfolio-server db:init
   ```

4. Start both applications:

   ```bash
   pnpm dev
   ```

The web application runs at `http://localhost:5173` and the API at `http://localhost:8080` by default.

### Render SPA routing

The frontend is a React single-page application. In the Render frontend Static Site, add this rule under **Redirects/Rewrites** so refreshing a client-side route such as `/portfolio` or `/stock/NSE/TCS` serves the application instead of returning 404:

- Source: `/*`
- Destination: `/index.html`
- Action: `Rewrite`

## Verification

```bash
pnpm verify
```

`GET /live` is a process liveness check. `GET /health` is a readiness check and returns `503` until PostgreSQL is reachable.

## Security notes

- Keep secrets only in ignored `.env` files or the deployment platform's secret store.
- Restrict `CORS_ORIGIN` to the deployed web origin.
- Rotate any key that has been copied into chat, logs, or source control before deployment.
