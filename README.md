# StockFolio

StockFolio is a TypeScript full-stack application for tracking Indian equity portfolios across NSE and BSE. It keeps market-data integration behind the server boundary and models portfolio changes as immutable transactions so holdings and profit/loss can be calculated reliably.

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

## Verification

```bash
pnpm typecheck
pnpm build
```

`GET /live` is a process liveness check. `GET /health` is a readiness check and returns `503` until PostgreSQL is reachable.

## Security notes

- Keep secrets only in ignored `.env` files or the deployment platform's secret store.
- Restrict `CORS_ORIGIN` to the deployed web origin.
- Rotate any key that has been copied into chat, logs, or source control before deployment.
