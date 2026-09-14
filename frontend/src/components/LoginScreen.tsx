import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth-store";
import bunny from "@/assets/kanbunny.png";

export function LoginScreen() {
  const { signIn } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await signIn(username, password);
      // On success the token changes and AuthGate swaps this screen for the board.
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not sign in.");
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-sm"
      >
        <div className="flex items-center gap-3">
          <img src={bunny} alt="" width={40} height={40} className="size-10" />
          <div>
            <h1 className="text-lg font-bold">Kanbunny</h1>
            <p className="text-xs text-muted-foreground">Sign in to see your board.</p>
          </div>
        </div>

        <div className="mt-5 grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="username">Username</Label>
            <Input
              id="username"
              autoFocus
              autoComplete="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>
        </div>

        {error && (
          <p role="alert" className="mt-3 text-sm text-destructive">
            {error}
          </p>
        )}

        <Button type="submit" className="mt-5 w-full" disabled={busy || !username || !password}>
          {busy ? "Signing in…" : "Sign in"}
        </Button>

        <p className="mt-4 text-center text-[11px] text-muted-foreground">
          The demo account is <span className="font-mono">mila</span> /{" "}
          <span className="font-mono">carrots123</span>.
        </p>
      </form>
    </div>
  );
}

/** Shows the sign-in form until there is a token. Transparent in demo mode. */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const { authenticated } = useAuth();
  return authenticated ? <>{children}</> : <LoginScreen />;
}
