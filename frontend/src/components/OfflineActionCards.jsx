import { useState, useMemo } from "react";
import { ACTION_CARDS, VERIFIED_HELPLINES, searchActionCards } from "../data/safetyKnowledgeBase";

const CATEGORIES = [
  { id: "all", label: "All SOPs", icon: "📋" },
  { id: "flood", label: "Floods", icon: "🌊" },
  { id: "landslide", label: "Landslides", icon: "⛰️" },
  { id: "cyclone", label: "Cyclones", icon: "🌀" },
  { id: "heatwave", label: "Heatwaves", icon: "☀️" },
  { id: "earthquake", label: "Earthquakes", icon: "🏚️" },
  { id: "emergency_kit", label: "Survival Go-Bag", icon: "🎒" },
];

export default function OfflineActionCards({ isOpen = true, onClose = null }) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [activePhases, setActivePhases] = useState({}); // cardId -> phase ("during" | "before" | "after" | "dos")
  const [copiedId, setCopiedId] = useState(null);

  const searchResult = useMemo(() => {
    return searchActionCards(searchQuery);
  }, [searchQuery]);

  const displayedCards = useMemo(() => {
    if (searchResult.isFallback) return [];
    if (selectedCategory === "all") return searchResult.cards;
    return searchResult.cards.filter((c) => c.category === selectedCategory);
  }, [searchResult, selectedCategory]);

  const handleCopyCard = (card) => {
    const text = `🚨 SKYRA EMERGENCY SOP: ${card.title}\nSource: ${card.source}\n\n[DURING DISASTER]\n${card.phases.during.map((s, i) => `${i + 1}. ${s}`).join("\n")}\n\nEmergency Helpline: 112 / 1078`;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(() => {
        setCopiedId(card.id);
        setTimeout(() => setCopiedId(null), 2500);
      });
    }
  };

  const getCardPhase = (cardId) => activePhases[cardId] || "during";

  const setCardPhase = (cardId, phase) => {
    setActivePhases((prev) => ({ ...prev, [cardId]: phase }));
  };

  return (
    <div className="skyra-action-cards-container" style={{ padding: "1.5rem", maxWidth: "1100px", margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1.2rem" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
            <span style={{ fontSize: "1.4rem" }}>📋</span>
            <span style={{ fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.08em", color: "#38bdf8", fontWeight: 700 }}>
              NDMA / IMD OFFICIAL DISASTER PROTOCOLS
            </span>
            <span style={{ background: "rgba(34, 197, 94, 0.2)", color: "#4ade80", fontSize: "0.7rem", padding: "2px 8px", borderRadius: "12px", fontWeight: 600 }}>
              100% Offline Available
            </span>
          </div>
          <h1 style={{ fontSize: "1.6rem", fontWeight: 800, margin: 0, color: "#fff" }}>
            Disaster Action Cards & Safety SOPs
          </h1>
          <p style={{ margin: "4px 0 0", fontSize: "0.85rem", color: "#94a3b8" }}>
            Actionable Before, During, and After instructions for immediate civil defense without internet.
          </p>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            style={{
              background: "rgba(255, 255, 255, 0.08)",
              border: "1px solid rgba(255, 255, 255, 0.15)",
              color: "#cbd5e1",
              borderRadius: "8px",
              padding: "6px 14px",
              cursor: "pointer",
              fontWeight: 600,
              fontSize: "0.85rem",
            }}
          >
            ✕ Close
          </button>
        )}
      </div>

      {/* Emergency Quick-Dial Ribbon */}
      <div
        style={{
          background: "linear-gradient(135deg, rgba(220, 38, 38, 0.18), rgba(15, 23, 42, 0.7))",
          border: "1px solid rgba(239, 68, 68, 0.35)",
          borderRadius: "12px",
          padding: "10px 14px",
          marginBottom: "1.5rem",
          display: "flex",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "12px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <span style={{ fontSize: "1.1rem" }}>🚨</span>
          <strong style={{ fontSize: "0.8rem", color: "#fca5a5", textTransform: "uppercase" }}>
            Official Helplines:
          </strong>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
          {VERIFIED_HELPLINES.map((h) => (
            <a
              key={h.number}
              href={`tel:${h.number}`}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "5px",
                background: "rgba(15, 23, 42, 0.8)",
                border: "1px solid rgba(239, 68, 68, 0.4)",
                color: "#fff",
                padding: "3px 10px",
                borderRadius: "20px",
                textDecoration: "none",
                fontSize: "0.78rem",
                fontWeight: 700,
                boxShadow: "0 2px 6px rgba(0,0,0,0.3)",
              }}
              title={h.description}
            >
              <span style={{ color: "#ef4444" }}>📞</span>
              <span>{h.number}</span>
              <span style={{ color: "#94a3b8", fontSize: "0.7rem", fontWeight: 400 }}>({h.service.split(" ")[0]})</span>
            </a>
          ))}
        </div>
      </div>

      {/* Search Input & Category Filters */}
      <div style={{ marginBottom: "1.5rem" }}>
        <div style={{ position: "relative", marginBottom: "12px" }}>
          <span style={{ position: "absolute", left: "14px", top: "50%", transform: "translateY(-50%)", fontSize: "1rem", color: "#94a3b8" }}>
            🔍
          </span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search disaster SOPs (e.g. 'flash flood evacuation', 'landslide signs', 'go bag', 'eye of cyclone')..."
            style={{
              width: "100%",
              boxSizing: "border-box",
              padding: "12px 14px 12px 42px",
              background: "rgba(15, 23, 42, 0.75)",
              border: "1px solid rgba(56, 189, 248, 0.3)",
              borderRadius: "10px",
              color: "#fff",
              fontSize: "0.9rem",
              outline: "none",
              backdropFilter: "blur(6px)",
            }}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              style={{
                position: "absolute",
                right: "12px",
                top: "50%",
                transform: "translateY(-50%)",
                background: "transparent",
                border: "none",
                color: "#94a3b8",
                cursor: "pointer",
                fontSize: "0.9rem",
              }}
            >
              ✕
            </button>
          )}
        </div>

        {/* Category Pills */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
          {CATEGORIES.map((cat) => {
            const isSelected = selectedCategory === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                style={{
                  background: isSelected ? "linear-gradient(135deg, #0284c7, #0369a1)" : "rgba(15, 23, 42, 0.6)",
                  border: isSelected ? "1px solid #38bdf8" : "1px solid rgba(255, 255, 255, 0.1)",
                  color: isSelected ? "#fff" : "#cbd5e1",
                  padding: "6px 14px",
                  borderRadius: "20px",
                  fontSize: "0.8rem",
                  fontWeight: 600,
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  transition: "all 0.15s ease",
                }}
              >
                <span>{cat.icon}</span>
                <span>{cat.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Fallback View when Query Has No Match */}
      {searchResult.isFallback && (
        <div
          style={{
            background: "rgba(15, 23, 42, 0.8)",
            border: "1px solid rgba(245, 158, 11, 0.4)",
            borderRadius: "14px",
            padding: "2rem",
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: "2.5rem", marginBottom: "0.5rem" }}>🛡️</div>
          <h3 style={{ fontSize: "1.15rem", color: "#fbbf24", margin: "0 0 8px" }}>
            No Verified Official Protocol Found
          </h3>
          <p style={{ maxWidth: "600px", margin: "0 auto 1.5rem", fontSize: "0.85rem", color: "#cbd5e1", lineHeight: 1.5 }}>
            {searchResult.fallbackNotice}
          </p>
          <div style={{ display: "flex", justifyContent: "center", gap: "12px", flexWrap: "wrap" }}>
            <a
              href="tel:112"
              style={{
                background: "linear-gradient(135deg, #dc2626, #b91c1c)",
                color: "#fff",
                padding: "8px 18px",
                borderRadius: "8px",
                textDecoration: "none",
                fontWeight: 700,
                fontSize: "0.88rem",
              }}
            >
              🚨 Call 112 (National Emergency)
            </a>
            <a
              href="tel:1078"
              style={{
                background: "linear-gradient(135deg, #0284c7, #0369a1)",
                color: "#fff",
                padding: "8px 18px",
                borderRadius: "8px",
                textDecoration: "none",
                fontWeight: 700,
                fontSize: "0.88rem",
              }}
            >
              📞 Call 1078 (NDMA Desk)
            </a>
            <button
              onClick={() => {
                setSearchQuery("");
                setSelectedCategory("all");
              }}
              style={{
                background: "rgba(255, 255, 255, 0.08)",
                border: "1px solid rgba(255, 255, 255, 0.15)",
                color: "#cbd5e1",
                padding: "8px 16px",
                borderRadius: "8px",
                cursor: "pointer",
                fontWeight: 600,
                fontSize: "0.88rem",
              }}
            >
              Browse All SOPs
            </button>
          </div>
        </div>
      )}

      {/* Action Cards Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "16px" }}>
        {displayedCards.map((card) => {
          const currentPhase = getCardPhase(card.id);

          return (
            <div
              key={card.id}
              className="glass-panel"
              style={{
                background: "linear-gradient(135deg, rgba(15, 23, 42, 0.9), rgba(30, 41, 59, 0.9))",
                border: "1px solid rgba(56, 189, 248, 0.25)",
                borderRadius: "14px",
                padding: "1.25rem",
                display: "flex",
                flexDirection: "column",
                boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.5)",
              }}
            >
              {/* Card Top Title */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "8px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span style={{ fontSize: "1.6rem" }}>{card.icon}</span>
                  <div>
                    <h3 style={{ fontSize: "1.05rem", fontWeight: 700, margin: 0, color: "#fff" }}>
                      {card.title}
                    </h3>
                    <span style={{ fontSize: "0.72rem", color: "#38bdf8", fontWeight: 600 }}>
                      {card.tagline}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => handleCopyCard(card)}
                  style={{
                    background: "rgba(255, 255, 255, 0.06)",
                    border: "1px solid rgba(255, 255, 255, 0.12)",
                    color: copiedId === card.id ? "#4ade80" : "#94a3b8",
                    padding: "4px 8px",
                    borderRadius: "6px",
                    fontSize: "0.7rem",
                    cursor: "pointer",
                  }}
                  title="Copy safety instructions"
                >
                  {copiedId === card.id ? "✓ Copied" : "📋 Copy"}
                </button>
              </div>

              {/* Phase Switcher Tabs */}
              <div
                style={{
                  display: "flex",
                  background: "rgba(15, 23, 42, 0.7)",
                  padding: "3px",
                  borderRadius: "8px",
                  margin: "8px 0 12px",
                  border: "1px solid rgba(255, 255, 255, 0.08)",
                }}
              >
                {[
                  { id: "during", label: "⚡ During" },
                  { id: "before", label: "🛡️ Before" },
                  { id: "after", label: "🔄 After" },
                  { id: "dos", label: "✓ Do's & Don'ts" },
                ].map((tab) => {
                  const isActive = currentPhase === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setCardPhase(card.id, tab.id)}
                      style={{
                        flex: 1,
                        background: isActive ? "rgba(56, 189, 248, 0.2)" : "transparent",
                        border: isActive ? "1px solid rgba(56, 189, 248, 0.4)" : "none",
                        color: isActive ? "#38bdf8" : "#94a3b8",
                        padding: "5px 4px",
                        borderRadius: "6px",
                        fontSize: "0.72rem",
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      {tab.label}
                    </button>
                  );
                })}
              </div>

              {/* Phase Content Body */}
              <div style={{ flex: 1, marginBottom: "12px" }}>
                {currentPhase !== "dos" ? (
                  <ul style={{ margin: 0, paddingLeft: "1.2rem", fontSize: "0.78rem", color: "#e2e8f0", lineHeight: 1.5 }}>
                    {card.phases[currentPhase]?.map((step, idx) => (
                      <li key={idx} style={{ marginBottom: "6px" }}>
                        {step}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div>
                    <div style={{ marginBottom: "8px" }}>
                      <strong style={{ fontSize: "0.72rem", color: "#4ade80", textTransform: "uppercase" }}>
                        Critical Do&apos;s:
                      </strong>
                      <ul style={{ margin: "4px 0 0", paddingLeft: "1.1rem", fontSize: "0.75rem", color: "#cbd5e1" }}>
                        {card.criticalDos.map((d, i) => (
                          <li key={i}>{d}</li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <strong style={{ fontSize: "0.72rem", color: "#f87171", textTransform: "uppercase" }}>
                        Fatal Don&apos;ts:
                      </strong>
                      <ul style={{ margin: "4px 0 0", paddingLeft: "1.1rem", fontSize: "0.75rem", color: "#fca5a5" }}>
                        {card.criticalDonts.map((d, i) => (
                          <li key={i}>{d}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}
              </div>

              {/* Card Footer: Authority Source & Relevant Helplines */}
              <div
                style={{
                  borderTop: "1px solid rgba(255, 255, 255, 0.08)",
                  paddingTop: "8px",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  fontSize: "0.68rem",
                  color: "#64748b",
                }}
              >
                <span title={card.source}>
                  🏛️ {card.source.substring(0, 32)}…
                </span>
                <div style={{ display: "flex", gap: "6px" }}>
                  {card.helplines.map((num) => (
                    <a
                      key={num}
                      href={`tel:${num}`}
                      style={{
                        background: "rgba(239, 68, 68, 0.15)",
                        color: "#f87171",
                        padding: "1px 6px",
                        borderRadius: "4px",
                        textDecoration: "none",
                        fontWeight: 700,
                        border: "1px solid rgba(239, 68, 68, 0.3)",
                      }}
                      title="Direct Helpline"
                    >
                      📞 {num}
                    </a>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
