import React, { useEffect, useState } from "react";

const SALE_DURATION_MS = 30 * 24 * 60 * 60 * 1000;

export function CountdownTimer({ apiUrl }: { apiUrl: string }) {
  const [deadline, setDeadline] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const [status, setStatus] = useState<"loading" | "waiting" | "active" | "ended">("loading");

  useEffect(() => {
    fetch(`${apiUrl}/api/first-block`)
      .then((r) => r.json())
      .then((d: any) => {
        if (d.timestamp) {
          setDeadline(d.timestamp + SALE_DURATION_MS);
          setStatus("active");
        } else {
          setStatus("waiting");
        }
      })
      .catch(() => setStatus("waiting"));
  }, [apiUrl]);

  useEffect(() => {
    if (status !== "active") return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [status]);

  useEffect(() => {
    if (deadline && now >= deadline) setStatus("ended");
  }, [now, deadline]);

  const remaining = deadline ? Math.max(0, deadline - now) : 0;
  const days = Math.floor(remaining / (1000 * 60 * 60 * 24));
  const hours = Math.floor((remaining / (1000 * 60 * 60)) % 24);
  const minutes = Math.floor((remaining / (1000 * 60)) % 60);
  const seconds = Math.floor((remaining / 1000) % 60);

  const pad = (n: number) => n.toString().padStart(2, "0");

  return (
    <div data-testid="countdown-timer" style={{
      textAlign: "center", padding: "28px 0 12px",
    }}>
      {status === "loading" && (
        <p style={{ color: "#484f58", fontSize: 14 }}>Loading...</p>
      )}
      {status === "waiting" && (
        <p style={{ color: "#d29922", fontSize: 16, fontWeight: 600 }}>Sale starts soon</p>
      )}
      {status === "ended" && (
        <p style={{ color: "#f85149", fontSize: 16, fontWeight: 600 }}>Sale ended</p>
      )}
      {status === "active" && (
        <div style={{ display: "flex", justifyContent: "center", gap: 16 }}>
          {[
            { value: pad(days), label: "DAYS" },
            { value: pad(hours), label: "HRS" },
            { value: pad(minutes), label: "MIN" },
            { value: pad(seconds), label: "SEC" },
          ].map((unit, i) => (
            <div key={i} style={{ textAlign: "center" }}>
              <div style={{
                fontSize: 36, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace",
                color: "#e6edf3", lineHeight: 1, letterSpacing: "2px",
                background: "#161b22", border: "1px solid #21262d",
                borderRadius: 8, padding: "12px 16px", minWidth: 70,
              }}>
                {unit.value}
              </div>
              <div style={{
                fontSize: 10, color: "#484f58", marginTop: 6,
                letterSpacing: "1.5px", fontWeight: 600,
              }}>
                {unit.label}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
