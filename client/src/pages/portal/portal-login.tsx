import { useEffect, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, AlertCircle, ArrowLeft, CheckCircle2, Home } from "lucide-react";
import redlogo from "@assets/redlogo.webp";

type View =
  | "login"
  | "signup-phone"
  | "signup-code"
  | "signup-pick"
  | "signup-password"
  | "forgot-phone"
  | "forgot-reset"
  | "set-password"
  | "validating-token";

interface Candidate {
  customerId: string;
  name: string;
  address: string | null;
}

const BRAND = "#711419";

const inputClass = "h-12 rounded-[4px] bg-white text-[16px] focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:outline-none focus-visible:border-slate-400";

async function postJson(url: string, body: Record<string, unknown>) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    credentials: "include",
  });
  let data: any = {};
  try {
    data = await res.json();
  } catch {
    // non-JSON error body
  }
  return { ok: res.ok, data };
}

function SubmitButton({ loading, children, testid }: { loading: boolean; children: React.ReactNode; testid: string }) {
  return (
    <button
      type="submit"
      disabled={loading}
      className="flex h-12 w-full items-center justify-center rounded-[4px] bg-[#711419] text-base font-semibold text-white shadow-sm transition-transform active:scale-[0.98] disabled:opacity-60"
      data-testid={testid}
    >
      {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : children}
    </button>
  );
}

