import React, { useState } from "react";
import {
  MapPin, Users, CalendarDays, Wallet, Sparkles, ArrowRight, Check,
  AlertTriangle, Plus, ArrowLeft, X, Clock
} from "lucide-react";

const INK = "#24211C";
const PAPER = "#F3EEE2";
const PINE = "#2B4C3F";
const PINE_DARK = "#1E3830";
const CLAY = "#C1683F";
const BORDER = "#DDD5C4";
const MUTED = "#8A8272";

const serif = { fontFamily: 'Georgia, "Iowan Old Style", "Palatino Linotype", serif' };

const MEMBERS = [
  { id: "alice", name: "Alice", initials: "AL", submitted: true },
  { id: "bob", name: "Bob", initials: "BO", submitted: true },
  { id: "cara", name: "Cara", initials: "CA", submitted: false },
];

const DIETARY = ["Vegetarian", "Vegan", "Halal", "No restrictions"];
const STYLES = ["Relaxed", "Packed", "Foodie", "Outdoorsy", "Culture"];

const ITINERARY = {
  1: [
    { time: "9:00 AM", name: "Belem Tower", cost: 12, note: "Arrive early, it gets busy by 11." },
    { time: "11:30 AM", name: "Pasteis de Belem", cost: 8, note: null },
    { time: "2:00 PM", name: "LX Factory", cost: 0, note: "8 min walk from lunch — no backtracking." },
  ],
  2: [
    { time: "10:00 AM", name: "Alfama walking tour", cost: 15, note: null },
    { time: "1:00 PM", name: "Time Out Market", cost: 20, note: "Vegetarian stalls confirmed for Alice." },
    { time: "6:00 PM", name: "Miradouro da Graca", cost: 0, note: "Sunset viewpoint, 12 min from the market." },
  ],
};

const EXPENSES = [
  { paidBy: "Bob", amount: 240, desc: "Lodging, 2 nights" },
  { paidBy: "Alice", amount: 60, desc: "Time Out Market lunch" },
];

function Avatar({ initials, submitted, size = 32 }) {
  return (
    <div
      style={{
        width: size, height: size, borderRadius: "50%",
        background: submitted ? PINE : "#fff",
        color: submitted ? "#fff" : MUTED,
        border: submitted ? "none" : `1px solid ${BORDER}`,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: size * 0.4, fontWeight: 600, flexShrink: 0,
      }}
      title={submitted ? "Submitted" : "Waiting"}
    >
      {initials}
    </div>
  );
}

function Chip({ label, active, onClick, accent }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "6px 14px",
        borderRadius: 20,
        border: `1px solid ${active ? (accent || PINE) : BORDER}`,
        background: active ? (accent || PINE) : "transparent",
        color: active ? "#fff" : INK,
        fontSize: 14,
        cursor: "pointer",
        transition: "all 0.15s ease",
      }}
    >
      {label}
    </button>
  );
}

function PrimaryButton({ children, onClick, disabled, style }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        display: "inline-flex", alignItems: "center", gap: 8,
        padding: "10px 20px", borderRadius: 8, border: "none",
        background: disabled ? "#C9C3B5" : PINE,
        color: "#fff", fontSize: 15, fontWeight: 500,
        cursor: disabled ? "not-allowed" : "pointer",
        ...style,
      }}
    >
      {children}
    </button>
  );
}

function SecondaryButton({ children, onClick, style }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "inline-flex", alignItems: "center", gap: 8,
        padding: "10px 20px", borderRadius: 8,
        border: `1px solid ${BORDER}`, background: "#fff",
        color: INK, fontSize: 15, cursor: "pointer",
        ...style,
      }}
    >
      {children}
    </button>
  );
}

