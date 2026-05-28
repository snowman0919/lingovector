"use client";

import { LogIn } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { login, setToken } from "@/lib/api";
import type { User } from "@/lib/types";

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (args: { client_id: string; callback: (response: { credential: string }) => void }) => void;
          renderButton: (element: HTMLElement, options: Record<string, unknown>) => void;
        };
      };
    };
  }
}

export function LoginPanel({ onLogin }: { onLogin: (user: User) => void }) {
  const [tokenInput, setTokenInput] = useState("dev:student@dimigo.hs.kr");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const completeLogin = useCallback(async (idToken: string) => {
    setBusy(true);
    setError("");
    try {
      const result = await login(idToken);
      setToken(result.access_token);
      onLogin(result.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setBusy(false);
    }
  }, [onLogin]);

  useEffect(() => {
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    if (!clientId) return;
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.onload = () => {
      const target = document.getElementById("google-login-button");
      if (!target || !window.google) return;
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: (response) => completeLogin(response.credential),
      });
      window.google.accounts.id.renderButton(target, { theme: "outline", size: "large", width: 320 });
    };
    document.head.appendChild(script);
    return () => {
      script.remove();
    };
  }, [completeLogin]);

  return (
    <section className="login-grid">
      <div className="login-copy">
        <h1>Lingovector</h1>
        <p>
          Study English as a system for thinking: sentence logic, nuance, vocabulary depth,
          pronunciation, and writing confidence for Dimigo students.
        </p>
      </div>
      <div className={`panel login-panel ${busy ? "loading" : ""}`}>
        <h2>Sign in</h2>
        <div id="google-login-button" />
        <div className="field">
          <label htmlFor="id-token">Google ID token or local dev token</label>
          <input id="id-token" value={tokenInput} onChange={(event) => setTokenInput(event.target.value)} />
        </div>
        <button className="primary" onClick={() => completeLogin(tokenInput)}>
          <LogIn size={17} /> Continue
        </button>
        {error ? <div className="error">{error}</div> : null}
      </div>
    </section>
  );
}
