"use client";

import { LogIn } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { login, setToken } from "@/lib/api";
import type { User } from "@/lib/types";

const DEV_LOGIN_VISIBLE = process.env.NODE_ENV !== "production";

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
      setError(readableLoginError(err));
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
          영어를 한국어로 외우는 대신, 문장 논리와 뉘앙스, 깊은 어휘 감각, 발음,
          영작 자신감을 함께 기르는 Dimigo 학생용 영어 학습 도구입니다.
        </p>
      </div>
      <div className={`panel login-panel ${busy ? "loading" : ""}`}>
        <h2>로그인</h2>
        <div id="google-login-button" />
        {!process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ? (
          <p className="helper-text">이 빌드에는 Google 로그인이 아직 설정되지 않았습니다. 선생님이나 관리자에게 베타 설정을 확인해 달라고 알려 주세요.</p>
        ) : null}
        {DEV_LOGIN_VISIBLE ? (
          <>
            <div className="field">
              <label htmlFor="id-token">로컬 개발용 토큰</label>
              <input id="id-token" value={tokenInput} onChange={(event) => setTokenInput(event.target.value)} />
            </div>
            <button className="primary" onClick={() => completeLogin(tokenInput)}>
              <LogIn size={17} /> 개발 모드로 계속하기
            </button>
          </>
        ) : null}
        {error ? <div className="error">{error}</div> : null}
      </div>
    </section>
  );
}

function readableLoginError(error: unknown) {
  const message = error instanceof Error ? error.message : "로그인에 실패했습니다.";
  if (message.includes("email must be verified")) {
    return "Lingovector를 사용하려면 Google 계정 이메일 인증이 완료되어 있어야 합니다.";
  }
  if (message.includes("dimigo.hs.kr") || message.includes("hosted domain")) {
    return "인증된 @dimigo.hs.kr Google 계정으로 로그인해 주세요.";
  }
  if (message.includes("development login token is disabled")) {
    return "이 서버에서는 로컬 개발 로그인이 꺼져 있습니다. Google 로그인으로 접속해 주세요.";
  }
  if (message.includes("unauthorized")) {
    return "로그인에 실패했습니다. 학교 Google 계정으로 다시 시도해 주세요.";
  }
  return "로그인에 실패했습니다. 잠시 후 다시 시도하거나 학교 Google 계정을 확인해 주세요.";
}