function Welcome({ onStart, onJoin }) {
  const [code, setCode] = useState("");
  return (
    <div style={{ minHeight: "100vh", background: PAPER, color: INK, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ maxWidth: 480, width: "100%", textAlign: "center" }}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 24 }}>
          <div style={{ width: 48, height: 48, borderRadius: 12, background: PINE, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <MapPin color="#fff" size={24} />
          </div>
        </div>
        <h1 style={{ ...serif, fontSize: 34, fontWeight: 400, lineHeight: 1.25, margin: "0 0 12px" }}>
          Plan the trip, not the group chat
        </h1>
        <p style={{ fontSize: 16, color: MUTED, lineHeight: 1.6, margin: "0 0 32px" }}>
          Everyone drops their dates and budget. One plan comes out the other end, ordered so you're not crossing town twice.
        </p>
        <PrimaryButton onClick={onStart} style={{ width: "100%", justifyContent: "center", marginBottom: 12, padding: "12px 20px" }}>
          Start a trip <ArrowRight size={16} />
        </PrimaryButton>
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Enter a trip code"
            style={{
              flex: 1, padding: "10px 14px", borderRadius: 8,
              border: `1px solid ${BORDER}`, fontSize: 15, background: "#fff",
            }}
          />
          <SecondaryButton onClick={() => onJoin(code)}>Join</SecondaryButton>
        </div>
        <p style={{ fontSize: 13, color: MUTED, marginTop: 16 }}>
          Joining a trip doesn't need an account. Starting one does, since you're the one who'll manage it.
        </p>
      </div>
    </div>
  );
}

