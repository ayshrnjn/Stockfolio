CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT users_email_normalized CHECK (email = lower(email))
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS name TEXT;
UPDATE users SET name = initcap(replace(split_part(email, '@', 1), '.', ' ')) WHERE name IS NULL;
ALTER TABLE users ALTER COLUMN name SET NOT NULL;

CREATE TABLE IF NOT EXISTS portfolios (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'INR',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT portfolios_user_name_unique UNIQUE (user_id, name)
);

CREATE TABLE IF NOT EXISTS instruments (
  id BIGSERIAL PRIMARY KEY,
  provider_id TEXT,
  symbol TEXT NOT NULL,
  exchange TEXT NOT NULL,
  provider_symbol TEXT,
  company_name TEXT NOT NULL,
  sector TEXT,
  industry TEXT,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT instruments_exchange_valid CHECK (exchange IN ('NSE', 'BSE')),
  CONSTRAINT instruments_symbol_exchange_unique UNIQUE (symbol, exchange)
);

CREATE TABLE IF NOT EXISTS transactions (
  id BIGSERIAL PRIMARY KEY,
  portfolio_id BIGINT NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
  instrument_id BIGINT NOT NULL REFERENCES instruments(id) ON DELETE RESTRICT,
  type TEXT NOT NULL,
  quantity NUMERIC(18,4) NOT NULL,
  price NUMERIC(18,4) NOT NULL,
  fees NUMERIC(18,4) NOT NULL DEFAULT 0,
  -- Portfolio accounting intentionally uses the exchange trade date. Intraday
  -- execution time is outside this application's scope.
  txn_date DATE NOT NULL,
  notes TEXT,
  client_request_id UUID NOT NULL,
  request_hash CHAR(64) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT transactions_type_valid CHECK (type IN ('BUY', 'SELL')),
  CONSTRAINT transactions_quantity_positive CHECK (quantity > 0),
  CONSTRAINT transactions_price_positive CHECK (price > 0),
  CONSTRAINT transactions_fees_non_negative CHECK (fees >= 0),
  CONSTRAINT transactions_notes_length CHECK (notes IS NULL OR length(notes) <= 500),
  CONSTRAINT transactions_idempotency_unique UNIQUE (portfolio_id, client_request_id)
);

CREATE TABLE IF NOT EXISTS idempotency_keys (
  key UUID NOT NULL,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  request_hash CHAR(64) NOT NULL,
  response_body JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, key)
);

CREATE INDEX IF NOT EXISTS portfolios_user_id_idx ON portfolios(user_id);
CREATE INDEX IF NOT EXISTS transactions_portfolio_id_idx ON transactions(portfolio_id);
CREATE INDEX IF NOT EXISTS transactions_instrument_id_idx ON transactions(instrument_id);
CREATE INDEX IF NOT EXISTS transactions_ledger_order_idx
  ON transactions(portfolio_id, instrument_id, txn_date, created_at, id);
CREATE INDEX IF NOT EXISTS idempotency_keys_created_at_idx ON idempotency_keys(created_at);
