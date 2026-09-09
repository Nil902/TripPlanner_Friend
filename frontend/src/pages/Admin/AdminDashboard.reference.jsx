import React, { useState } from "react";
import {
  MapPin, Users, DollarSign, Activity, Database, Server, Cloud,
  CheckCircle2, AlertCircle, XCircle, Search, MoreHorizontal
} from "lucide-react";

const INK = "#24211C";
const PAPER = "#F3EEE2";
const PINE = "#2B4C3F";
const PINE_DARK = "#1E3830";
const CLAY = "#C1683F";
const RED = "#B3432E";
const BORDER = "#DDD5C4";
const MUTED = "#8A8272";

const serif = { fontFamily: 'Georgia, "Iowan Old Style", "Palatino Linotype", serif' };

const METRICS = [
  { label: "Active trips", value: "142", sub: "+12 this week" },
  { label: "Registered creators", value: "98", sub: "+6 this week" },
  { label: "Agent success rate", value: "87%", sub: "valid on first pass, 30-day avg" },
  { label: "API spend, month to date", value: "$4.20", sub: "of $0 committed budget" },
];

const TRIPS = [
  { id: "t1", name: "Lisbon trip", creator: "Alice", members: 4, status: "active", created: "Jun 5" },
  { id: "t2", name: "Osaka food tour", creator: "Marco", members: 3, status: "active", created: "Jun 4" },
  { id: "t3", name: "Bachelor weekend", creator: "Devon", members: 6, status: "flagged", created: "Jun 3" },
  { id: "t4", name: "Iceland ring road", creator: "Priya", members: 2, status: "closed", created: "May 29" },
];

const API_USAGE = [
  { name: "Google Places API", used: 3120, freeLimit: 10000, cost: 0 },
  { name: "Distance Matrix API", used: 1840, freeLimit: 2500, cost: 0 },
  { name: "LLM (Gemini)", used: 890, freeLimit: 1500, cost: 4.2 },
];

const SYSTEM = [
  { name: "Postgres", status: "up", detail: "12ms avg query" },
  { name: "Redis", status: "up", detail: "cache hit rate 74%" },
  { name: "nginx gateway", status: "up", detail: "rate limit: 0 blocks today" },
  { name: "LLM API", status: "degraded", detail: "elevated latency, ~2.4s avg" },
];

function MetricCard({ label, value, sub }) {
  return (
    <div style={{ border: `1px solid ${BORDER}`, borderRadius: 12, padding: "16px 18px", flex: 1, background: "#fff" }}>
      <span style={{ fontSize: 12, color: MUTED, display: "block", marginBottom: 6 }}>{label}</span>
      <span style={{ ...serif, fontSize: 26, display: "block" }}>{value}</span>
      <span style={{ fontSize: 12, color: MUTED }}>{sub}</span>
    </div>
  );
}

function StatusDot({ status }) {
  const map = {
    up: { color: PINE, Icon: CheckCircle2, label: "Operational" },
    degraded: { color: CLAY, Icon: AlertCircle, label: "Degraded" },
    down: { color: RED, Icon: XCircle, label: "Down" },
  };
  const s = map[status];
  const Icon = s.Icon;
  return (
    <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: s.color, fontWeight: 500 }}>
      <Icon size={14} /> {s.label}
    </span>
  );
}

function TripStatusBadge({ status }) {
  const map = {
    active: { bg: "#E7F0EA", fg: PINE_DARK, label: "Active" },
    flagged: { bg: "#FBF0E8", fg: CLAY, label: "Flagged" },
    closed: { bg: "#F1EFE8", fg: MUTED, label: "Closed" },
  };
  const s = map[status];
  return (
    <span style={{
      fontSize: 12, fontWeight: 600, padding: "3px 10px", borderRadius: 20,
      background: s.bg, color: s.fg,
    }}>
      {s.label}
    </span>
  );
}

function Section({ title, description, children }) {
  return (
    <div style={{ marginBottom: 40 }}>
      <h3 style={{ ...serif, fontSize: 19, fontWeight: 400, margin: "0 0 4px" }}>{title}</h3>
      {description && <p style={{ fontSize: 13, color: MUTED, margin: "0 0 16px" }}>{description}</p>}
      {children}
    </div>
  );
}

function Overview() {
  return (
    <Section title="Overview" description="Across every trip on the platform.">
      <div style={{ display: "flex", gap: 12, marginBottom: 8 }}>
        {METRICS.map((m) => <MetricCard key={m.label} {...m} />)}
      </div>
    </Section>
  );
}

function Trips() {
  const [query, setQuery] = useState("");
  const filtered = TRIPS.filter((t) => t.name.toLowerCase().includes(query.toLowerCase()));

  return (
    <Section title="Trips" description="Every trip created on the platform.">
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14, maxWidth: 320 }}>
        <div style={{ position: "relative", flex: 1 }}>
          <Search size={14} color={MUTED} style={{ position: "absolute", left: 10, top: 10 }} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search trips"
            style={{
              width: "100%", padding: "8px 12px 8px 30px", borderRadius: 8,
              border: `1px solid ${BORDER}`, fontSize: 13, boxSizing: "border-box",
            }}
          />
        </div>
      </div>
      <div style={{ border: `1px solid ${BORDER}`, borderRadius: 10, overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 0.7fr 0.9fr 0.8fr 32px", padding: "10px 16px", fontSize: 12, color: MUTED, borderBottom: `1px solid ${BORDER}`, background: "#FAF8F3" }}>
          <span>Trip</span><span>Creator</span><span>Members</span><span>Status</span><span>Created</span><span></span>
        </div>
        {filtered.map((t) => (
          <div key={t.id} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 0.7fr 0.9fr 0.8fr 32px", padding: "12px 16px", fontSize: 13, alignItems: "center", borderBottom: `1px solid ${BORDER}` }}>
            <span style={{ fontWeight: 500 }}>{t.name}</span>
            <span style={{ color: MUTED }}>{t.creator}</span>
            <span style={{ color: MUTED }}>{t.members}</span>
            <TripStatusBadge status={t.status} />
            <span style={{ color: MUTED }}>{t.created}</span>
            <MoreHorizontal size={15} color={MUTED} style={{ cursor: "pointer" }} />
          </div>
        ))}
        {filtered.length === 0 && (
          <div style={{ padding: "20px 16px", fontSize: 13, color: MUTED, textAlign: "center" }}>No trips match "{query}".</div>
        )}
      </div>
    </Section>
  );
}