function Sidebar({ active, setActive, tripName }) {
  const items = [
    { id: "overview", label: "Overview", icon: Users },
    { id: "plans", label: "Your plans", icon: CalendarDays },
    { id: "itinerary", label: "Itinerary", icon: MapPin },
    { id: "costs", label: "Costs", icon: Wallet },
  ];
  return (
    <div style={{ width: 220, flexShrink: 0, borderRight: `1px solid ${BORDER}`, padding: "24px 16px", background: "#fff" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "0 8px", marginBottom: 28 }}>
        <div style={{ width: 28, height: 28, borderRadius: 8, background: PINE, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <MapPin color="#fff" size={15} />
        </div>
        <span style={{ ...serif, fontSize: 17 }}>{tripName}</span>
      </div>
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

function Overview({ setActive, planMode, setPlanMode }) {
  const submittedCount = MEMBERS.filter((m) => m.submitted).length;
  return (
    <div style={{ maxWidth: 640 }}>
      <h2 style={{ ...serif, fontSize: 26, fontWeight: 400, margin: "0 0 6px" }}>Lisbon, 2 nights</h2>
      <p style={{ color: MUTED, fontSize: 15, margin: "0 0 28px" }}>June 12 – 14</p>

      <div style={{ border: `1px solid ${BORDER}`, borderRadius: 12, padding: "18px 20px", marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <span style={{ fontSize: 14, fontWeight: 600 }}>Who's in</span>
          <span style={{ fontSize: 13, color: MUTED }}>{submittedCount} of {MEMBERS.length} submitted their plans</span>
        </div>
        <div style={{ display: "flex", gap: 12 }}>
          {MEMBERS.map((m) => (
            <div key={m.id} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
              <Avatar initials={m.initials} submitted={m.submitted} />
              <span style={{ fontSize: 12, color: MUTED }}>{m.name}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ border: `1px solid ${BORDER}`, borderRadius: 12, padding: "18px 20px", marginBottom: 24 }}>
        <span style={{ fontSize: 14, fontWeight: 600, display: "block", marginBottom: 12 }}>How do you want to plan it?</span>
        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={() => setPlanMode("ai")}
            style={{
              flex: 1, textAlign: "left", padding: "14px 16px", borderRadius: 10,
              border: `1.5px solid ${planMode === "ai" ? PINE : BORDER}`,
              background: planMode === "ai" ? "#EFEAE0" : "#fff", cursor: "pointer",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
              <Sparkles size={15} color={PINE} />
              <span style={{ fontSize: 14, fontWeight: 600 }}>Let the AI plan it</span>
            </div>
            <span style={{ fontSize: 13, color: MUTED }}>Builds a day-by-day plan from everyone's constraints.</span>
          </button>
          <button
            onClick={() => setPlanMode("manual")}
            style={{
              flex: 1, textAlign: "left", padding: "14px 16px", borderRadius: 10,
              border: `1.5px solid ${planMode === "manual" ? PINE : BORDER}`,
              background: planMode === "manual" ? "#EFEAE0" : "#fff", cursor: "pointer",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
              <MapPin size={15} color={PINE} />
              <span style={{ fontSize: 14, fontWeight: 600 }}>Plan it yourself</span>
            </div>
            <span style={{ fontSize: 13, color: MUTED }}>Build the days by hand. We'll flag budget or timing issues.</span>
          </button>
        </div>
      </div>

      <PrimaryButton onClick={() => setActive("itinerary")}>
        {planMode === "ai" ? <Sparkles size={16} /> : <MapPin size={16} />}
        {planMode === "ai" ? "Generate itinerary" : "Start building"}
      </PrimaryButton>
    </div>
  );
}

function Plans() {
  const [budget, setBudget] = useState(50);
  const [diet, setDiet] = useState("Vegetarian");
  const [styles, setStyles] = useState(["Foodie"]);
  const [mustSee, setMustSee] = useState("");
  const [saved, setSaved] = useState(false);

  const toggleStyle = (s) =>
    setStyles((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]));

  return (
    <div style={{ maxWidth: 480 }}>
      <h2 style={{ ...serif, fontSize: 24, fontWeight: 400, margin: "0 0 6px" }}>Your plans</h2>
      <p style={{ color: MUTED, fontSize: 14, margin: "0 0 28px" }}>Just the basics — this shapes what the plan looks like for everyone.</p>

      <label style={{ fontSize: 14, fontWeight: 600, display: "block", marginBottom: 8 }}>Budget per day</label>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
        <input
          type="range" min="20" max="150" value={budget}
          onChange={(e) => setBudget(Number(e.target.value))}
          style={{ flex: 1, accentColor: PINE }}
        />
        <span style={{ fontSize: 14, minWidth: 40 }}>${budget}</span>
      </div>

      <label style={{ fontSize: 14, fontWeight: 600, display: "block", marginBottom: 8 }}>Dietary needs</label>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 24 }}>
        {DIETARY.map((d) => (
          <Chip key={d} label={d} active={diet === d} onClick={() => setDiet(d)} />
        ))}
      </div>

      <label style={{ fontSize: 14, fontWeight: 600, display: "block", marginBottom: 8 }}>Travel style</label>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 24 }}>
        {STYLES.map((s) => (
          <Chip key={s} label={s} active={styles.includes(s)} onClick={() => toggleStyle(s)} accent={CLAY} />
        ))}
      </div>

      <label style={{ fontSize: 14, fontWeight: 600, display: "block", marginBottom: 8 }}>Anything you don't want to miss?</label>
      <textarea
        value={mustSee}
        onChange={(e) => setMustSee(e.target.value)}
        placeholder="A place, a food, anything"
        rows={3}
        style={{
          width: "100%", padding: "10px 14px", borderRadius: 8,
          border: `1px solid ${BORDER}`, fontSize: 14, marginBottom: 24,
          fontFamily: "inherit", resize: "vertical", boxSizing: "border-box",
        }}
      />

      <PrimaryButton onClick={() => setSaved(true)}>
        {saved ? <Check size={16} /> : null}
        {saved ? "Saved" : "Save your plans"}
      </PrimaryButton>
    </div>
  );
}

function Itinerary() {
  const [day, setDay] = useState(1);
  const [disrupted, setDisrupted] = useState(false);

  return (
    <div style={{ maxWidth: 560 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <h2 style={{ ...serif, fontSize: 24, fontWeight: 400, margin: "0 0 4px" }}>Itinerary</h2>
          <p style={{ color: MUTED, fontSize: 14, margin: 0 }}>Ordered to keep travel between stops short.</p>
        </div>
        <SecondaryButton onClick={() => setDisrupted(true)} style={{ fontSize: 13, padding: "8px 14px" }}>
          <AlertTriangle size={14} /> Simulate a closed venue
        </SecondaryButton>
      </div>

      {disrupted && (
        <div style={{
          display: "flex", gap: 10, alignItems: "flex-start", padding: "12px 16px",
          borderRadius: 10, background: "#FBF0E8", border: `1px solid ${CLAY}`, marginBottom: 20,
        }}>
          <AlertTriangle size={16} color={CLAY} style={{ flexShrink: 0, marginTop: 2 }} />
          <div>
            <p style={{ fontSize: 14, fontWeight: 600, margin: "0 0 2px" }}>Belem Tower is closed today</p>
            <p style={{ fontSize: 13, color: MUTED, margin: 0 }}>
              Swapped in Jeronimos Monastery, same neighborhood, 4 min away. The rest of Day 1 is unchanged.
            </p>
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        {[1, 2].map((d) => (
          <Chip key={d} label={`Day ${d}`} active={day === d} onClick={() => setDay(d)} />
        ))}
      </div>

      <div>
        {ITINERARY[day].map((stop, i) => {
          const swapped = disrupted && day === 1 && i === 0;
          return (
            <div key={i} style={{
              display: "flex", gap: 14, padding: "14px 4px",
              borderBottom: i < ITINERARY[day].length - 1 ? `1px solid ${BORDER}` : "none",
            }}>
              <div style={{ width: 72, flexShrink: 0, display: "flex", alignItems: "center", gap: 5, color: MUTED, fontSize: 13 }}>
                <Clock size={13} /> {stop.time}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 15, fontWeight: 500 }}>
                    {swapped ? "Jeronimos Monastery" : stop.name}
                  </span>
                  {stop.cost > 0 && <span style={{ fontSize: 13, color: MUTED }}>${stop.cost}</span>}
                </div>
                {(stop.note || swapped) && (
                  <p style={{ fontSize: 13, color: MUTED, margin: "4px 0 0" }}>
                    {swapped ? "Swapped in after Belem Tower closed — same area, no extra travel." : stop.note}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Costs() {
  const total = EXPENSES.reduce((s, e) => s + e.amount, 0);
  const perPerson = total / MEMBERS.length;
  const balances = MEMBERS.map((m) => {
    const paid = EXPENSES.filter((e) => e.paidBy === m.name).reduce((s, e) => s + e.amount, 0);
    return { name: m.name, net: Math.round((paid - perPerson) * 100) / 100 };
  });

  return (
    <div style={{ maxWidth: 480 }}>
      <h2 style={{ ...serif, fontSize: 24, fontWeight: 400, margin: "0 0 6px" }}>Costs</h2>
      <p style={{ color: MUTED, fontSize: 14, margin: "0 0 24px" }}>Split evenly. Edit who paid what as expenses come in.</p>

      <div style={{ border: `1px solid ${BORDER}`, borderRadius: 12, marginBottom: 20 }}>
        {EXPENSES.map((e, i) => (
          <div key={i} style={{
            display: "flex", justifyContent: "space-between", padding: "12px 16px",
            borderBottom: i < EXPENSES.length - 1 ? `1px solid ${BORDER}` : "none",
          }}>
            <div>
              <span style={{ fontSize: 14 }}>{e.desc}</span>
              <span style={{ fontSize: 13, color: MUTED, display: "block" }}>Paid by {e.paidBy}</span>
            </div>
            <span style={{ fontSize: 14, fontWeight: 500 }}>${e.amount}</span>
          </div>
        ))}
        <div style={{ padding: "12px 16px", display: "flex", gap: 8, alignItems: "center", color: PINE, fontSize: 14, cursor: "pointer" }}>
          <Plus size={15} /> Add an expense
        </div>
      </div>

      <span style={{ fontSize: 14, fontWeight: 600, display: "block", marginBottom: 10 }}>Who owes what</span>
      {balances.map((b) => (
        <div key={b.name} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", fontSize: 14 }}>
          <span>{b.name}</span>
          <span style={{ color: b.net >= 0 ? PINE : CLAY, fontWeight: 500 }}>
            {b.net >= 0 ? `is owed $${b.net}` : `owes $${Math.abs(b.net)}`}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function App() {
  const [screen, setScreen] = useState("welcome");
  const [active, setActive] = useState("overview");
  const [planMode, setPlanMode] = useState("ai");

  if (screen === "welcome") {
    return <Welcome onStart={() => setScreen("room")} onJoin={() => setScreen("room")} />;
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", background: PAPER, color: INK, fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif" }}>
      <Sidebar active={active} setActive={setActive} tripName="Lisbon trip" />
      <div style={{ flex: 1, padding: "32px 40px", overflowY: "auto" }}>
        {active === "overview" && <Overview setActive={setActive} planMode={planMode} setPlanMode={setPlanMode} />}
        {active === "plans" && <Plans />}
        {active === "itinerary" && <Itinerary />}
        {active === "costs" && <Costs />}
      </div>
    </div>
  );
}
