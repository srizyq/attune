import { useState, useEffect } from "react";
import { useProfile } from "../hooks/useProfile";
import { useCheckins } from "../hooks/useCheckins";
import { useHistory } from "../hooks/useHistory";
import AppNav from "../components/AppNav";
import { todayLocalDate, dateNDaysAgo, generateInsights, generateMoodResponse, computeStreak } from "../lib/patterns";

// ── skeleton card ────────────────────────────────────────────────────────────
function SkeletonCard() {
  return (
    <div style={{
      background: "var(--accent-bg)", border: "1px solid var(--border-active)",
      borderRadius: 12, padding: 20,
      display: "flex", alignItems: "flex-start", gap: 16,
    }}>
      <div style={{ width: 36, height: 36, borderRadius: 8, background: "var(--border-default)", flexShrink: 0, animation: "pulse 1.5s ease-in-out infinite" }} />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ width: 100, height: 10, borderRadius: 4, background: "var(--border-default)", animation: "pulse 1.5s ease-in-out infinite" }} />
        <div style={{ width: "90%", height: 12, borderRadius: 4, background: "var(--border-default)", animation: "pulse 1.5s ease-in-out infinite" }} />
        <div style={{ width: "72%", height: 12, borderRadius: 4, background: "var(--border-default)", animation: "pulse 1.5s ease-in-out infinite" }} />
      </div>
    </div>
  );
}

// ── insight card ─────────────────────────────────────────────────────────────
function InsightCard({ icon, title, body, accentColor, delay }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), delay || 0);
    return () => clearTimeout(t);
  }, [delay]);

  return (
    <div style={{
      background: "var(--accent-bg)", border: "1px solid var(--border-active)",
      borderRadius: 12, padding: 20,
      display: "flex", alignItems: "flex-start", gap: 16,
      opacity: visible ? 1 : 0,
      transform: visible ? "translateY(0)" : "translateY(10px)",
      transition: "opacity 0.4s ease, transform 0.4s ease",
    }}>
      <div style={{
        width: 36, height: 36, borderRadius: 8, flexShrink: 0,
        background: accentColor + "18",
        border: "1px solid " + accentColor + "40",
        display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17,
      }}>
        {icon}
      </div>
      <div>
        <div style={{
          fontSize: 11, color: accentColor, letterSpacing: "0.08em",
          textTransform: "uppercase", fontWeight: 600, marginBottom: 6,
        }}>
          {title}
        </div>
        <p style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.65, margin: 0 }}>
          {body}
        </p>
      </div>
    </div>
  );
}

// ── constants ─────────────────────────────────────────────────────────────────
const MOODS = [
  { id: "great", emoji: "😄", label: "Great" },
  { id: "good",  emoji: "🙂", label: "Good" },
  { id: "okay",  emoji: "😐", label: "Okay" },
  { id: "low",   emoji: "😔", label: "Low" },
  { id: "tired", emoji: "😴", label: "Tired" },
];

function lastNDays(n) {
  const days = [];
  for (let i = n - 1; i >= 0; i--) {
    const date = dateNDaysAgo(i);
    const label = new Date(date + "T00:00:00").toLocaleDateString("en-AU", { weekday: "short" });
    days.push({ date, label });
  }
  return days;
}

