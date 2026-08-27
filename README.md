<div align="center">

# StockFolio

**A full-stack Indian stock portfolio tracker for NSE and BSE equities.**

[Live application](https://stockfolio-1.onrender.com) · [API health](https://stockfolio-8r6n.onrender.com/health)

</div>

StockFolio lets users search Indian stocks, view market information, record dated BUY and SELL transactions, and monitor portfolio performance using FIFO profit/loss, absolute return, and annualized return.

## Features

- Public dashboard with NIFTY 50, SENSEX, NIFTY BANK, NIFTY IT, and active NSE companies
- NSE and BSE stock search with stock details, price history, fundamentals, and descriptions
- Registration and login
- Manual BUY and SELL entry with quantity, execution price, and trade date
- FIFO average cost and realized, unrealized, total, and daily gain/loss
- Absolute and money-weighted annualized returns
- Responsive portfolio dashboard with loading, empty, stale, and error states

## Transaction validation

The backend validates important portfolio edge cases:

- A BUY must exist before shares can be sold.
- A SELL cannot exceed the quantity available on its selected date.
- A backdated SELL cannot make any later portfolio balance negative.
- Future transaction dates and zero or negative quantities and prices are rejected.
- Past trades require the user’s actual execution price; today’s price is never stored for them automatically.
- Duplicate submissions are prevented with idempotency keys.
- Portfolio calculations use FIFO lots and decimal arithmetic.

## Search highlights

- **300 ms debounce** to avoid unnecessary requests
- **Request cancellation** and sequence protection against outdated results
- **Rate limiting** on public market-data and search endpoints
- **Five-minute caching** with stale-data fallback
- Strict query and third-party response validation
- Keyboard navigation, Enter selection, Escape handling, and ARIA combobox support
- Provider alias handling for symbols such as `M&M`

## API

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/health` | Database readiness |
| `GET` | `/api/stocks/overview` | Indices and active companies |
| `GET` | `/api/stocks/search?q=TCS` | Search NSE/BSE stocks |
| `GET` | `/api/stocks/:exchange/:symbol` | Stock details and quote |
| `GET` | `/api/stocks/:exchange/:symbol/history?range=1M` | Daily price history |
| `GET` | `/api/portfolio/holdings` | Portfolio holdings and performance |
| `POST` | `/api/portfolio/transactions` | Record a BUY or SELL |

## Technology

| Area | Technology |
| --- | --- |
| Frontend | React, TypeScript, React Router, Vite, Tailwind CSS, Recharts |
| Backend | Node.js, Express, TypeScript, Zod, `decimal.js` |
| Database | PostgreSQL / Neon |
| Market data | IndianAPI and Yahoo Finance |

## Local setup

Requirements: Node.js 24, pnpm 11.19.0, PostgreSQL/Neon, and an IndianAPI key.

```bash
pnpm install --frozen-lockfile
```

Copy `server/.env.example` to `server/.env` and provide `DATABASE_URL`, `JWT_SECRET`, `STOCK_API_KEY`, and `CORS_ORIGIN`.

```bash
pnpm db:init
pnpm dev
```

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:8080`

## Verification

```bash
pnpm verify
pnpm audit --prod
```

The verification command runs strict TypeScript checks, 43 backend tests, and production builds for both applications.
