"use client";

import { ShieldCheck } from "lucide-react";
import { useState } from "react";
import { acceptConsents } from "@/lib/api";
import type { ConsentStatus } from "@/lib/types";

export function ConsentGate({
  status,
  onAccepted,
}: {
  status: ConsentStatus;
  onAccepted: (status: ConsentStatus) => void;
}) {
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const allRequiredChecked = status.required
    .filter((item) => item.required)
    .every((item) => checked[item.consent_type]);

  async function submit() {
    if (!allRequiredChecked) {
      setError("필수 동의 항목을 모두 확인하고 체크해 주세요.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const next = await acceptConsents(status.required.map((item) => item.consent_type));
      onAccepted(next);
    } catch {
      setError("동의 내역을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="consent-page panel">
      <div className="consent-heading">
        <ShieldCheck size={26} />
        <div>
          <h1>베타 이용 전 개인정보 동의가 필요합니다</h1>
          <p>
            Lingovector는 학교 내부 베타 학습 서비스입니다. 아래 문서는 운영자 법무 검토 전 초안이며,
            실제 베타 시작 전 최종 검토가 필요합니다.
          </p>
        </div>
      </div>
      <div className="consent-list">
        {status.required.map((item) => (
          <label className="consent-item" key={item.consent_type}>
            <input
              type="checkbox"
              checked={Boolean(checked[item.consent_type])}
              onChange={(event) => setChecked((current) => ({ ...current, [item.consent_type]: event.target.checked }))}
            />
            <span>
              <b>{item.title}</b>
              <small>버전: {item.consent_version} · 운영자 검토 필요</small>
              <p>{item.body}</p>
            </span>
          </label>
        ))}
      </div>
      <div className="consent-actions">
        <button className="primary" disabled={busy || !allRequiredChecked} onClick={submit}>
          {busy ? "저장 중..." : "동의하고 학습 시작"}
        </button>
        {error ? <div className="error">{error}</div> : null}
      </div>
    </section>
  );
}