// ── main page ─────────────────────────────────────────────────────────────────
export default function AIInsights() {
  const { profile } = useProfile();

  const today = todayLocalDate();
  const { checkin, save: saveCheckin } = useCheckins(today);
  // 90 days (not 30) so the pattern engine's more specific candidates
  // (fibre, hydration, sugar, breakfast) have a real chance to each reach
  // their own 5-day-per-bucket minimum, not just the broadest ones.
  const { dailyData, loading: historyLoading } = useHistory(dateNDaysAgo(90), today);

  const name = profile?.name || "there";
  const initials = (profile?.name || 'A').trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase() || 'A';
  const streak = computeStreak(dailyData);

  // mood check-in state
  const [selectedMood, setSelectedMood]   = useState(null);
  const [selectedEnergy, setSelectedEnergy] = useState(null);
  const [moodNote, setMoodNote]           = useState("");
  const [moodSubmitted, setMoodSubmitted] = useState(false);
  const [moodResponse, setMoodResponse]   = useState("");
  const [loadingMood, setLoadingMood]     = useState(false);

  // sync form state once today's check-in loads
  useEffect(() => {
    if (checkin) {
      setSelectedMood(checkin.mood);
      setSelectedEnergy(checkin.energy);
      setMoodNote(checkin.note || "");
      setMoodResponse(generateMoodResponse(checkin.mood, checkin.energy));
      setMoodSubmitted(true);
    }
  }, [checkin]);

  const insights = generateInsights(dailyData, 3);
  const last7 = lastNDays(7);
  const byDate = new Map(dailyData.map(d => [d.date, d]));

  // ── submit mood check-in ────────────────────────────────────────────────────
  async function submitMood() {
    if (!selectedMood || !selectedEnergy) return;
    setLoadingMood(true);
    try {
      await saveCheckin({ mood: selectedMood, energy: selectedEnergy, note: moodNote || null });
      setMoodResponse(generateMoodResponse(selectedMood, selectedEnergy));
      setMoodSubmitted(true);
    } finally {
      setLoadingMood(false);
    }
  }

  function resetMood() {
    setMoodSubmitted(false);
    setMoodResponse("");
  }

  const selectedMoodObj = MOODS.find(m => m.id === selectedMood);

  const sbIconBase = {
    width: 36, height: 36, display: "flex", alignItems: "center",
    justifyContent: "center", borderRadius: 8,
    color: "var(--text-muted)", fontSize: 18,
  };

  // ── render ──────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: "flex", height: "100vh", background: "var(--bg-primary)", fontFamily: "'Plus Jakarta Sans', sans-serif", color: "var(--text-primary)", overflow: "hidden" }}>
      <style>{`
        @keyframes pulse { 0%,100%{opacity:0.4} 50%{opacity:0.8} }
        * { box-sizing: border-box; }
        textarea:focus { outline: none; border-color: var(--border-active) !important; }
        textarea { font-family: "Plus Jakarta Sans", sans-serif; }
      `}</style>

      <AppNav active="insights" initials={initials} />

      {/* ── main ── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>

        {/* top bar — matches Progress exactly */}
        <div className="page-pad-top" style={{
          minHeight: 52, background: "var(--bg-primary)", borderBottom: "1px solid var(--border-default)",
          display: "flex", flexWrap: "wrap", alignItems: "center", paddingTop: 8, paddingBottom: 8, gap: 16, flexShrink: 0,
        }}>
          <span style={{ fontFamily: "'Syne', sans-serif", fontSize: 16, fontWeight: 600 }}>Patterns</span>
          <div style={{ flex: 1 }} />
          <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-default)", borderRadius: 20, padding: "4px 10px", display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 12 }}>🔥</span>
            <span style={{ color: "var(--text-primary)", fontSize: 12, fontWeight: 600 }}>{streak}</span>
            <span style={{ color: "var(--text-muted)", fontSize: 11 }}>day streak</span>
          </div>
          <div style={{ ...sbIconBase, cursor: "pointer" }} title="Notifications"><i className="ti ti-bell" /></div>
        </div>

        {/* scrollable content */}
        <div className="page-pad app-content-pad" style={{ flex: 1, overflowY: "auto" }}>

          {/* ── pattern insight cards ── */}
          <div style={{ background: "var(--bg-subtle)", border: "1px solid var(--border-default)", borderRadius: 12, padding: 20, marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 14, fontWeight: 600, color: "var(--text-secondary)" }}>
                Your patterns
              </div>
              <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Computed from {name === "there" ? "your" : `${name}'s`} own logged data — no AI, no guessing</span>
            </div>

            {historyLoading ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <SkeletonCard /><SkeletonCard /><SkeletonCard />
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {insights.map((ins, i) => (
                  <InsightCard key={i} icon={ins.icon} title={ins.title} body={ins.body} accentColor={ins.accentColor} delay={i * 120} />
                ))}
              </div>
            )}
          </div>

          {/* ── mood check-in ── */}
          <div style={{ background: "var(--bg-subtle)", border: "1px solid var(--border-default)", borderRadius: 12, padding: 20, marginBottom: 16 }}>
            <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 14, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 16 }}>
              How are you feeling today?
            </div>

            {!moodSubmitted ? (
              <>
                {/* mood buttons */}
                <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
                  {MOODS.map(m => (
                    <button
                      key={m.id}
                      onClick={() => setSelectedMood(m.id)}
                      title={m.label}
                      style={{
                        flex: 1, padding: "10px 4px", borderRadius: 8,
                        border: `1px solid ${selectedMood === m.id ? "var(--border-active)" : "var(--border-default)"}`,
                        background: selectedMood === m.id ? "var(--accent-bg)" : "transparent",
                        cursor: "pointer", display: "flex", flexDirection: "column",
                        alignItems: "center", gap: 5, transition: "all 0.15s",
                      }}
                    >
                      <span style={{ fontSize: 22 }}>{m.emoji}</span>
                      <span style={{ fontSize: 10, color: selectedMood === m.id ? "var(--accent)" : "var(--text-muted)" }}>{m.label}</span>
                    </button>
                  ))}
                </div>

                {/* energy level */}
                <div style={{ marginBottom: 18 }}>
                  <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 8 }}>Energy level</div>
                  <div style={{ display: "flex", gap: 6 }}>
                    {Array.from({ length: 10 }, (_, i) => i + 1).map(n => (
                      <button
                        key={n}
                        onClick={() => setSelectedEnergy(n)}
                        style={{
                          flex: 1, height: 32, borderRadius: 6,
                          border: `1px solid ${selectedEnergy >= n ? "var(--border-active)" : "var(--border-default)"}`,
                          background: selectedEnergy >= n ? "#8fbc8f22" : "transparent",
                          color: selectedEnergy >= n ? "var(--accent)" : "var(--border-strong)",
                          fontSize: 11, fontWeight: 600, cursor: "pointer",
                          transition: "all 0.1s", fontFamily: "'Plus Jakarta Sans', sans-serif",
                        }}
                      >{n}</button>
                    ))}
                  </div>
                </div>

                {/* optional note */}
                <textarea
                  placeholder="Anything on your mind? (optional)"
                  value={moodNote}
                  onChange={e => setMoodNote(e.target.value)}
                  rows={2}
                  style={{
                    width: "100%", background: "var(--bg-card)",
                    border: "1px solid var(--border-default)", borderRadius: 8,
                    padding: "10px 14px", fontSize: 13, color: "var(--text-secondary)",
                    resize: "none", marginBottom: 14,
                  }}
                />

                <button
                  onClick={submitMood}
                  disabled={!selectedMood || !selectedEnergy || loadingMood}
                  style={{
                    background: selectedMood && selectedEnergy ? "var(--accent)" : "var(--bg-card)",
                    border: "none", borderRadius: 8, padding: "10px 22px",
                    fontSize: 13, fontWeight: 600,
                    color: selectedMood && selectedEnergy ? "#0f0f0f" : "var(--border-strong)",
                    cursor: selectedMood && selectedEnergy && !loadingMood ? "pointer" : "not-allowed",
                    transition: "background 0.2s, color 0.2s", fontFamily: "'Plus Jakarta Sans', sans-serif",
                  }}
                >
                  Check in →
                </button>
              </>
            ) : (
              <div>
                {/* checked-in summary */}
                <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 14 }}>
                  <span style={{ fontSize: 32 }}>{selectedMoodObj?.emoji}</span>
                  <div>
                    <p style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>
                      {selectedMoodObj?.label} · Energy {selectedEnergy}/10
                    </p>
                    <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "2px 0 0" }}>Checked in today</p>
                  </div>
                </div>

                {/* templated response */}
                <div style={{
                  background: "var(--accent-bg)", border: "1px solid var(--border-active)",
                  borderRadius: 10, padding: "14px 16px", marginBottom: 12,
                  minHeight: 64, display: "flex", alignItems: "center", gap: 12,
                }}>
                  <div style={{
                    width: 28, height: 28, background: "#4a7a4a22",
                    border: "1px solid var(--border-active)", borderRadius: 6,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    flexShrink: 0,
                  }}>
                    <i className="ti ti-sparkles" style={{ fontSize: 13, color: "var(--accent)" }} />
                  </div>
                  <p style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.65, margin: 0 }}>{moodResponse}</p>
                </div>

                <button
                  onClick={resetMood}
                  style={{
                    background: "transparent", border: "1px solid var(--border-default)",
                    borderRadius: 8, padding: "6px 14px", fontSize: 12,
                    color: "var(--text-muted)", cursor: "pointer", fontFamily: "'Plus Jakarta Sans', sans-serif",
                    transition: "border-color 0.15s",
                  }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = "var(--border-active)"}
                  onMouseLeave={e => e.currentTarget.style.borderColor = "var(--border-default)"}
                >Update check-in</button>
              </div>
            )}
          </div>

          {/* ── weekly mood history grid ── */}
          <div style={{ background: "var(--bg-subtle)", border: "1px solid var(--border-default)", borderRadius: 12, padding: 20, marginBottom: 16 }}>
            <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 14, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 2 }}>
              Last 7 days
            </div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 16 }}>Mood and energy history</div>

            {/* mood row */}
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 8 }}>Mood</div>
            <div className="grid-7" style={{ marginBottom: 20 }}>
              {last7.map(({ date, label }) => {
                const row = byDate.get(date);
                const emoji = row?.mood ? MOODS.find(m => m.id === row.mood)?.emoji : null;
                return (
                  <div key={date} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5 }}>
                    <div style={{
                      width: "100%", aspectRatio: "1", borderRadius: 8,
                      background: "var(--bg-card)", border: "1px solid var(--border-default)",
                      display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18,
                    }}>
                      {emoji || <span style={{ color: "var(--border-strong)", fontSize: 12 }}>—</span>}
                    </div>
                    <span style={{ fontSize: 10, color: "var(--text-muted)" }}>{label}</span>
                  </div>
                );
              })}
            </div>

            {/* energy row */}
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 8 }}>Energy</div>
            <div className="grid-7">
              {last7.map(({ date, label }) => {
                const row = byDate.get(date);
                const val = row?.energy ?? null;
                const pct = val ? (val / 10) * 100 : 0;
                const barColor = val >= 7 ? "var(--accent)" : val >= 5 ? "var(--warning)" : "var(--danger)";
                return (
                  <div key={date} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5 }}>
                    <div style={{
                      width: "100%", height: 52, background: "var(--bg-card)",
                      border: "1px solid var(--border-default)", borderRadius: 8,
                      display: "flex", flexDirection: "column", justifyContent: "flex-end",
                      overflow: "hidden", position: "relative",
                    }}>
                      {val != null && (
                        <>
                          <div style={{
                            width: "100%", height: pct + "%",
                            background: `color-mix(in srgb, ${barColor} 30%, transparent)`,
                            borderTop: "2px solid " + barColor,
                            transition: "height 0.6s ease",
                          }} />
                          <span style={{
                            position: "absolute", top: "50%", left: "50%",
                            transform: "translate(-50%, -50%)",
                            fontSize: 12, fontWeight: 600, color: barColor,
                          }}>{val}</span>
                        </>
                      )}
                    </div>
                    <span style={{ fontSize: 10, color: "var(--text-muted)" }}>{label}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div style={{ height: 24 }} />
        </div>
      </div>
    </div>
  );
}