export default function PortalLogin() {
  const [, setLocation] = useLocation();
  const searchString = useSearch();

  const hasToken = new URLSearchParams(searchString).has("token");
  const [view, setView] = useState<View>(hasToken ? "validating-token" : "login");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Login form
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");

  // Signup / forgot flows
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [verifyToken, setVerifyToken] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const switchView = (next: View) => {
    setError(null);
    setInfo(null);
    setView(next);
  };

  // Legacy magic-link tokens still work: validate, then either go straight to
  // the dashboard or ask the invited customer to create their password.
  useEffect(() => {
    if (!hasToken) return;
    const token = new URLSearchParams(searchString).get("token");
    (async () => {
      const { ok } = await postJson("/api/portal/auth/validate-token", { token });
      if (!ok) {
        setView("login");
        setError("That link has expired or is invalid. Log in below, or contact us for a new link.");
        return;
      }
      try {
        const meRes = await fetch("/api/portal/auth/me", { credentials: "include" });
        const me = meRes.ok ? await meRes.json() : null;
        if (me && me.account && !me.account.hasPassword) {
          setView("set-password");
          setInfo("Welcome! Create a password so you can log in anytime with your phone number or email.");
          return;
        }
      } catch {
        // fall through to dashboard; they can set a password from the profile page
      }
      setLocation("/portal/dashboard");
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchString]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { ok, data } = await postJson("/api/portal/auth/login", { identifier, password });
    setLoading(false);
    if (ok) {
      setLocation("/portal/dashboard");
    } else {
      setError(data.message || "Login failed. Please try again.");
    }
  };

  const handleSignupStart = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { ok, data } = await postJson("/api/portal/auth/signup/start", { phone });
    setLoading(false);
    if (ok) {
      setCode("");
      switchView("signup-code");
      setInfo(data.message || "If we found a matching account, a code was texted to that number.");
    } else {
      setError(data.message || "Something went wrong. Please try again.");
    }
  };

  const handleSignupVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { ok, data } = await postJson("/api/portal/auth/signup/verify", { phone, code });
    setLoading(false);
    if (!ok) {
      setError(data.message || "Invalid code. Please try again.");
      return;
    }
    const found: Candidate[] = data.candidates || [];
    setVerifyToken(data.verifyToken);
    if (found.length === 0) {
      switchView("signup-phone");
      setError(
        "We verified your number, but couldn't find an account to set up. You may already have a portal login (try \"Forgot password\"), or give us a call and we'll get you set up.",
      );
    } else if (found.length === 1) {
      setCandidates(found);
      setSelectedCustomerId(found[0].customerId);
      switchView("signup-password");
    } else {
      setCandidates(found);
      setSelectedCustomerId(null);
      switchView("signup-pick");
    }
  };

  const handleSignupComplete = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setError("Passwords don't match");
      return;
    }
    setLoading(true);
    setError(null);
    const { ok, data } = await postJson("/api/portal/auth/signup/complete", {
      verifyToken,
      customerId: selectedCustomerId,
      password: newPassword,
    });
    setLoading(false);
    if (ok) {
      setLocation("/portal/dashboard");
    } else {
      setError(data.message || "Failed to create your account. Please try again.");
    }
  };

  const handleForgotStart = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { ok, data } = await postJson("/api/portal/auth/forgot/start", { phone });
    setLoading(false);
    if (ok) {
      setCode("");
      switchView("forgot-reset");
      setInfo(data.message || "If we found a matching account, a code was texted to that number.");
    } else {
      setError(data.message || "Something went wrong. Please try again.");
    }
  };

  const handleForgotComplete = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setError("Passwords don't match");
      return;
    }
    setLoading(true);
    setError(null);
    const { ok, data } = await postJson("/api/portal/auth/forgot/complete", {
      phone,
      code,
      newPassword,
    });
    setLoading(false);
    if (ok) {
      setLocation("/portal/dashboard");
    } else {
      setError(data.message || "Failed to reset password. Please try again.");
    }
  };

  const handleSetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setError("Passwords don't match");
      return;
    }
    setLoading(true);
    setError(null);
    const { ok, data } = await postJson("/api/portal/auth/set-password", { password: newPassword });
    setLoading(false);
    if (ok) {
      setLocation("/portal/dashboard");
    } else {
      setError(data.message || "Failed to set password. Please try again.");
    }
  };

  const backToLogin = (
    <button
      type="button"
      onClick={() => switchView("login")}
      className="inline-flex items-center gap-1 text-sm text-slate-500"
      data-testid="button-back-to-login"
    >
      <ArrowLeft className="h-3.5 w-3.5" /> Back to login
    </button>
  );

  const alerts = (
    <>
      {error && (
        <div className="flex items-start gap-2 rounded-[4px] border border-red-200 bg-red-50 p-3 text-sm text-red-700" data-testid="text-error">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {info && !error && (
        <div className="flex items-start gap-2 rounded-[4px] border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700" data-testid="text-info">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{info}</span>
        </div>
      )}
    </>
  );

  const passwordFields = (
    <>
      <div className="space-y-2">
        <Label htmlFor="new-password">Password</Label>
        <Input
          id="new-password"
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          minLength={8}
          required
          placeholder="At least 8 characters"
          className={inputClass}
          data-testid="input-new-password"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="confirm-password">Confirm password</Label>
        <Input
          id="confirm-password"
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          minLength={8}
          required
          className={inputClass}
          data-testid="input-confirm-password"
        />
      </div>
    </>
  );

  let title = "Customer Portal";
  let description: string | null = null;
  let body: React.ReactNode = null;

  switch (view) {
    case "validating-token":
      body = (
        <div className="flex flex-col items-center gap-4 py-8" data-testid="status-validating">
          <Loader2 className="h-8 w-8 animate-spin" style={{ color: BRAND }} />
          <p className="text-slate-600">Validating your access link...</p>
        </div>
      );
      break;

    case "login":
      description = "Log in with your phone number or email";
      body = (
        <form onSubmit={handleLogin} className="space-y-4">
          {alerts}
          <div className="space-y-2">
            <Label htmlFor="identifier">Phone number or email</Label>
            <Input
              id="identifier"
              type="text"
              autoComplete="username"
              placeholder="(555) 555-1234 or you@email.com"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              required
              className={inputClass}
              data-testid="input-identifier"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className={inputClass}
              data-testid="input-password"
            />
          </div>
          <SubmitButton loading={loading} testid="button-login">Log In</SubmitButton>
          <div className="flex items-center justify-between text-sm">
            <button
              type="button"
              onClick={() => { setPhone(""); switchView("forgot-phone"); }}
              className="text-slate-500"
              data-testid="link-forgot-password"
            >
              Forgot password?
            </button>
            <button
              type="button"
              onClick={() => { setPhone(""); switchView("signup-phone"); }}
              className="font-semibold"
              style={{ color: BRAND }}
              data-testid="link-create-account"
            >
              Create an account
            </button>
          </div>
        </form>
      );
      break;

    case "signup-phone":
      title = "Create Your Account";
      description = "Enter the phone number we have on file for you — we'll text you a verification code.";
      body = (
        <form onSubmit={handleSignupStart} className="space-y-4">
          {alerts}
          <div className="space-y-2">
            <Label htmlFor="signup-phone">Phone number</Label>
            <Input
              id="signup-phone"
              type="tel"
              placeholder="(555) 555-1234"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
              className={inputClass}
              data-testid="input-signup-phone"
            />
          </div>
          <SubmitButton loading={loading} testid="button-signup-start">Text Me a Code</SubmitButton>
          {backToLogin}
        </form>
      );
      break;

    case "signup-code":
      title = "Enter Verification Code";
      description = `We texted a 6-digit code to ${phone}.`;
      body = (
        <form onSubmit={handleSignupVerify} className="space-y-4">
          {alerts}
          <div className="space-y-2">
            <Label htmlFor="signup-code">Verification code</Label>
            <Input
              id="signup-code"
              type="text"
              inputMode="numeric"
              maxLength={6}
              placeholder="123456"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              required
              className={inputClass}
              data-testid="input-signup-code"
            />
          </div>
          <SubmitButton loading={loading} testid="button-signup-verify">Verify</SubmitButton>
          <button
            type="button"
            onClick={() => switchView("signup-phone")}
            className="text-sm text-slate-500"
            data-testid="button-resend-code"
          >
            Didn't get a code? Try again
          </button>
        </form>
      );
      break;

    case "signup-pick":
      title = "Choose Your Account";
      description = "This phone number is linked to more than one account. Which one is yours?";
      body = (
        <div className="space-y-4">
          {alerts}
          <div className="space-y-2">
            {candidates.map((c) => (
              <button
                key={c.customerId}
                type="button"
                onClick={() => { setSelectedCustomerId(c.customerId); switchView("signup-password"); }}
                className="flex w-full items-start gap-3 rounded-[4px] border border-slate-300/70 bg-white p-3.5 text-left transition-transform active:scale-[0.99]"
                data-testid={`button-candidate-${c.customerId}`}
              >
                <Home className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                <span>
                  <span className="block font-semibold text-slate-800">{c.name}</span>
                  {c.address && <span className="block text-sm text-slate-500">{c.address}</span>}
                </span>
              </button>
            ))}
          </div>
          {backToLogin}
        </div>
      );
      break;

    case "signup-password":
      title = "Set Your Password";
      description = candidates.find((c) => c.customerId === selectedCustomerId)?.name
        ? `Setting up portal access for ${candidates.find((c) => c.customerId === selectedCustomerId)!.name}.`
        : null;
      body = (
        <form onSubmit={handleSignupComplete} className="space-y-4">
          {alerts}
          {passwordFields}
          <SubmitButton loading={loading} testid="button-signup-complete">Create Account</SubmitButton>
          {backToLogin}
        </form>
      );
      break;

    case "forgot-phone":
      title = "Reset Password";
      description = "Enter your phone number and we'll text you a verification code.";
      body = (
        <form onSubmit={handleForgotStart} className="space-y-4">
          {alerts}
          <div className="space-y-2">
            <Label htmlFor="forgot-phone">Phone number</Label>
            <Input
              id="forgot-phone"
              type="tel"
              placeholder="(555) 555-1234"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
              className={inputClass}
              data-testid="input-forgot-phone"
            />
          </div>
          <SubmitButton loading={loading} testid="button-forgot-start">Text Me a Code</SubmitButton>
          <p className="text-xs text-slate-500">
            Log in with email only, or no longer have this number? Give us a call and we'll send you a fresh access link.
          </p>
          {backToLogin}
        </form>
      );
      break;

    case "forgot-reset":
      title = "Reset Password";
      description = `Enter the 6-digit code we texted to ${phone} and choose a new password.`;
      body = (
        <form onSubmit={handleForgotComplete} className="space-y-4">
          {alerts}
          <div className="space-y-2">
            <Label htmlFor="forgot-code">Verification code</Label>
            <Input
              id="forgot-code"
              type="text"
              inputMode="numeric"
              maxLength={6}
              placeholder="123456"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              required
              className={inputClass}
              data-testid="input-forgot-code"
            />
          </div>
          {passwordFields}
          <SubmitButton loading={loading} testid="button-forgot-complete">Reset Password</SubmitButton>
          {backToLogin}
        </form>
      );
      break;

    case "set-password":
      title = "Create Your Password";
      description = "You're logged in! Set a password so you can come back anytime without a new link.";
      body = (
        <form onSubmit={handleSetPassword} className="space-y-4">
          {alerts}
          {passwordFields}
          <SubmitButton loading={loading} testid="button-set-password">Save Password</SubmitButton>
          <button
            type="button"
            onClick={() => setLocation("/portal/dashboard")}
            className="text-sm text-slate-500"
            data-testid="button-skip-password"
          >
            Skip for now
          </button>
        </form>
      );
      break;
  }

  // Seamless sign-in — the form sits directly on the canvas (no card), same
  // as the app's login: centered logo, bold title, content up top.
  return (
    <div
      className="min-h-dvh overflow-y-auto bg-slate-50"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
      data-testid="portal-login-page"
      onFocusCapture={(e) => {
        const t = e.target as HTMLElement;
        if (t.tagName === "INPUT") {
          setTimeout(() => {
            t.scrollIntoView({ block: "center", behavior: "smooth" });
          }, 300);
        }
      }}
    >
      <div className="mx-auto flex w-full max-w-sm flex-col px-5 pb-16 pt-[10vh] animate-in fade-in duration-300">
        <img src={redlogo} alt="Giesbrecht HVAC" className="mx-auto mb-6 h-11" />
        <h1 className="text-center text-[26px] font-semibold tracking-tight text-slate-900" data-testid="text-login-title">
          {title}
        </h1>
        {description && (
          <p className="mt-1 text-center text-sm text-slate-500" data-testid="text-login-description">
            {description}
          </p>
        )}
        <div className="mt-7">{body}</div>

        {/* The other audience's door — mirrors the CRM login's portal link */}
        <p className="mt-10 border-t border-slate-200 pt-5 text-center text-sm text-slate-500" data-testid="link-team-signin">
          Work at Giesbrecht HVAC?{" "}
          <a href="/crm/login" className="font-semibold" style={{ color: BRAND }}>
            Team sign-in
          </a>
        </p>
      </div>
    </div>
  );
}
