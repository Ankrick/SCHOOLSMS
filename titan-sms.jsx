import { useState, useEffect, useCallback, useRef } from "react";

// ─── CONSTANTS ───────────────────────────────────────────────────
const BRAND = {
  crimson: "#8B1A1A",
  crimsonLight: "#A82828",
  gold: "#C9A961",
  goldLight: "#D4B97A",
  cream: "#FAF6F0",
  charcoal: "#1A1A1A",
  charcoalLight: "#2D2D2D",
  white: "#FFFFFF",
  green: "#2D7A3A",
  greenLight: "#E8F5E9",
  orange: "#D4781A",
  orangeLight: "#FFF3E0",
  red: "#C62828",
  redLight: "#FFEBEE",
  blue: "#1565C0",
  blueLight: "#E3F2FD",
  grey: "#9E9E9E",
  greyLight: "#F5F5F5",
  border: "#E8E0D4",
};

const BATCHES_DEFAULT = [
  { id: "b1", name: "CIE 0478 — Sat/Mon", syllabus: "CIE", days: "Sat & Mon", maxStudents: 15, fee: 180000 },
  { id: "b2", name: "Edexcel 4CP0 Batch 3 — Wed/Sun", syllabus: "Edexcel", days: "Wed & Sun", maxStudents: 15, fee: 180000 },
  { id: "b3", name: "CIE Oct/Nov 2026 — Wed/Thu", syllabus: "CIE", days: "Wed & Thu", maxStudents: 15, fee: 180000 },
];

const CRM_STAGES = ["Prospect", "Lead", "Customer", "Raving Fan"];
const STRIKE_MAX = 3;
const SUBJECTS = ["Computer Science", "ICT", "Mathematics", "Physics", "Biology", "Chemistry"];
const TABS = ["Dashboard", "Students", "Batches", "Invoices", "CRM", "Settings"];

const ICONS = {
  Dashboard: "📊", Students: "🎓", Batches: "📚", Invoices: "🧾", CRM: "🤝", Settings: "⚙️",
  search: "🔍", add: "➕", edit: "✏️", trash: "🗑️", check: "✅", x: "❌",
  warning: "⚠️", clock: "🕐", money: "💰", star: "⭐", fire: "🔥",
  send: "📤", eye: "👁️", download: "⬇️", filter: "🔽",
};

// ─── HELPERS ─────────────────────────────────────────────────────
const genId = () => "id_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
const fmtMMK = (n) => new Intl.NumberFormat("en-US").format(n) + " MMK";
const fmtDate = (d) => d ? new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—";
const fmtDateInput = (d) => d ? new Date(d).toISOString().split("T")[0] : "";
const today = () => new Date().toISOString().split("T")[0];
const monthKey = (d) => { const dt = new Date(d); return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,"0")}`; };
const currentMonthKey = () => monthKey(new Date());

const STORAGE_KEY = "titan-sms-data";

function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return null;
}

function saveData(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {}
}

const defaultState = () => ({
  students: [],
  batches: [...BATCHES_DEFAULT],
  invoices: [],
  leads: [],
  settings: {
    defaultFee: 180000,
    currency: "MMK",
    autoInvoiceDay: 1,
    invoicePrefix: "TLC",
    nextInvoiceNum: 1001,
  },
});

// ─── STYLES ──────────────────────────────────────────────────────
const S = {
  app: { display: "flex", minHeight: "100vh", fontFamily: "'Crimson Pro', 'Georgia', serif", background: BRAND.cream, color: BRAND.charcoal },
  sidebar: { width: 240, background: BRAND.charcoal, color: BRAND.cream, display: "flex", flexDirection: "column", position: "sticky", top: 0, height: "100vh", flexShrink: 0 },
  sidebarHeader: { padding: "24px 20px 16px", borderBottom: `1px solid ${BRAND.charcoalLight}` },
  sidebarLogo: { fontSize: 20, fontWeight: 700, color: BRAND.gold, letterSpacing: "0.5px", lineHeight: 1.2 },
  sidebarSub: { fontSize: 11, color: BRAND.grey, marginTop: 4, letterSpacing: "1px", textTransform: "uppercase" },
  navItem: (active) => ({
    display: "flex", alignItems: "center", gap: 12, padding: "12px 20px", cursor: "pointer",
    background: active ? BRAND.crimson : "transparent",
    color: active ? BRAND.white : BRAND.grey,
    fontSize: 14, fontWeight: active ? 600 : 400, transition: "all 0.2s",
    borderLeft: active ? `3px solid ${BRAND.gold}` : "3px solid transparent",
  }),
  main: { flex: 1, padding: "28px 36px", maxWidth: 1200, overflow: "auto" },
  pageTitle: { fontSize: 28, fontWeight: 700, color: BRAND.crimson, marginBottom: 4 },
  pageDesc: { fontSize: 14, color: BRAND.grey, marginBottom: 24 },
  card: { background: BRAND.white, borderRadius: 10, border: `1px solid ${BRAND.border}`, padding: 24, marginBottom: 20 },
  cardTitle: { fontSize: 16, fontWeight: 700, marginBottom: 16, color: BRAND.charcoal, display: "flex", alignItems: "center", gap: 8 },
  statsRow: { display: "flex", gap: 16, marginBottom: 24, flexWrap: "wrap" },
  statCard: (accent) => ({
    flex: "1 1 180px", background: BRAND.white, borderRadius: 10, padding: "20px 24px",
    border: `1px solid ${BRAND.border}`, borderLeft: `4px solid ${accent}`,
    minWidth: 180,
  }),
  statNum: { fontSize: 28, fontWeight: 700, color: BRAND.charcoal },
  statLabel: { fontSize: 12, color: BRAND.grey, marginTop: 4, textTransform: "uppercase", letterSpacing: "0.5px" },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13 },
  th: { textAlign: "left", padding: "10px 12px", borderBottom: `2px solid ${BRAND.border}`, color: BRAND.grey, fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.5px" },
  td: { padding: "10px 12px", borderBottom: `1px solid ${BRAND.border}`, verticalAlign: "middle" },
  btn: (variant = "primary") => ({
    padding: "8px 16px", borderRadius: 6, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600,
    fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: 6, transition: "all 0.2s",
    ...(variant === "primary" ? { background: BRAND.crimson, color: BRAND.white } : {}),
    ...(variant === "secondary" ? { background: BRAND.cream, color: BRAND.charcoal, border: `1px solid ${BRAND.border}` } : {}),
    ...(variant === "gold" ? { background: BRAND.gold, color: BRAND.charcoal } : {}),
    ...(variant === "danger" ? { background: BRAND.red, color: BRAND.white } : {}),
    ...(variant === "success" ? { background: BRAND.green, color: BRAND.white } : {}),
    ...(variant === "ghost" ? { background: "transparent", color: BRAND.crimson, padding: "8px 12px" } : {}),
    ...(variant === "small" ? { background: BRAND.cream, color: BRAND.charcoal, padding: "4px 10px", fontSize: 12, border: `1px solid ${BRAND.border}` } : {}),
  }),
  badge: (color, bg) => ({
    display: "inline-block", padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600,
    color, background: bg,
  }),
  input: { width: "100%", padding: "8px 12px", borderRadius: 6, border: `1px solid ${BRAND.border}`, fontSize: 14, fontFamily: "inherit", background: BRAND.white, boxSizing: "border-box" },
  select: { width: "100%", padding: "8px 12px", borderRadius: 6, border: `1px solid ${BRAND.border}`, fontSize: 14, fontFamily: "inherit", background: BRAND.white, boxSizing: "border-box" },
  formGroup: { marginBottom: 16 },
  formLabel: { display: "block", fontSize: 12, fontWeight: 600, color: BRAND.grey, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.5px" },
  modal: { position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 },
  modalContent: { background: BRAND.white, borderRadius: 12, padding: 28, maxWidth: 520, width: "90%", maxHeight: "85vh", overflow: "auto" },
  modalTitle: { fontSize: 20, fontWeight: 700, color: BRAND.crimson, marginBottom: 20 },
  toolbar: { display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap", alignItems: "center" },
  searchBox: { flex: "1 1 220px", position: "relative" },
  searchInput: { width: "100%", padding: "8px 12px 8px 36px", borderRadius: 6, border: `1px solid ${BRAND.border}`, fontSize: 14, fontFamily: "inherit", boxSizing: "border-box" },
  searchIcon: { position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", fontSize: 14 },
  pipelineRow: { display: "flex", gap: 16, marginBottom: 24, overflowX: "auto" },
  pipelineCol: (accent) => ({
    flex: "1 1 220px", minWidth: 220, background: BRAND.white, borderRadius: 10,
    border: `1px solid ${BRAND.border}`, borderTop: `3px solid ${accent}`, overflow: "hidden",
  }),
  pipelineHeader: { padding: "12px 16px", fontWeight: 700, fontSize: 13, borderBottom: `1px solid ${BRAND.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" },
  pipelineCard: { padding: "12px 16px", borderBottom: `1px solid ${BRAND.border}`, cursor: "pointer", transition: "background 0.15s" },
  invoicePreview: { border: `2px solid ${BRAND.crimson}`, borderRadius: 10, padding: 32, background: BRAND.white, maxWidth: 600, margin: "0 auto" },
  flex: { display: "flex", alignItems: "center", gap: 8 },
  flexBetween: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  tag: { display: "inline-block", padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 600, background: BRAND.cream, color: BRAND.charcoal, marginRight: 4 },
  emptyState: { textAlign: "center", padding: "48px 20px", color: BRAND.grey },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  strikeIndicator: (count) => ({
    display: "inline-flex", gap: 3,
  }),
};