function UsageBar({ used, freeLimit }) {
  const pct = Math.min(100, Math.round((used / freeLimit) * 100));
  const color = pct > 90 ? RED : pct > 70 ? CLAY : PINE;
  return (
    <div style={{ width: "100%", height: 6, borderRadius: 4, background: "#EFEAE0", overflow: "hidden" }}>
      <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 4 }} />
    </div>
  );
}

function ApiUsage() {
  return (
    <Section title="API usage and cost" description="Free-tier usage across the external APIs the agent calls, this month.">
      <div style={{ maxWidth: 520 }}>
        {API_USAGE.map((api) => {
          const pct = Math.round((api.used / api.freeLimit) * 100);
          return (
            <div key={api.name} style={{ marginBottom: 20 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ fontSize: 14, fontWeight: 500 }}>{api.name}</span>
                <span style={{ fontSize: 13, color: MUTED }}>
                  {api.used.toLocaleString()} / {api.freeLimit.toLocaleString()} free ({pct}%)
                  {api.cost > 0 ? ` · $${api.cost.toFixed(2)}` : ""}
                </span>
              </div>
              <UsageBar used={api.used} freeLimit={api.freeLimit} />
            </div>
          );
        })}
        <p style={{ fontSize: 12, color: MUTED, marginTop: 4 }}>
          Redis caches repeated Places and Distance Matrix lookups, which is most of what's keeping these numbers low.
        </p>
      </div>
    </Section>
  );
}

function SystemHealth() {
  return (
    <Section title="System health" description="Live status of the services behind the app.">
      <div style={{ maxWidth: 480, border: `1px solid ${BORDER}`, borderRadius: 10, overflow: "hidden" }}>
        {SYSTEM.map((s, i) => {
          const icons = { Postgres: Database, Redis: Database, "nginx gateway": Server, "LLM API": Cloud };
          const Icon = icons[s.name] || Activity;
          return (
            <div key={s.name} style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "13px 16px", borderBottom: i < SYSTEM.length - 1 ? `1px solid ${BORDER}` : "none",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <Icon size={16} color={MUTED} />
                <div>
                  <span style={{ fontSize: 14, fontWeight: 500, display: "block" }}>{s.name}</span>
                  <span style={{ fontSize: 12, color: MUTED }}>{s.detail}</span>
                </div>
              </div>
              <StatusDot status={s.status} />
            </div>
          );
        })}
      </div>
    </Section>
  );
}

function OwnerSidebar({ active, setActive }) {
  const items = [
    { id: "overview", label: "Overview", icon: Activity },
    { id: "trips", label: "Trips", icon: MapPin },
    { id: "usage", label: "API usage & cost", icon: DollarSign },
    { id: "health", label: "System health", icon: Server },
  ];
  return (
    <div style={{ width: 220, flexShrink: 0, borderRight: `1px solid ${BORDER}`, padding: "24px 16px", background: "#fff" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "0 8px", marginBottom: 6 }}>
        <div style={{ width: 28, height: 28, borderRadius: 8, background: INK, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <Users color="#fff" size={15} />
        </div>
        <span style={{ ...serif, fontSize: 17 }}>Platform admin</span>
      </div>
      <p style={{ fontSize: 12, color: MUTED, padding: "0 8px", margin: "0 0 24px" }}>Internal only — not visible to users.</p>
      {items.map((it) => {
        const Icon = it.icon;
        const isActive = active === it.id;
        return (
          <button
            key={it.id}
            onClick={() => setActive(it.id)}
            style={{
              display: "flex", alignItems: "center", gap: 10, width: "100%",
              padding: "9px 10px", borderRadius: 8, border: "none",
              background: isActive ? "#EFEAE0" : "transparent",
              color: isActive ? PINE_DARK : INK,
              fontSize: 14, fontWeight: isActive ? 600 : 400,
              cursor: "pointer", marginBottom: 2, textAlign: "left",
            }}
          >
            <Icon size={17} />
            {it.label}
          </button>
        );
      })}
    </div>
  );
}

export default function OwnerDashboard() {
  const [active, setActive] = useState("overview");

  return (
    <div style={{ minHeight: "100vh", display: "flex", background: PAPER, color: INK, fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif" }}>
      <OwnerSidebar active={active} setActive={setActive} />
      <div style={{ flex: 1, padding: "32px 40px", overflowY: "auto" }}>
        {active === "overview" && <Overview />}
        {active === "trips" && <Trips />}
        {active === "usage" && <ApiUsage />}
        {active === "health" && <SystemHealth />}
      </div>
    </div>
  );
}
