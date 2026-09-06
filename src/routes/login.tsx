import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, MailCheck } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export const Route = createFileRoute("/login")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Sign in | Earthwork Estimation Pro" },
      {
        name: "description",
        content:
          "Sign in or create an account to access BWDB canal and embankment earthwork estimation projects.",
      },
      { property: "og:title", content: "Sign in | Earthwork Estimation Pro" },
      {
        property: "og:description",
        content: "Secure access to your earthwork estimation dashboard, sections and reports.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: LoginPage,
});

/** Reads Supabase verification info from the URL hash / query string. */
function readVerificationParams() {
  if (typeof window === "undefined") return null;
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const query = new URLSearchParams(window.location.search);
  const get = (k: string) => hash.get(k) ?? query.get(k);
  const type = get("type");
  const error = get("error_description") ?? get("error");
  const hasToken = Boolean(get("access_token") || get("token_hash") || get("code"));
  if (!type && !error && !hasToken) return null;
  return { type, error, hasToken };
}

function LoginPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [checkInbox, setCheckInbox] = useState<string | null>(null);
  const [verifyState, setVerifyState] = useState<
    { status: "verifying" | "verified" | "error"; message: string } | null
  >(null);

  const [signInEmail, setSignInEmail] = useState("");
  const [signInPassword, setSignInPassword] = useState("");
  const [signUpName, setSignUpName] = useState("");
  const [signUpEmail, setSignUpEmail] = useState("");
  const [signUpPassword, setSignUpPassword] = useState("");

  useEffect(() => {
    let cancelled = false;
    const params = readVerificationParams();

    if (params?.error) {
      setVerifyState({
        status: "error",
        message:
          "The verification link is invalid or has expired. Request a new one by signing up again.",
      });
    } else if (params?.hasToken || params?.type) {
      setVerifyState({
        status: "verifying",
        message: "Confirming your email verification…",
      });
    }

    const goToApp = (verified: boolean) => {
      if (cancelled) return;
      if (verified) {
        setVerifyState({
          status: "verified",
          message: "Email verified. Signing you in…",
        });
        toast.success("Email verified — signing you in");
      }
      // Clean the auth fragment out of the URL before navigating.
      if (typeof window !== "undefined" && (window.location.hash || window.location.search)) {
        window.history.replaceState({}, "", window.location.pathname);
      }
      navigate({ to: "/", replace: true });
    };

    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      if (data.session) {
        goToApp(Boolean(params?.hasToken || params?.type));
      } else if (params && !params.error) {
        // Token present but no session yet — wait briefly for Supabase to process it.
        window.setTimeout(async () => {
          if (cancelled) return;
          const { data: retry } = await supabase.auth.getSession();
          if (cancelled) return;
          if (retry.session) goToApp(true);
          else
            setVerifyState({
              status: "error",
              message:
                "We could not complete the verification automatically. Please sign in with your email and password below.",
            });
        }, 1500);
      }
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (session && (event === "SIGNED_IN" || event === "INITIAL_SESSION")) {
        goToApp(Boolean(params?.hasToken || params?.type));
      }
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [navigate]);


  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: signInEmail.trim(),
      password: signInPassword,
    });
    setLoading(false);
    if (error) {
      const message = describeAuthError(error.message, "signin");
      setFormError(message);
      toast.error(message);
      return;
    }
    toast.success("Signed in");
    navigate({ to: "/", replace: true });
  }

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email: signUpEmail.trim(),
      password: signUpPassword,
      options: {
        emailRedirectTo: window.location.origin,
        data: { display_name: signUpName.trim() || signUpEmail.split("@")[0] },
      },
    });
    setLoading(false);
    if (error) {
      const message = describeAuthError(error.message, "signup");
      setFormError(message);
      toast.error(message);
      return;
    }
    if (!data.session) {
      setCheckInbox(signUpEmail.trim());
      toast.success("Check your inbox to verify your email");
    }
  }

  async function handleGoogle() {
    setFormError(null);
    setLoading(true);
    let result: Awaited<ReturnType<typeof lovable.auth.signInWithOAuth>>;
    try {
      result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin,
      });
    } catch {
      setLoading(false);
      const message =
        "We couldn't reach Google. Check your internet connection and try again, or sign in with your email and password.";
      setFormError(message);
      toast.error(message);
      return;
    }
    if (result.error) {
      setLoading(false);
      const message = describeAuthError(
        typeof result.error === "string" ? result.error : ((result.error as { message?: string })?.message ?? ""),
        "google",
      );
      setFormError(message);
      toast.error(message);
      return;
    }
    if (result.redirected) return;
    navigate({ to: "/", replace: true });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Earthwork Estimation Pro
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            BWDB canal excavation &amp; embankment re-sectioning estimator
          </p>
        </div>

        {checkInbox ? (
          <Alert className="mb-4">
            <MailCheck className="h-4 w-4" />
            <AlertTitle>Verify your email</AlertTitle>
            <AlertDescription>
              We sent a confirmation link to <strong>{checkInbox}</strong>. Please verify your email
              before signing in.
            </AlertDescription>
          </Alert>
        ) : null}

        {verifyState ? (
          <Alert className="mb-4" variant={verifyState.status === "error" ? "destructive" : "default"}>
            {verifyState.status === "verifying" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <MailCheck className="h-4 w-4" />
            )}
            <AlertTitle>
              {verifyState.status === "verified"
                ? "Email verified"
                : verifyState.status === "verifying"
                  ? "Verifying…"
                  : "Verification problem"}
            </AlertTitle>
            <AlertDescription>{verifyState.message}</AlertDescription>
          </Alert>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>Welcome</CardTitle>
            <CardDescription>Sign in to your account or create a new one.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button
              type="button"
              variant="outline"
              className="w-full"
              disabled={loading}
              onClick={handleGoogle}
            >
              Sign in with Google
            </Button>

            <div className="relative py-1 text-center">
              <span className="relative z-10 bg-card px-2 text-xs uppercase text-muted-foreground">
                or continue with email
              </span>
              <span className="absolute inset-x-0 top-1/2 border-t border-border" />
            </div>

            <Tabs defaultValue="signin">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="signin">Sign in</TabsTrigger>
                <TabsTrigger value="signup">Sign up</TabsTrigger>
              </TabsList>

              <TabsContent value="signin">
                <form className="space-y-3" onSubmit={handleSignIn}>
                  <div className="space-y-1.5">
                    <Label htmlFor="signin-email">Email</Label>
                    <Input
                      id="signin-email"
                      type="email"
                      autoComplete="email"
                      required
                      value={signInEmail}
                      onChange={(e) => setSignInEmail(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="signin-password">Password</Label>
                    <Input
                      id="signin-password"
                      type="password"
                      autoComplete="current-password"
                      required
                      value={signInPassword}
                      onChange={(e) => setSignInPassword(e.target.value)}
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Sign in
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="signup">
                <form className="space-y-3" onSubmit={handleSignUp}>
                  <div className="space-y-1.5">
                    <Label htmlFor="signup-name">Display name</Label>
                    <Input
                      id="signup-name"
                      autoComplete="name"
                      value={signUpName}
                      onChange={(e) => setSignUpName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="signup-email">Email</Label>
                    <Input
                      id="signup-email"
                      type="email"
                      autoComplete="email"
                      required
                      value={signUpEmail}
                      onChange={(e) => setSignUpEmail(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="signup-password">Password</Label>
                    <Input
                      id="signup-password"
                      type="password"
                      autoComplete="new-password"
                      minLength={6}
                      required
                      value={signUpPassword}
                      onChange={(e) => setSignUpPassword(e.target.value)}
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Create account
                  </Button>
                </form>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
