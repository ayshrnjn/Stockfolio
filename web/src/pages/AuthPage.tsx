import { useState, type FormEvent } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { ApiError } from "../api/client";
import { useAuth } from "../auth/AuthContext";

type AuthMode = "login" | "register";
type FieldName = "name" | "email" | "password" | "confirmPassword";
type FieldErrors = Partial<Record<FieldName, string>>;

interface LocationState {
  from?: unknown;
}

function readServerFieldErrors(details: unknown): FieldErrors {
  if (typeof details !== "object" || details === null || Array.isArray(details)) return {};
  const result: FieldErrors = {};
  for (const field of ["name", "email", "password"] as const) {
    const messages = (details as Record<string, unknown>)[field];
    if (Array.isArray(messages) && typeof messages[0] === "string") result[field] = messages[0];
  }
  return result;
}

export function AuthPage(): JSX.Element {
  const { status, login, register } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mode, setMode] = useState<AuthMode>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const state = location.state as LocationState | null;
  const requestedPath = typeof state?.from === "string" && state.from.startsWith("/")
    ? state.from
    : "/portfolio";

  if (status === "authenticated") return <Navigate replace to={requestedPath} />;

  const switchMode = (nextMode: AuthMode): void => {
    setMode(nextMode);
    setFieldErrors({});
    setFormError(null);
  };

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const nextErrors: FieldErrors = {};
    if (mode === "register" && name.trim().length < 2) nextErrors.name = "Name must contain at least 2 characters";
    if (!email.trim()) nextErrors.email = "Email is required";
    if (password.length < 8) nextErrors.password = "Password must contain at least 8 characters";
    if (mode === "register" && confirmPassword !== password) nextErrors.confirmPassword = "Passwords do not match";
    if (Object.keys(nextErrors).length > 0) {
      setFieldErrors(nextErrors);
      return;
    }

    setSubmitting(true);
    setFieldErrors({});
    setFormError(null);
    try {
      if (mode === "login") {
        await login({ email: email.trim(), password });
      } else {
        await register({ name: name.trim(), email: email.trim(), password });
      }
      navigate(requestedPath, { replace: true });
    } catch (error) {
      if (error instanceof ApiError) {
        const serverErrors = readServerFieldErrors(error.details);
        setFieldErrors(serverErrors);
        setFormError(Object.keys(serverErrors).length > 0 ? null : error.message);
      } else {
        setFormError("Unable to reach StockFolio. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-7xl items-stretch lg:grid-cols-2">
      <section className="hidden bg-ink px-12 py-16 text-white lg:flex lg:flex-col lg:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-300">Your portfolio, explained</p>
          <h1 className="mt-6 max-w-lg text-5xl font-semibold leading-tight tracking-[-0.04em]">
            Make every investment decision visible.
          </h1>
          <p className="mt-6 max-w-md text-lg leading-8 text-slate-300">
            One secure account for NSE and BSE holdings, live valuations, and clear return insights.
          </p>
        </div>
        <p className="text-sm text-slate-400">Passwords are hashed before storage. Your market-data key stays server-side.</p>
      </section>

      <section className="flex items-center justify-center px-5 py-12 sm:px-10 lg:px-16">
        <div className="w-full max-w-md">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-brand-700">Welcome to StockFolio</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-ink">
            {mode === "login" ? "Sign in to your portfolio" : "Create your account"}
          </h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            {mode === "login"
              ? "Continue where you left off."
              : "Your first portfolio will be created automatically."}
          </p>

          <div className="mt-8 grid grid-cols-2 rounded-xl bg-slate-100 p-1" role="tablist" aria-label="Authentication mode">
            <ModeTab active={mode === "login"} label="Login" onClick={() => switchMode("login")} />
            <ModeTab active={mode === "register"} label="Register" onClick={() => switchMode("register")} />
          </div>

          <form className="mt-7 space-y-5" onSubmit={(event) => void submit(event)} noValidate>
            {mode === "register" ? (
              <Field
                autoComplete="name"
                error={fieldErrors.name}
                label="Full name"
                name="name"
                onChange={setName}
                placeholder="Your full name"
                type="text"
                value={name}
              />
            ) : null}
            <Field
              autoComplete="email"
              error={fieldErrors.email}
              label="Email address"
              name="email"
              onChange={setEmail}
              placeholder="you@example.com"
              type="email"
              value={email}
            />
            <Field
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              error={fieldErrors.password}
              hint={mode === "register" ? "Use at least 8 characters." : undefined}
              label="Password"
              name="password"
              onChange={setPassword}
              placeholder="Enter your password"
              type="password"
              value={password}
            />
            {mode === "register" ? (
              <Field
                autoComplete="new-password"
                error={fieldErrors.confirmPassword}
                label="Confirm password"
                name="confirmPassword"
                onChange={setConfirmPassword}
                placeholder="Enter your password again"
                type="password"
                value={confirmPassword}
              />
            ) : null}

            {formError ? (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
                {formError}
              </div>
            ) : null}

            <button
              className="flex w-full items-center justify-center rounded-xl bg-brand-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={submitting}
              type="submit"
            >
              {submitting ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}
            </button>
          </form>
          <p className="mt-6 text-center text-sm text-slate-600">
            {mode === "login" ? "Don't have an account?" : "Already have an account?"}{" "}
            <button type="button" className="font-semibold text-brand-700 hover:text-brand-600" onClick={() => switchMode(mode === "login" ? "register" : "login")}>
              {mode === "login" ? "Create one" : "Sign in"}
            </button>
          </p>
        </div>
      </section>
    </main>
  );
}

function ModeTab({ active, label, onClick }: { active: boolean; label: string; onClick(): void }): JSX.Element {
  return (
    <button
      aria-selected={active}
      className={`rounded-lg px-4 py-2.5 text-sm font-semibold transition ${
        active ? "bg-white text-ink shadow-sm" : "text-slate-500 hover:text-slate-700"
      }`}
      onClick={onClick}
      role="tab"
      type="button"
    >
      {label}
    </button>
  );
}

interface FieldProps {
  autoComplete: string;
  error?: string | undefined;
  hint?: string | undefined;
  label: string;
  name: string;
  onChange(value: string): void;
  placeholder: string;
  type: "email" | "password" | "text";
  value: string;
}

function Field({ autoComplete, error, hint, label, name, onChange, placeholder, type, value }: FieldProps): JSX.Element {
  const messageId = `${name}-message`;
  return (
    <div>
      <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor={name}>{label}</label>
      <input
        aria-describedby={error || hint ? messageId : undefined}
        aria-invalid={Boolean(error)}
        autoComplete={autoComplete}
        className={`w-full rounded-xl border bg-white px-4 py-3 text-sm text-ink shadow-sm transition placeholder:text-slate-400 ${
          error ? "border-red-300 focus:border-red-400" : "border-slate-300 focus:border-brand-500"
        }`}
        id={name}
        name={name}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        type={type}
        value={value}
      />
      {error ? <p className="mt-2 text-xs text-red-600" id={messageId}>{error}</p> : null}
      {!error && hint ? <p className="mt-2 text-xs text-slate-500" id={messageId}>{hint}</p> : null}
    </div>
  );
}
