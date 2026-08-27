<div align="center">

# StockFolio

**A full-stack Indian equity portfolio tracker built around an immutable trade ledger.**

[Live application](https://stockfolio-1.onrender.com) · [API health](https://stockfolio-8r6n.onrender.com/health) · [Market overview API](https://stockfolio-8r6n.onrender.com/api/stocks/overview)

![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)
![React](https://img.shields.io/badge/React-18-149ECA?logo=react&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-24_LTS-339933?logo=node.js&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15+-4169E1?logo=postgresql&logoColor=white)
![Security audit](https://img.shields.io/badge/production_dependencies-0_known_vulnerabilities-159A63)

</div>

StockFolio lets users search NSE and BSE companies, inspect market data, record dated BUY and SELL transactions, and understand portfolio performance through FIFO profit/loss, absolute return, and money-weighted annualized return.

The application is intentionally a **portfolio tracker, not a brokerage**. A transaction records a trade that already happened; it never places an order with an exchange.

## What it demonstrates

- Public dashboard for NIFTY 50, SENSEX, NIFTY BANK, NIFTY IT, and active NSE companies
- Debounced, keyboard-accessible NSE/BSE search from every page
- Stock detail pages with quotes, daily history, trading ranges, fundamentals, and company descriptions
- Account registration and login with bcrypt password hashing and signed JWT authentication
- Manual execution-price entry so historical trades are never stored using today's price
- Chronological sell validation: a position must exist on the selected date and remain valid afterward
- FIFO cost-basis accounting with separate realized and unrealized profit/loss
- Absolute return and money-weighted annualized return (XIRR)
- Resilient market-data adapters with retries, single-flight caching, stale fallback, and index-provider failover
- PostgreSQL transactions, row locking, strict validation, and idempotent money writes
- Responsive UI with explicit loading, empty, stale, unavailable, validation, and retry states

## Architecture

```mermaid
flowchart LR
    Browser["React + TypeScript SPA"] -->|"JSON over HTTPS"| API["Express API"]
    API --> Auth["Authentication service"]
    API --> Portfolio["Portfolio services"]
    API --> Market["Market-data service"]
    Auth --> DB[("PostgreSQL")]
    Portfolio --> DB
    Portfolio --> Market
    Market --> Indian["IndianAPI"]
    Market --> Yahoo["Yahoo Finance index feed"]
    Yahoo -. "fallback" .-> Indian
```

| Layer | Responsibilities |
| --- | --- |
| `web` | React UI, routing, authentication state, accessible search, forms, charts, and formatting |
| `server/routes` | HTTP contracts, authentication, rate limits, and Zod request validation |
| `server/services` | Business rules, transaction orchestration, FIFO accounting, XIRR, and dashboard aggregation |
| `server/providers` | External API schemas, mapping, retries, aliases, and provider-specific behavior |
| PostgreSQL | Users, portfolios, instruments, immutable transactions, and idempotency records |

The browser never receives `STOCK_API_KEY` or database credentials. In local development, Vite proxies `/api`, `/health`, and `/live` to Express.

## Domain and accounting decisions

### Transactions are the source of truth

Holdings are derived from immutable BUY and SELL records. Users enter:

- exchange and symbol;
- BUY or SELL;
- quantity;
- actual execution price from the broker contract note; and
- exchange trade date.

For a trade dated today, the latest market price is only an editable suggestion. Selecting a past date clears the price field so a current quote cannot be mistaken for a historical execution price.

### Sell validation

SELL creation runs inside a database transaction after locking the user's portfolio row. It checks the complete dated ledger and rejects a sale when:

- no sufficient BUY quantity exists on that date; or
- inserting a backdated sale would make any later ledger balance negative.

### Profit and return calculations

| Metric | Definition |
| --- | --- |
| Open cost | Remaining cost of unsold FIFO purchase lots |
| Realized P&L | Sale proceeds minus the FIFO cost of the matched lots |
| Unrealized P&L | Current value minus open cost |
| Total P&L | Realized P&L plus unrealized P&L |
| Absolute return | Total P&L divided by cumulative purchase cost |
| Annualized return | XIRR over dated BUY outflows, SELL inflows, and the current value of open holdings |

Money and quantities cross API boundaries as decimal strings and are calculated with `decimal.js`; binary floating-point arithmetic is not used for portfolio accounting.

Transactions are date-only by design. Intraday execution time, fees, taxes, dividends, and corporate-action adjustments are outside the locked assignment scope.

## Search design

Search is implemented as a complete request pipeline rather than a simple input handler:

1. The UI waits until two characters are entered and debounces requests by 300 ms.
2. The previous request is aborted whenever the query changes.
3. A sequence number prevents a slow, older response from replacing newer results.
4. The server validates length and allowed characters before calling the provider.
5. Public search is rate-limited and successful results are cached for five minutes.
6. IndianAPI responses are validated with Zod and mapped into stable NSE/BSE contracts.
7. Provider quirks such as the `M&M` ticker are isolated behind adapter aliases.
8. Results support pointer selection, arrow keys, Enter, Escape, ARIA combobox semantics, and stale-data messaging.

The result URL contains the exchange and an encoded symbol, so NSE and BSE instruments remain unambiguous.

## Reliability and security

- Strict TypeScript with `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`
- Strict Zod schemas for request bodies, parameters, queries, environment variables, and upstream payloads
- Parameterized SQL for every runtime query
- Explicit PostgreSQL transactions with rollback and portfolio row locking
- Client-generated UUID idempotency keys plus canonical request hashes for transaction writes
- bcrypt password hashes and identical login failures for known and unknown emails
- HS256 JWT verification restricted to the expected algorithm
- Authentication and market-data rate limits
- Helmet security headers, explicit HTTPS CORS origins in production, and a 100 KB JSON-body limit
- External request timeouts, bounded retries, cache capacity limits, and in-flight request deduplication
- Server-side secret handling and Pino redaction for authorization, cookies, API keys, and passwords
- Safe operational error envelopes; unexpected errors are logged without exposing internals to clients
- Production dependency audit with no known vulnerabilities at the time of the latest verification

## API overview

Successful responses use `{ "data": ... }`; failures use `{ "error": { "code", "message", "details?" } }`.

| Method | Route | Authentication | Purpose |
| --- | --- | --- | --- |
| `GET` | `/live` | No | Process liveness |
| `GET` | `/health` | No | Database readiness |
| `POST` | `/api/auth/register` | No | Create user and default portfolio |
| `POST` | `/api/auth/login` | No | Authenticate and issue JWT |
| `GET` | `/api/auth/me` | Bearer JWT | Restore current user |
| `GET` | `/api/stocks/overview` | No | Indices and most-active companies |
| `GET` | `/api/stocks/search?q=TCS` | No | Search NSE/BSE instruments |
| `GET` | `/api/stocks/:exchange/:symbol` | No | Stock detail and quote |
| `GET` | `/api/stocks/:exchange/:symbol/history?range=1M` | No | Daily closing-price history |
| `GET` | `/api/portfolio/holdings` | Bearer JWT | Holdings and calculated summary |
| `GET` | `/api/portfolio/summary` | Bearer JWT | Portfolio summary only |
| `POST` | `/api/portfolio/transactions` | Bearer JWT | Record an idempotent BUY or SELL |

`POST /api/portfolio/transactions` accepts an optional `Idempotency-Key` UUID header. Reusing the same key with the same payload safely replays the original response; reusing it with a different payload returns `409`.

## Technology

| Area | Stack |
| --- | --- |
| Frontend | React 18, React Router 7, Vite 6, Tailwind CSS, Recharts |
| Backend | Node.js 24, Express 4, Zod 4, Pino, `pg`, `decimal.js` |
| Database | PostgreSQL / Neon |
| Market data | IndianAPI with Yahoo Finance index primary and IndianAPI historical fallback |
| Testing | Vitest, Supertest, provider contract fixtures, production build verification |
| Package management | pnpm workspace with a frozen lockfile |

## Repository layout

```text
Stock-Portfolio-Management/
├── server/
│   ├── scripts/                 # schema initialization, provider smoke test, demo seed
│   ├── src/
│   │   ├── config/              # validated runtime configuration
│   │   ├── database/            # pool, transactions, schema
│   │   ├── middleware/          # authentication and error handling
│   │   ├── providers/           # IndianAPI and Yahoo adapters
│   │   ├── routes/              # HTTP endpoints
│   │   └── services/            # domain and orchestration logic
│   └── tests/                   # unit and route-contract tests
├── web/
│   └── src/
│       ├── api/                 # typed API client
│       ├── auth/                # session state and protected routes
│       ├── components/          # search, charts, forms, and portfolio UI
│       └── pages/               # route-level views
├── package.json                 # workspace commands and pinned runtime
└── pnpm-lock.yaml               # reproducible dependencies
```

## Local development

### Prerequisites

- Node.js 24 LTS
- pnpm 11.19.0
- PostgreSQL 15+ or a Neon database
- An [IndianAPI](https://indianapi.in/indian-stock-market) key

Enable the pinned package manager:

```bash
corepack enable
corepack prepare pnpm@11.19.0 --activate
```

On Windows PowerShell systems that block `.ps1` launchers, use the `.cmd` executable, for example `pnpm.cmd install`.

### Setup

```bash
git clone https://github.com/ayshrnjn/Stockfolio.git
cd Stockfolio
pnpm install --frozen-lockfile
```

Copy `server/.env.example` to `server/.env`, then replace the placeholders:

```dotenv
NODE_ENV=development
PORT=8080
LOG_LEVEL=info
CORS_ORIGIN=http://localhost:5173
TRUST_PROXY=1
JWT_SECRET=replace-with-at-least-32-random-characters
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/stockfolio
DATABASE_CONNECTION_TIMEOUT_MS=5000
DATABASE_SSL=false
DATABASE_SSL_REJECT_UNAUTHORIZED=true
STOCK_API_KEY=replace-with-your-indianapi-key
INDIAN_API_BASE_URL=https://stock.indianapi.in
```

Never commit `server/.env`. Generate a strong JWT secret instead of using the example value.

Initialize the schema and start both applications:

```bash
pnpm db:init
pnpm dev
```

- Web: `http://localhost:5173`
- API: `http://localhost:8080`
- Readiness: `http://localhost:8080/health`

Optional commands:

```bash
pnpm --filter stockfolio-server market:smoke reliance
pnpm --filter stockfolio-server seed
```

The seed command rebuilds only the well-known local demo account. Do not run it against a production database unless a public demo account is intentional.

## Verification

```bash
pnpm verify
pnpm audit --prod
```

`pnpm verify` runs strict type checking, 43 backend unit/integration tests, and both production builds. The tests cover:

- provider schema and mapping contracts;
- HTTP retry, timeout, and error normalization;
- environment and CORS validation;
- market-session cache timing and index failover;
- exact-symbol search aliases;
- FIFO cost basis and invalid ledgers;
- XIRR and portfolio aggregation;
- sell chronology and transaction idempotency; and
- authenticated route and validation envelopes.

## Render deployment

The repository is a monorepo. Configure two Render services from the repository root.

### Backend web service

| Setting | Value |
| --- | --- |
| Runtime | Node |
| Build command | `npx --yes pnpm@11.19.0 install --frozen-lockfile --prod=false && npx --yes pnpm@11.19.0 --filter stockfolio-server build && npx --yes pnpm@11.19.0 --filter stockfolio-server db:init` |
| Start command | `node server/dist/server.js` |
| Health-check path | `/health` |

Required environment variables:

```text
NODE_ENV=production
CORS_ORIGIN=https://YOUR-FRONTEND.onrender.com
TRUST_PROXY=1
JWT_SECRET=<strong random secret>
DATABASE_URL=<Neon connection string>
DATABASE_SSL=true
DATABASE_SSL_REJECT_UNAUTHORIZED=true
STOCK_API_KEY=<IndianAPI key>
INDIAN_API_BASE_URL=https://stock.indianapi.in
```

The API root intentionally returns `404`; Render should probe `/health` or `/live`.

### Frontend static site

| Setting | Value |
| --- | --- |
| Build command | `npx --yes pnpm@11.19.0 install --frozen-lockfile --prod=false && npx --yes pnpm@11.19.0 --filter stockfolio-web build` |
| Publish directory | `web/dist` |
| Environment | `VITE_API_BASE_URL=https://YOUR-BACKEND.onrender.com` |

Add this SPA routing rule under **Redirects/Rewrites**:

| Source | Destination | Action |
| --- | --- | --- |
| `/*` | `/index.html` | Rewrite |

`VITE_API_BASE_URL` is embedded at build time. After changing it, clear the frontend build cache and redeploy.

## Intentional scope and production trade-offs

- One named portfolio is created per user; multi-portfolio support is not included.
- The UI intentionally omits transaction history, editing, deletion, watchlists, alerts, dividends, fees, taxes, and corporate actions.
- Execution prices are user-entered because the selected market provider does not guarantee historical intraday execution prices.
- Index fallback data can be delayed and is labelled accordingly.
- The cache is process-local and appropriate for one Render instance; horizontal scaling would use Redis or another shared cache.
- JWTs are stored in browser local storage with an in-memory fallback. A larger financial product should prefer short-lived access tokens plus rotating refresh tokens in hardened HTTP-only cookies.
- The SQL file is idempotent for this assignment. A longer-lived product should adopt versioned migrations before multiple teams deploy schema changes.
- External market data is informational and may be delayed or unavailable. StockFolio does not provide investment advice or execute trades.

## Reviewer walkthrough

1. Open the public dashboard and confirm the four indices and active-company links.
2. Search `TCS`, `Reliance`, or `M&M`; use arrow keys and Enter to open an NSE or BSE result.
3. Inspect quote, history ranges, fundamentals, and the company description.
4. Register, record a historical BUY with its actual price, and confirm that the holding appears.
5. Add a second BUY to see FIFO average cost change.
6. Attempt a SELL before the BUY date and confirm that the server rejects it.
7. Record a valid partial SELL and inspect realized, unrealized, total, absolute, and annualized returns.
8. Retry the same write with its idempotency key and confirm it does not create a duplicate.

---

Built as a full-stack engineering assignment focused on correctness, explicit trade-offs, and code that is straightforward to review.