// ─── COMPONENTS ──────────────────────────────────────────────────
function Modal({ title, onClose, children }) {
  return (
    <div style={S.modal} onClick={onClose}>
      <div style={S.modalContent} onClick={(e) => e.stopPropagation()}>
        <div style={{ ...S.flexBetween, marginBottom: 8 }}>
          <div style={S.modalTitle}>{title}</div>
          <button style={S.btn("ghost")} onClick={onClose}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Badge({ stage }) {
  const map = {
    Prospect: [BRAND.blue, BRAND.blueLight],
    Lead: [BRAND.orange, BRAND.orangeLight],
    Customer: [BRAND.green, BRAND.greenLight],
    "Raving Fan": [BRAND.crimson, BRAND.redLight],
    Paid: [BRAND.green, BRAND.greenLight],
    Unpaid: [BRAND.red, BRAND.redLight],
    Overdue: [BRAND.orange, BRAND.orangeLight],
    Partial: [BRAND.orange, BRAND.orangeLight],
    Active: [BRAND.green, BRAND.greenLight],
    Inactive: [BRAND.grey, BRAND.greyLight],
    Expelled: [BRAND.red, BRAND.redLight],
    Pending: [BRAND.orange, BRAND.orangeLight],
    Draft: [BRAND.grey, BRAND.greyLight],
    Sent: [BRAND.blue, BRAND.blueLight],
    Cancelled: [BRAND.grey, BRAND.greyLight],
  };
  const [c, bg] = map[stage] || [BRAND.grey, BRAND.greyLight];
  return <span style={S.badge(c, bg)}>{stage}</span>;
}

function Strikes({ count }) {
  return (
    <span style={S.strikeIndicator(count)} title={`${count}/${STRIKE_MAX} strikes`}>
      {[0, 1, 2].map((i) => (
        <span key={i} style={{ width: 8, height: 8, borderRadius: "50%", background: i < count ? BRAND.red : BRAND.border, display: "inline-block" }} />
      ))}
    </span>
  );
}

function EmptyState({ icon, message, action }) {
  return (
    <div style={S.emptyState}>
      <div style={S.emptyIcon}>{icon}</div>
      <div style={{ marginBottom: 16 }}>{message}</div>
      {action}
    </div>
  );
}

// ─── DASHBOARD ───────────────────────────────────────────────────
function Dashboard({ data }) {
  const { students, invoices, leads, batches } = data;
  const activeStudents = students.filter((s) => s.status === "Active").length;
  const totalRevenue = invoices.filter((i) => i.status === "Paid").reduce((sum, i) => sum + i.amountPaid, 0);
  const unpaidInvoices = invoices.filter((i) => i.status === "Unpaid" || i.status === "Overdue").length;
  const totalLeads = leads.filter((l) => l.stage === "Lead" || l.stage === "Prospect").length;
  const thisMonth = currentMonthKey();
  const monthRevenue = invoices.filter((i) => i.status === "Paid" && monthKey(i.paidDate) === thisMonth).reduce((sum, i) => sum + i.amountPaid, 0);
  const overdueInvoices = invoices.filter((i) => i.status === "Overdue");
  const recentLeads = leads.filter((l) => l.stage === "Lead").sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 5);
  const strikStudents = students.filter((s) => s.strikes >= 2 && s.status === "Active");

  return (
    <div>
      <div style={S.pageTitle}>Dashboard</div>
      <div style={S.pageDesc}>Titan Learning Center — Overview</div>

      <div style={S.statsRow}>
        <div style={S.statCard(BRAND.crimson)}>
          <div style={S.statNum}>{activeStudents}</div>
          <div style={S.statLabel}>Active Students</div>
        </div>
        <div style={S.statCard(BRAND.gold)}>
          <div style={S.statNum}>{fmtMMK(monthRevenue)}</div>
          <div style={S.statLabel}>This Month Revenue</div>
        </div>
        <div style={S.statCard(BRAND.green)}>
          <div style={S.statNum}>{fmtMMK(totalRevenue)}</div>
          <div style={S.statLabel}>Total Revenue</div>
        </div>
        <div style={S.statCard(BRAND.orange)}>
          <div style={S.statNum}>{unpaidInvoices}</div>
          <div style={S.statLabel}>Unpaid Invoices</div>
        </div>
        <div style={S.statCard(BRAND.blue)}>
          <div style={S.statNum}>{totalLeads}</div>
          <div style={S.statLabel}>Active Leads</div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
        <div style={{ ...S.card, flex: "1 1 340px" }}>
          <div style={S.cardTitle}>{ICONS.fire} Batch Capacity</div>
          {batches.map((b) => {
            const enrolled = students.filter((s) => s.batchId === b.id && s.status === "Active").length;
            const pct = Math.round((enrolled / b.maxStudents) * 100);
            return (
              <div key={b.id} style={{ marginBottom: 14 }}>
                <div style={{ ...S.flexBetween, marginBottom: 4 }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{b.name}</span>
                  <span style={{ fontSize: 12, color: BRAND.grey }}>{enrolled}/{b.maxStudents}</span>
                </div>
                <div style={{ height: 8, borderRadius: 4, background: BRAND.greyLight, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${pct}%`, background: pct >= 90 ? BRAND.red : pct >= 70 ? BRAND.gold : BRAND.green, borderRadius: 4, transition: "width 0.5s" }} />
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ ...S.card, flex: "1 1 340px" }}>
          <div style={S.cardTitle}>{ICONS.warning} Attention Needed</div>
          {overdueInvoices.length > 0 && (
            <div style={{ padding: "10px 14px", background: BRAND.orangeLight, borderRadius: 6, marginBottom: 10, fontSize: 13 }}>
              <strong>{overdueInvoices.length}</strong> overdue invoice{overdueInvoices.length > 1 ? "s" : ""} pending collection
            </div>
          )}
          {strikStudents.length > 0 && (
            <div style={{ padding: "10px 14px", background: BRAND.redLight, borderRadius: 6, marginBottom: 10, fontSize: 13 }}>
              <strong>{strikStudents.length}</strong> student{strikStudents.length > 1 ? "s" : ""} at 2+ strikes
            </div>
          )}
          {overdueInvoices.length === 0 && strikStudents.length === 0 && (
            <div style={{ color: BRAND.grey, fontSize: 13 }}>All clear — nothing needs urgent attention.</div>
          )}
          {recentLeads.length > 0 && (
            <>
              <div style={{ fontSize: 12, fontWeight: 600, color: BRAND.grey, marginTop: 14, marginBottom: 8, textTransform: "uppercase" }}>Recent Leads</div>
              {recentLeads.map((l) => (
                <div key={l.id} style={{ fontSize: 13, padding: "6px 0", borderBottom: `1px solid ${BRAND.border}` }}>
                  {l.name} — <span style={{ color: BRAND.grey }}>{l.source}</span>
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── STUDENTS ────────────────────────────────────────────────────
function StudentsPage({ data, setData }) {
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState(null);
  const [filterBatch, setFilterBatch] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");

  const filtered = data.students.filter((s) => {
    if (filterBatch !== "all" && s.batchId !== filterBatch) return false;
    if (filterStatus !== "all" && s.status !== filterStatus) return false;
    if (search && !s.name.toLowerCase().includes(search.toLowerCase()) && !s.email.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  function saveStudent(student) {
    setData((prev) => {
      const exists = prev.students.find((s) => s.id === student.id);
      const students = exists
        ? prev.students.map((s) => (s.id === student.id ? student : s))
        : [...prev.students, student];
      return { ...prev, students };
    });
    setShowAdd(false);
    setEditing(null);
  }

  function deleteStudent(id) {
    if (!confirm("Remove this student?")) return;
    setData((prev) => ({ ...prev, students: prev.students.filter((s) => s.id !== id) }));
  }

  function addStrike(id) {
    setData((prev) => ({
      ...prev,
      students: prev.students.map((s) => {
        if (s.id !== id) return s;
        const newStrikes = s.strikes + 1;
        return { ...s, strikes: newStrikes, status: newStrikes >= STRIKE_MAX ? "Expelled" : s.status };
      }),
    }));
  }

  function removeStrike(id) {
    setData((prev) => ({
      ...prev,
      students: prev.students.map((s) => s.id === id ? { ...s, strikes: Math.max(0, s.strikes - 1) } : s),
    }));
  }

  return (
    <div>
      <div style={S.pageTitle}>Students</div>
      <div style={S.pageDesc}>Manage enrolled students, track attendance and performance</div>

      <div style={S.toolbar}>
        <div style={S.searchBox}>
          <span style={S.searchIcon}>{ICONS.search}</span>
          <input style={S.searchInput} placeholder="Search students..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select style={{ ...S.select, width: "auto", minWidth: 160 }} value={filterBatch} onChange={(e) => setFilterBatch(e.target.value)}>
          <option value="all">All Batches</option>
          {data.batches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <select style={{ ...S.select, width: "auto", minWidth: 120 }} value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
          <option value="all">All Status</option>
          <option value="Active">Active</option>
          <option value="Inactive">Inactive</option>
          <option value="Expelled">Expelled</option>
        </select>
        <button style={S.btn("primary")} onClick={() => setShowAdd(true)}>{ICONS.add} Add Student</button>
      </div>

      <div style={S.card}>
        {filtered.length === 0 ? (
          <EmptyState icon="🎓" message="No students found" action={<button style={S.btn("primary")} onClick={() => setShowAdd(true)}>Add First Student</button>} />
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={S.table}>
              <thead>
                <tr>
                  <th style={S.th}>Name</th>
                  <th style={S.th}>Batch</th>
                  <th style={S.th}>Subject</th>
                  <th style={S.th}>Status</th>
                  <th style={S.th}>Strikes</th>
                  <th style={S.th}>Enrolled</th>
                  <th style={S.th}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((s) => {
                  const batch = data.batches.find((b) => b.id === s.batchId);
                  return (
                    <tr key={s.id} style={{ transition: "background 0.15s" }} onMouseEnter={(e) => e.currentTarget.style.background = BRAND.cream} onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>
                      <td style={S.td}>
                        <div style={{ fontWeight: 600 }}>{s.name}</div>
                        <div style={{ fontSize: 11, color: BRAND.grey }}>{s.email}</div>
                      </td>
                      <td style={S.td}><span style={S.tag}>{batch ? batch.name : "—"}</span></td>
                      <td style={S.td}>{s.subject}</td>
                      <td style={S.td}><Badge stage={s.status} /></td>
                      <td style={S.td}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <Strikes count={s.strikes} />
                          <button style={{ ...S.btn("small"), padding: "2px 6px", fontSize: 10 }} onClick={() => addStrike(s.id)} title="Add strike">+</button>
                          {s.strikes > 0 && <button style={{ ...S.btn("small"), padding: "2px 6px", fontSize: 10 }} onClick={() => removeStrike(s.id)} title="Remove strike">−</button>}
                        </div>
                      </td>
                      <td style={S.td}>{fmtDate(s.enrolledDate)}</td>
                      <td style={S.td}>
                        <div style={{ display: "flex", gap: 4 }}>
                          <button style={S.btn("small")} onClick={() => setEditing(s)}>Edit</button>
                          <button style={S.btn("small")} onClick={() => deleteStudent(s.id)}>🗑️</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {(showAdd || editing) && (
        <StudentForm
          student={editing}
          batches={data.batches}
          onSave={saveStudent}
          onClose={() => { setShowAdd(false); setEditing(null); }}
        />
      )}
    </div>
  );
}

function StudentForm({ student, batches, onSave, onClose }) {
  const [form, setForm] = useState(student || {
    id: genId(), name: "", email: "", phone: "", batchId: batches[0]?.id || "",
    subject: "Computer Science", status: "Active", strikes: 0,
    enrolledDate: today(), parentName: "", parentPhone: "", notes: "",
  });

  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  return (
    <Modal title={student ? "Edit Student" : "Add Student"} onClose={onClose}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div style={S.formGroup}><label style={S.formLabel}>Full Name *</label><input style={S.input} value={form.name} onChange={(e) => set("name", e.target.value)} /></div>
        <div style={S.formGroup}><label style={S.formLabel}>Email</label><input style={S.input} value={form.email} onChange={(e) => set("email", e.target.value)} /></div>
        <div style={S.formGroup}><label style={S.formLabel}>Phone</label><input style={S.input} value={form.phone} onChange={(e) => set("phone", e.target.value)} /></div>
        <div style={S.formGroup}>
          <label style={S.formLabel}>Batch *</label>
          <select style={S.select} value={form.batchId} onChange={(e) => set("batchId", e.target.value)}>
            {batches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
        <div style={S.formGroup}>
          <label style={S.formLabel}>Subject</label>
          <select style={S.select} value={form.subject} onChange={(e) => set("subject", e.target.value)}>
            {SUBJECTS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div style={S.formGroup}>
          <label style={S.formLabel}>Status</label>
          <select style={S.select} value={form.status} onChange={(e) => set("status", e.target.value)}>
            <option value="Active">Active</option>
            <option value="Inactive">Inactive</option>
            <option value="Expelled">Expelled</option>
          </select>
        </div>
        <div style={S.formGroup}><label style={S.formLabel}>Enrolled Date</label><input style={S.input} type="date" value={fmtDateInput(form.enrolledDate)} onChange={(e) => set("enrolledDate", e.target.value)} /></div>
        <div style={S.formGroup}><label style={S.formLabel}>Contact</label><input style={S.input} value={form.parentName} onChange={(e) => set("parentName", e.target.value)} /></div>
        <div style={S.formGroup}><label style={S.formLabel}>Parent Phone</label><input style={S.input} value={form.parentPhone} onChange={(e) => set("parentPhone", e.target.value)} /></div>
      </div>
      <div style={S.formGroup}><label style={S.formLabel}>Notes</label><textarea style={{ ...S.input, height: 60, resize: "vertical" }} value={form.notes} onChange={(e) => set("notes", e.target.value)} /></div>
      <div style={{ display: "flex", gap: 12, justifyContent: "flex-end", marginTop: 12 }}>
        <button style={S.btn("secondary")} onClick={onClose}>Cancel</button>
        <button style={S.btn("primary")} onClick={() => form.name ? onSave(form) : alert("Name is required")} disabled={!form.name}>Save Student</button>
      </div>
    </Modal>
  );
}

// ─── BATCHES ─────────────────────────────────────────────────────
function BatchesPage({ data, setData }) {
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState(null);

  function saveBatch(batch) {
    setData((prev) => {
      const exists = prev.batches.find((b) => b.id === batch.id);
      const batches = exists
        ? prev.batches.map((b) => (b.id === batch.id ? batch : b))
        : [...prev.batches, batch];
      return { ...prev, batches };
    });
    setShowAdd(false); setEditing(null);
  }

  function deleteBatch(id) {
    const hasStudents = data.students.some((s) => s.batchId === id);
    if (hasStudents) return alert("Cannot delete a batch that has enrolled students.");
    if (!confirm("Delete this batch?")) return;
    setData((prev) => ({ ...prev, batches: prev.batches.filter((b) => b.id !== id) }));
  }

  return (
    <div>
      <div style={S.pageTitle}>Batches</div>
      <div style={S.pageDesc}>Manage cohorts — max 15 students per batch</div>

      <div style={S.toolbar}>
        <button style={S.btn("primary")} onClick={() => setShowAdd(true)}>{ICONS.add} Add Batch</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 20 }}>
        {data.batches.map((b) => {
          const enrolled = data.students.filter((s) => s.batchId === b.id && s.status === "Active");
          const pct = Math.round((enrolled.length / b.maxStudents) * 100);
          return (
            <div key={b.id} style={S.card}>
              <div style={{ ...S.flexBetween, marginBottom: 12 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 16 }}>{b.name}</div>
                  <div style={{ fontSize: 12, color: BRAND.grey }}>{b.syllabus} • {b.days}</div>
                </div>
                <div style={{ display: "flex", gap: 4 }}>
                  <button style={S.btn("small")} onClick={() => setEditing(b)}>Edit</button>
                  <button style={S.btn("small")} onClick={() => deleteBatch(b.id)}>🗑️</button>
                </div>
              </div>
              <div style={{ ...S.flexBetween, marginBottom: 6 }}>
                <span style={{ fontSize: 13 }}>{enrolled.length} / {b.maxStudents} students</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: pct >= 90 ? BRAND.red : BRAND.green }}>{pct}%</span>
              </div>
              <div style={{ height: 8, borderRadius: 4, background: BRAND.greyLight, overflow: "hidden", marginBottom: 16 }}>
                <div style={{ height: "100%", width: `${pct}%`, background: pct >= 90 ? BRAND.red : pct >= 70 ? BRAND.gold : BRAND.green, borderRadius: 4 }} />
              </div>
              <div style={{ fontSize: 13, color: BRAND.grey }}>Fee: <strong style={{ color: BRAND.charcoal }}>{fmtMMK(b.fee)}</strong>/month</div>
              {enrolled.length > 0 && (
                <div style={{ marginTop: 12, borderTop: `1px solid ${BRAND.border}`, paddingTop: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: BRAND.grey, marginBottom: 6, textTransform: "uppercase" }}>Enrolled</div>
                  {enrolled.map((s) => (
                    <div key={s.id} style={{ fontSize: 12, padding: "3px 0", display: "flex", alignItems: "center", gap: 6 }}>
                      <span>{s.name}</span>
                      <Strikes count={s.strikes} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {(showAdd || editing) && (
        <BatchForm batch={editing} onSave={saveBatch} onClose={() => { setShowAdd(false); setEditing(null); }} />
      )}
    </div>
  );
}

function BatchForm({ batch, onSave, onClose }) {
  const [form, setForm] = useState(batch || {
    id: genId(), name: "", syllabus: "CIE", days: "", maxStudents: 15, fee: 180000,
  });
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  return (
    <Modal title={batch ? "Edit Batch" : "Add Batch"} onClose={onClose}>
      <div style={S.formGroup}><label style={S.formLabel}>Batch Name *</label><input style={S.input} value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. CIE 0478 — Sat/Mon" /></div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div style={S.formGroup}>
          <label style={S.formLabel}>Syllabus</label>
          <select style={S.select} value={form.syllabus} onChange={(e) => set("syllabus", e.target.value)}>
            <option value="CIE">CIE</option><option value="Edexcel">Edexcel</option>
          </select>
        </div>
        <div style={S.formGroup}><label style={S.formLabel}>Days</label><input style={S.input} value={form.days} onChange={(e) => set("days", e.target.value)} placeholder="e.g. Sat & Mon" /></div>
        <div style={S.formGroup}><label style={S.formLabel}>Max Students</label><input style={S.input} type="number" value={form.maxStudents} onChange={(e) => set("maxStudents", parseInt(e.target.value) || 15)} /></div>
        <div style={S.formGroup}><label style={S.formLabel}>Monthly Fee (MMK)</label><input style={S.input} type="number" value={form.fee} onChange={(e) => set("fee", parseInt(e.target.value) || 0)} /></div>
      </div>
      <div style={{ display: "flex", gap: 12, justifyContent: "flex-end", marginTop: 12 }}>
        <button style={S.btn("secondary")} onClick={onClose}>Cancel</button>
        <button style={S.btn("primary")} onClick={() => form.name ? onSave(form) : alert("Name is required")}>Save Batch</button>
      </div>
    </Modal>
  );
}

// ─── INVOICES ────────────────────────────────────────────────────
function InvoicesPage({ data, setData }) {
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [preview, setPreview] = useState(null);
  const [showGenerate, setShowGenerate] = useState(false);

  const filtered = data.invoices.filter((inv) => {
    if (filterStatus !== "all" && inv.status !== filterStatus) return false;
    if (search) {
      const s = search.toLowerCase();
      return inv.invoiceNumber.toLowerCase().includes(s) || inv.studentName.toLowerCase().includes(s);
    }
    return true;
  }).sort((a, b) => new Date(b.issueDate) - new Date(a.issueDate));

  function generateMonthlyInvoices() {
    const mk = currentMonthKey();
    const activeStudents = data.students.filter((s) => s.status === "Active");
    const existingThisMonth = data.invoices.filter((i) => i.monthKey === mk);
    const alreadyInvoiced = new Set(existingThisMonth.map((i) => i.studentId));
    const toGenerate = activeStudents.filter((s) => !alreadyInvoiced.has(s.id));

    if (toGenerate.length === 0) {
      alert("All active students already have invoices for this month.");
      return;
    }

    let nextNum = data.settings.nextInvoiceNum;
    const newInvoices = toGenerate.map((s) => {
      const batch = data.batches.find((b) => b.id === s.batchId);
      const fee = batch ? batch.fee : data.settings.defaultFee;
      const inv = {
        id: genId(),
        invoiceNumber: `${data.settings.invoicePrefix}-${nextNum}`,
        studentId: s.id,
        studentName: s.name,
        studentEmail: s.email,
        batchId: s.batchId,
        batchName: batch ? batch.name : "—",
        monthKey: mk,
        issueDate: today(),
        dueDate: new Date(new Date().setDate(new Date().getDate() + 14)).toISOString().split("T")[0],
        amount: fee,
        amountPaid: 0,
        status: "Unpaid",
        paidDate: null,
        items: [{ desc: `${batch ? batch.name : "Tuition"} — ${mk}`, qty: 1, rate: fee }],
        notes: "",
      };
      nextNum++;
      return inv;
    });

    setData((prev) => ({
      ...prev,
      invoices: [...prev.invoices, ...newInvoices],
      settings: { ...prev.settings, nextInvoiceNum: nextNum },
    }));
    setShowGenerate(false);
    alert(`${newInvoices.length} invoice${newInvoices.length > 1 ? "s" : ""} generated.`);
  }

  function markPaid(id) {
    setData((prev) => ({
      ...prev,
      invoices: prev.invoices.map((i) => i.id === id ? { ...i, status: "Paid", amountPaid: i.amount, paidDate: today() } : i),
    }));
  }

  function markOverdue() {
    const todayStr = today();
    setData((prev) => ({
      ...prev,
      invoices: prev.invoices.map((i) => (i.status === "Unpaid" && i.dueDate < todayStr) ? { ...i, status: "Overdue" } : i),
    }));
  }

  function deleteInvoice(id) {
    if (!confirm("Delete this invoice?")) return;
    setData((prev) => ({ ...prev, invoices: prev.invoices.filter((i) => i.id !== id) }));
  }

  // Auto-check overdue on mount
  useEffect(() => { markOverdue(); }, []);

  const totalUnpaid = data.invoices.filter((i) => i.status === "Unpaid" || i.status === "Overdue").reduce((s, i) => s + i.amount - i.amountPaid, 0);
  const totalPaidThisMonth = data.invoices.filter((i) => i.status === "Paid" && i.monthKey === currentMonthKey()).reduce((s, i) => s + i.amountPaid, 0);

  return (
    <div>
      <div style={S.pageTitle}>Invoices</div>
      <div style={S.pageDesc}>Auto-generated monthly invoices — minimal manual work</div>

      <div style={S.statsRow}>
        <div style={S.statCard(BRAND.green)}>
          <div style={S.statNum}>{fmtMMK(totalPaidThisMonth)}</div>
          <div style={S.statLabel}>Collected This Month</div>
        </div>
        <div style={S.statCard(BRAND.orange)}>
          <div style={S.statNum}>{fmtMMK(totalUnpaid)}</div>
          <div style={S.statLabel}>Outstanding Balance</div>
        </div>
      </div>

      <div style={S.toolbar}>
        <div style={S.searchBox}>
          <span style={S.searchIcon}>{ICONS.search}</span>
          <input style={S.searchInput} placeholder="Search invoices..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select style={{ ...S.select, width: "auto", minWidth: 120 }} value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
          <option value="all">All Status</option>
          <option value="Unpaid">Unpaid</option>
          <option value="Paid">Paid</option>
          <option value="Overdue">Overdue</option>
        </select>
        <button style={S.btn("gold")} onClick={() => setShowGenerate(true)}>{ICONS.money} Generate Monthly Invoices</button>
      </div>

      <div style={S.card}>
        {filtered.length === 0 ? (
          <EmptyState icon="🧾" message="No invoices yet" action={<button style={S.btn("gold")} onClick={() => setShowGenerate(true)}>Generate Invoices</button>} />
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={S.table}>
              <thead>
                <tr>
                  <th style={S.th}>Invoice #</th>
                  <th style={S.th}>Student</th>
                  <th style={S.th}>Batch</th>
                  <th style={S.th}>Month</th>
                  <th style={S.th}>Amount</th>
                  <th style={S.th}>Status</th>
                  <th style={S.th}>Due Date</th>
                  <th style={S.th}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((inv) => (
                  <tr key={inv.id} onMouseEnter={(e) => e.currentTarget.style.background = BRAND.cream} onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>
                    <td style={{ ...S.td, fontWeight: 600, fontFamily: "monospace" }}>{inv.invoiceNumber}</td>
                    <td style={S.td}>{inv.studentName}</td>
                    <td style={S.td}><span style={S.tag}>{inv.batchName}</span></td>
                    <td style={S.td}>{inv.monthKey}</td>
                    <td style={S.td}>{fmtMMK(inv.amount)}</td>
                    <td style={S.td}><Badge stage={inv.status} /></td>
                    <td style={S.td}>{fmtDate(inv.dueDate)}</td>
                    <td style={S.td}>
                      <div style={{ display: "flex", gap: 4 }}>
                        <button style={S.btn("small")} onClick={() => setPreview(inv)} title="Preview">👁️</button>
                        {(inv.status === "Unpaid" || inv.status === "Overdue") && (
                          <button style={S.btn("success")} onClick={() => markPaid(inv.id)}>Mark Paid</button>
                        )}
                        <button style={{ ...S.btn("small"), color: BRAND.red }} onClick={() => deleteInvoice(inv.id)}>🗑️</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showGenerate && (
        <Modal title="Generate Monthly Invoices" onClose={() => setShowGenerate(false)}>
          <p style={{ fontSize: 14, marginBottom: 16 }}>
            This will create invoices for all <strong>active students</strong> who don't already have one for <strong>{currentMonthKey()}</strong>.
            Each invoice is auto-filled with the student's batch fee.
          </p>
          <p style={{ fontSize: 13, color: BRAND.grey, marginBottom: 20 }}>
            Students to invoice: <strong>{data.students.filter((s) => s.status === "Active" && !data.invoices.some((i) => i.studentId === s.id && i.monthKey === currentMonthKey())).length}</strong>
          </p>
          <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
            <button style={S.btn("secondary")} onClick={() => setShowGenerate(false)}>Cancel</button>
            <button style={S.btn("gold")} onClick={generateMonthlyInvoices}>Generate Now</button>
          </div>
        </Modal>
      )}

      {preview && (
        <Modal title="Invoice Preview" onClose={() => setPreview(null)}>
          <InvoicePreview invoice={preview} settings={data.settings} />
        </Modal>
      )}
    </div>
  );
}

function InvoicePreview({ invoice, settings }) {
  return (
    <div style={S.invoicePreview}>
      <div style={{ ...S.flexBetween, marginBottom: 24 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 700, color: BRAND.crimson }}>TITAN</div>
          <div style={{ fontSize: 11, color: BRAND.grey, letterSpacing: "2px", textTransform: "uppercase" }}>Learning Center</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: BRAND.charcoal }}>INVOICE</div>
          <div style={{ fontSize: 13, color: BRAND.grey, fontFamily: "monospace" }}>{invoice.invoiceNumber}</div>
        </div>
      </div>

      <div style={{ borderTop: `2px solid ${BRAND.crimson}`, paddingTop: 16, marginBottom: 20 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, fontSize: 13 }}>
          <div>
            <div style={{ fontWeight: 600, marginBottom: 4, color: BRAND.grey, fontSize: 11, textTransform: "uppercase" }}>Bill To</div>
            <div style={{ fontWeight: 600 }}>{invoice.studentName}</div>
            <div style={{ color: BRAND.grey }}>{invoice.studentEmail}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div><span style={{ color: BRAND.grey }}>Issue Date:</span> {fmtDate(invoice.issueDate)}</div>
            <div><span style={{ color: BRAND.grey }}>Due Date:</span> {fmtDate(invoice.dueDate)}</div>
            <div style={{ marginTop: 6 }}><Badge stage={invoice.status} /></div>
          </div>
        </div>
      </div>

      <table style={{ ...S.table, marginBottom: 20 }}>
        <thead>
          <tr>
            <th style={{ ...S.th, borderBottom: `2px solid ${BRAND.crimson}` }}>Description</th>
            <th style={{ ...S.th, borderBottom: `2px solid ${BRAND.crimson}`, textAlign: "center" }}>Qty</th>
            <th style={{ ...S.th, borderBottom: `2px solid ${BRAND.crimson}`, textAlign: "right" }}>Rate</th>
            <th style={{ ...S.th, borderBottom: `2px solid ${BRAND.crimson}`, textAlign: "right" }}>Amount</th>
          </tr>
        </thead>
        <tbody>
          {invoice.items.map((item, i) => (
            <tr key={i}>
              <td style={S.td}>{item.desc}</td>
              <td style={{ ...S.td, textAlign: "center" }}>{item.qty}</td>
              <td style={{ ...S.td, textAlign: "right" }}>{fmtMMK(item.rate)}</td>
              <td style={{ ...S.td, textAlign: "right", fontWeight: 600 }}>{fmtMMK(item.qty * item.rate)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ borderTop: `2px solid ${BRAND.crimson}`, paddingTop: 12, textAlign: "right" }}>
        <div style={{ fontSize: 13, color: BRAND.grey, marginBottom: 4 }}>Total Due</div>
        <div style={{ fontSize: 24, fontWeight: 700, color: BRAND.crimson }}>{fmtMMK(invoice.amount)}</div>
        {invoice.status === "Paid" && <div style={{ fontSize: 12, color: BRAND.green, marginTop: 4 }}>Paid on {fmtDate(invoice.paidDate)}</div>}
      </div>

      <div style={{ marginTop: 24, padding: "12px 16px", background: BRAND.cream, borderRadius: 6, fontSize: 12, color: BRAND.grey }}>
        <strong style={{ color: BRAND.charcoal }}>Titan Learning Center</strong> — Understanding over Memorization. Be Curious.
      </div>
    </div>
  );
}

// ─── CRM ─────────────────────────────────────────────────────────
function CRMPage({ data, setData }) {
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState(null);
  const [viewMode, setViewMode] = useState("pipeline");

  const stageColors = [BRAND.blue, BRAND.orange, BRAND.green, BRAND.crimson];

  function saveLead(lead) {
    setData((prev) => {
      const exists = prev.leads.find((l) => l.id === lead.id);
      const leads = exists ? prev.leads.map((l) => (l.id === lead.id ? lead : l)) : [...prev.leads, lead];
      return { ...prev, leads };
    });
    setShowAdd(false); setEditing(null);
  }

  function deleteLead(id) {
    if (!confirm("Delete this lead?")) return;
    setData((prev) => ({ ...prev, leads: prev.leads.filter((l) => l.id !== id) }));
  }

  function moveStage(id, newStage) {
    setData((prev) => ({
      ...prev,
      leads: prev.leads.map((l) => l.id === id ? { ...l, stage: newStage, updatedAt: today() } : l),
    }));
  }

  function convertToStudent(lead) {
    const newStudent = {
      id: genId(), name: lead.name, email: lead.email || "", phone: lead.phone || "",
      batchId: data.batches[0]?.id || "", subject: "Computer Science",
      status: "Active", strikes: 0, enrolledDate: today(),
      parentName: lead.parentName || "", parentPhone: lead.parentPhone || "", notes: `Converted from CRM lead. Source: ${lead.source}`,
    };
    setData((prev) => ({
      ...prev,
      students: [...prev.students, newStudent],
      leads: prev.leads.map((l) => l.id === lead.id ? { ...l, stage: "Customer", convertedStudentId: newStudent.id, updatedAt: today() } : l),
    }));
    alert(`${lead.name} converted to student and moved to Customer stage.`);
  }

  return (
    <div>
      <div style={S.pageTitle}>CRM</div>
      <div style={S.pageDesc}>Track leads from Prospect → Lead → Customer → Raving Fan</div>

      <div style={S.toolbar}>
        <button style={S.btn("primary")} onClick={() => setShowAdd(true)}>{ICONS.add} Add Lead</button>
        <div style={{ display: "flex", gap: 4, marginLeft: "auto" }}>
          <button style={S.btn(viewMode === "pipeline" ? "primary" : "secondary")} onClick={() => setViewMode("pipeline")}>Pipeline</button>
          <button style={S.btn(viewMode === "table" ? "primary" : "secondary")} onClick={() => setViewMode("table")}>Table</button>
        </div>
      </div>

      {viewMode === "pipeline" ? (
        <div style={S.pipelineRow}>
          {CRM_STAGES.map((stage, si) => {
            const stageLeads = data.leads.filter((l) => l.stage === stage).sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
            return (
              <div key={stage} style={S.pipelineCol(stageColors[si])}>
                <div style={S.pipelineHeader}>
                  <span>{stage}</span>
                  <span style={{ ...S.badge(stageColors[si], stageColors[si] + "22"), fontSize: 12 }}>{stageLeads.length}</span>
                </div>
                <div style={{ maxHeight: 500, overflow: "auto" }}>
                  {stageLeads.map((l) => (
                    <div key={l.id} style={S.pipelineCard} onClick={() => setEditing(l)} onMouseEnter={(e) => e.currentTarget.style.background = BRAND.cream} onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>
                      <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>{l.name}</div>
                      <div style={{ fontSize: 11, color: BRAND.grey, marginBottom: 6 }}>{l.source} • {fmtDate(l.createdAt)}</div>
                      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                        {si < 3 && (
                          <button style={{ ...S.btn("small"), fontSize: 10, padding: "2px 8px" }} onClick={(e) => { e.stopPropagation(); moveStage(l.id, CRM_STAGES[si + 1]); }}>
                            → {CRM_STAGES[si + 1]}
                          </button>
                        )}
                        {stage === "Lead" && (
                          <button style={{ ...S.btn("small"), fontSize: 10, padding: "2px 8px", background: BRAND.greenLight, color: BRAND.green }} onClick={(e) => { e.stopPropagation(); convertToStudent(l); }}>
                            Convert
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                  {stageLeads.length === 0 && (
                    <div style={{ padding: 16, fontSize: 12, color: BRAND.grey, textAlign: "center" }}>No leads</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div style={S.card}>
          <div style={{ overflowX: "auto" }}>
            <table style={S.table}>
              <thead>
                <tr>
                  <th style={S.th}>Name</th>
                  <th style={S.th}>Stage</th>
                  <th style={S.th}>Source</th>
                  <th style={S.th}>Phone</th>
                  <th style={S.th}>Created</th>
                  <th style={S.th}>Follow-up</th>
                  <th style={S.th}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.leads.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)).map((l) => (
                  <tr key={l.id} onMouseEnter={(e) => e.currentTarget.style.background = BRAND.cream} onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>
                    <td style={S.td}>
                      <div style={{ fontWeight: 600 }}>{l.name}</div>
                      <div style={{ fontSize: 11, color: BRAND.grey }}>{l.email}</div>
                    </td>
                    <td style={S.td}><Badge stage={l.stage} /></td>
                    <td style={S.td}>{l.source}</td>
                    <td style={S.td}>{l.phone}</td>
                    <td style={S.td}>{fmtDate(l.createdAt)}</td>
                    <td style={S.td}>
                      {l.followUpDate ? (
                        <span style={{ color: l.followUpDate <= today() ? BRAND.red : BRAND.grey, fontSize: 12 }}>
                          {l.followUpDate <= today() ? "⚠️ " : ""}{fmtDate(l.followUpDate)}
                        </span>
                      ) : "—"}
                    </td>
                    <td style={S.td}>
                      <div style={{ display: "flex", gap: 4 }}>
                        <button style={S.btn("small")} onClick={() => setEditing(l)}>Edit</button>
                        {l.stage === "Lead" && <button style={{ ...S.btn("small"), color: BRAND.green }} onClick={() => convertToStudent(l)}>Convert</button>}
                        <button style={{ ...S.btn("small"), color: BRAND.red }} onClick={() => deleteLead(l.id)}>🗑️</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {(showAdd || editing) && (
        <LeadForm lead={editing} onSave={saveLead} onClose={() => { setShowAdd(false); setEditing(null); }} onDelete={editing ? () => { deleteLead(editing.id); setEditing(null); } : null} />
      )}
    </div>
  );
}

function LeadForm({ lead, onSave, onClose, onDelete }) {
  const [form, setForm] = useState(lead || {
    id: genId(), name: "", email: "", phone: "", parentName: "", parentPhone: "",
    source: "Facebook DM", stage: "Prospect", notes: "",
    createdAt: today(), updatedAt: today(), followUpDate: "",
    interestLevel: "Medium", convertedStudentId: null,
  });
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v, updatedAt: today() }));

  return (
    <Modal title={lead ? "Edit Lead" : "Add Lead"} onClose={onClose}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div style={S.formGroup}><label style={S.formLabel}>Full Name *</label><input style={S.input} value={form.name} onChange={(e) => set("name", e.target.value)} /></div>
        <div style={S.formGroup}><label style={S.formLabel}>Email</label><input style={S.input} value={form.email} onChange={(e) => set("email", e.target.value)} /></div>
        <div style={S.formGroup}><label style={S.formLabel}>Phone</label><input style={S.input} value={form.phone} onChange={(e) => set("phone", e.target.value)} /></div>
        <div style={S.formGroup}>
          <label style={S.formLabel}>Source</label>
          <select style={S.select} value={form.source} onChange={(e) => set("source", e.target.value)}>
            <option>Facebook DM</option><option>Facebook Group</option><option>Referral</option>
            <option>Campus Rep (Yoon Mo Mo)</option><option>Website</option><option>Walk-in</option><option>Other</option>
          </select>
        </div>
        <div style={S.formGroup}>
          <label style={S.formLabel}>Stage</label>
          <select style={S.select} value={form.stage} onChange={(e) => set("stage", e.target.value)}>
            {CRM_STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div style={S.formGroup}>
          <label style={S.formLabel}>Interest Level</label>
          <select style={S.select} value={form.interestLevel} onChange={(e) => set("interestLevel", e.target.value)}>
            <option>High</option><option>Medium</option><option>Low</option>
          </select>
        </div>
        <div style={S.formGroup}><label style={S.formLabel}>Contact</label><input style={S.input} value={form.parentName} onChange={(e) => set("parentName", e.target.value)} /></div>
        <div style={S.formGroup}><label style={S.formLabel}>Parent Phone</label><input style={S.input} value={form.parentPhone} onChange={(e) => set("parentPhone", e.target.value)} /></div>
        <div style={S.formGroup}><label style={S.formLabel}>Follow-up Date</label><input style={S.input} type="date" value={form.followUpDate || ""} onChange={(e) => set("followUpDate", e.target.value)} /></div>
      </div>
      <div style={S.formGroup}><label style={S.formLabel}>Notes</label><textarea style={{ ...S.input, height: 70, resize: "vertical" }} value={form.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Interaction history, preferences, etc." /></div>
      <div style={{ display: "flex", gap: 12, justifyContent: "space-between", marginTop: 12 }}>
        <div>{onDelete && <button style={S.btn("danger")} onClick={onDelete}>Delete</button>}</div>
        <div style={{ display: "flex", gap: 12 }}>
          <button style={S.btn("secondary")} onClick={onClose}>Cancel</button>
          <button style={S.btn("primary")} onClick={() => form.name ? onSave(form) : alert("Name is required")}>Save Lead</button>
        </div>
      </div>
    </Modal>
  );
}

// ─── SETTINGS ────────────────────────────────────────────────────
function SettingsPage({ data, setData }) {
  const [settings, setSettings] = useState(data.settings);
  const set = (k, v) => setSettings((p) => ({ ...p, [k]: v }));

  function save() {
    setData((prev) => ({ ...prev, settings }));
    alert("Settings saved.");
  }

  function exportData() {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `titan-sms-backup-${today()}.json`; a.click();
    URL.revokeObjectURL(url);
  }

  function importData(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const imported = JSON.parse(ev.target.result);
        if (imported.students && imported.batches && imported.invoices && imported.leads) {
          setData(imported);
          alert("Data imported successfully.");
        } else {
          alert("Invalid backup file.");
        }
      } catch { alert("Failed to parse file."); }
    };
    reader.readAsText(file);
  }

  function resetAll() {
    if (!confirm("Reset ALL data? This cannot be undone.")) return;
    if (!confirm("Are you absolutely sure?")) return;
    setData(defaultState());
  }

  return (
    <div>
      <div style={S.pageTitle}>Settings</div>
      <div style={S.pageDesc}>Configure invoicing, data management, and preferences</div>

      <div style={S.card}>
        <div style={S.cardTitle}>{ICONS.money} Invoice Settings</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div style={S.formGroup}><label style={S.formLabel}>Invoice Prefix</label><input style={S.input} value={settings.invoicePrefix} onChange={(e) => set("invoicePrefix", e.target.value)} /></div>
          <div style={S.formGroup}><label style={S.formLabel}>Next Invoice Number</label><input style={S.input} type="number" value={settings.nextInvoiceNum} onChange={(e) => set("nextInvoiceNum", parseInt(e.target.value) || 1001)} /></div>
          <div style={S.formGroup}><label style={S.formLabel}>Default Monthly Fee (MMK)</label><input style={S.input} type="number" value={settings.defaultFee} onChange={(e) => set("defaultFee", parseInt(e.target.value) || 0)} /></div>
          <div style={S.formGroup}><label style={S.formLabel}>Currency</label><input style={S.input} value={settings.currency} onChange={(e) => set("currency", e.target.value)} /></div>
        </div>
        <button style={S.btn("primary")} onClick={save}>Save Settings</button>
      </div>

      <div style={S.card}>
        <div style={S.cardTitle}>💾 Data Management</div>
        <p style={{ fontSize: 13, color: BRAND.grey, marginBottom: 16 }}>Export your data for backup or import from a previous backup.</p>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <button style={S.btn("secondary")} onClick={exportData}>{ICONS.download} Export Backup (JSON)</button>
          <label style={S.btn("secondary")}>
            📂 Import Backup
            <input type="file" accept=".json" onChange={importData} style={{ display: "none" }} />
          </label>
          <button style={S.btn("danger")} onClick={resetAll}>Reset All Data</button>
        </div>
      </div>

      <div style={S.card}>
        <div style={S.cardTitle}>📊 Quick Stats</div>
        <div style={{ fontSize: 13, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <div>Total Students: <strong>{data.students.length}</strong></div>
          <div>Active Students: <strong>{data.students.filter((s) => s.status === "Active").length}</strong></div>
          <div>Total Batches: <strong>{data.batches.length}</strong></div>
          <div>Total Invoices: <strong>{data.invoices.length}</strong></div>
          <div>Total CRM Leads: <strong>{data.leads.length}</strong></div>
          <div>Lifetime Revenue: <strong>{fmtMMK(data.invoices.filter((i) => i.status === "Paid").reduce((s, i) => s + i.amountPaid, 0))}</strong></div>
        </div>
      </div>
    </div>
  );
}

// ─── MAIN APP ────────────────────────────────────────────────────
export default function TitanSMS() {
  const [activeTab, setActiveTab] = useState("Dashboard");
  const [data, setDataRaw] = useState(() => loadData() || defaultState());

  const setData = useCallback((updater) => {
    setDataRaw((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      saveData(next);
      return next;
    });
  }, []);

  // Save on every data change
  useEffect(() => { saveData(data); }, [data]);

  const pages = {
    Dashboard: <Dashboard data={data} />,
    Students: <StudentsPage data={data} setData={setData} />,
    Batches: <BatchesPage data={data} setData={setData} />,
    Invoices: <InvoicesPage data={data} setData={setData} />,
    CRM: <CRMPage data={data} setData={setData} />,
    Settings: <SettingsPage data={data} setData={setData} />,
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Crimson+Pro:wght@300;400;600;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Crimson Pro', Georgia, serif; }
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-thumb { background: ${BRAND.border}; border-radius: 3px; }
        button:hover { opacity: 0.9; }
        input:focus, select:focus, textarea:focus { outline: none; border-color: ${BRAND.gold}; box-shadow: 0 0 0 2px ${BRAND.gold}33; }
        tr { transition: background 0.15s; }
      `}</style>
      <div style={S.app}>
        <nav style={S.sidebar}>
          <div style={S.sidebarHeader}>
            <div style={S.sidebarLogo}>TITAN</div>
            <div style={S.sidebarSub}>Learning Center</div>
          </div>
          <div style={{ flex: 1, paddingTop: 12 }}>
            {TABS.map((tab) => (
              <div key={tab} style={S.navItem(activeTab === tab)} onClick={() => setActiveTab(tab)}>
                <span>{ICONS[tab]}</span>
                <span>{tab}</span>
              </div>
            ))}
          </div>
          <div style={{ padding: "16px 20px", borderTop: `1px solid ${BRAND.charcoalLight}`, fontSize: 11, color: BRAND.grey }}>
            v1.0 — Understanding over Memorization
          </div>
        </nav>
        <main style={S.main}>
          {pages[activeTab]}
        </main>
      </div>
    </>
  );
}
