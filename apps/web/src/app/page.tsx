"use client";

import { LogOut, UserRound } from "lucide-react";
import { useEffect, useState } from "react";
import { ConsentGate } from "@/components/ConsentGate";
import { LoginPanel } from "@/components/LoginPanel";
import { PassageLanding } from "@/components/PassageLanding";
import { StudyDashboard } from "@/components/StudyDashboard";
import { clearToken, consentStatus, getToken, me } from "@/lib/api";
import type { ConsentStatus, Passage, User } from "@/lib/types";

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [passage, setPassage] = useState<Passage | null>(null);
  const [consents, setConsents] = useState<ConsentStatus | null>(null);
  const [booted, setBooted] = useState(false);

  useEffect(() => {
    async function boot() {
      if (!getToken()) {
        setBooted(true);
        return;
      }
      try {
        const currentUser = await me();
        setUser(currentUser);
        setConsents(await consentStatus());
      } catch {
        clearToken();
      } finally {
        setBooted(true);
      }
    }
    boot();
  }, []);

  function logout() {
    clearToken();
    setUser(null);
    setPassage(null);
    setConsents(null);
  }

  async function handleLogin(nextUser: User) {
    try {
      const nextConsents = await consentStatus();
      setUser(nextUser);
      setConsents(nextConsents);
    } catch (error) {
      clearToken();
      throw error;
    }
  }

  function handleAccountDeleted() {
    logout();
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          Lingovector <span>v0.3 MVP</span>
        </div>
        {user ? (
          <div className="user-chip">
            <UserRound size={16} /> {user.email}
            <button className="icon-button" title="로그아웃" onClick={logout}>
              <LogOut size={16} />
            </button>
          </div>
        ) : null}
      </header>
      <main className="main">
        {!booted ? null : !user ? (
          <LoginPanel onLogin={handleLogin} />
        ) : !consents ? (
          <p className="right-panel-empty">동의 상태를 확인하는 중입니다...</p>
        ) : consents && !consents.has_required_consents ? (
          <ConsentGate status={consents} onAccepted={setConsents} />
        ) : passage ? (
          <StudyDashboard passage={passage} onNewPassage={() => setPassage(null)} onPassage={setPassage} onAccountDeleted={handleAccountDeleted} />
        ) : (
          <PassageLanding onPassage={setPassage} />
        )}
      </main>
    </div>
  );
}
