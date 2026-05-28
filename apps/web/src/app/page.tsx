"use client";

import { LogOut, UserRound } from "lucide-react";
import { useEffect, useState } from "react";
import { LoginPanel } from "@/components/LoginPanel";
import { PassageLanding } from "@/components/PassageLanding";
import { StudyDashboard } from "@/components/StudyDashboard";
import { clearToken, getToken, me } from "@/lib/api";
import type { Passage, User } from "@/lib/types";

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [passage, setPassage] = useState<Passage | null>(null);
  const [booted, setBooted] = useState(false);

  useEffect(() => {
    async function boot() {
      if (!getToken()) {
        setBooted(true);
        return;
      }
      try {
        setUser(await me());
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
          <LoginPanel onLogin={setUser} />
        ) : passage ? (
          <StudyDashboard passage={passage} onNewPassage={() => setPassage(null)} onPassage={setPassage} />
        ) : (
          <PassageLanding onPassage={setPassage} />
        )}
      </main>
    </div>
  );
}
