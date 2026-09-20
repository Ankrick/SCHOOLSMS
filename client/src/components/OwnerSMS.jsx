import { useState, useEffect, useRef, useMemo } from "react";
import html2canvas from "html2canvas";
import * as api from "../api";
import { StudentsPage } from "./StudentsBatches";
import { MarkPaidModal, SlipViewer } from "./PaymentSlip";

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

const CRM_STAGES = ["Prospect", "Lead", "Customer", "Raving Fan"];
const SUBJECTS = ["Computer Science", "ICT", "Mathematics", "Physics", "Biology", "Chemistry"];
// Batches live inside the Students tab now, same as every other role's view.
const TABS = ["Dashboard", "Students", "Teachers", "Invoices", "Payment History", "Transactions", "Fee Tracker", "CRM", "Settings"];

const ICONS = {
  Dashboard: "📊", Students: "🎓", Teachers: "👩‍🏫", Batches: "📚", Invoices: "🧾", "Payment History": "💳", Transactions: "📸", "Fee Tracker": "🗓️", CRM: "🤝", Settings: "⚙️",
  search: "🔍", add: "➕", edit: "✏️", trash: "🗑️", check: "✅", x: "❌",
  warning: "⚠️", clock: "🕐", money: "💰", star: "⭐", fire: "🔥",
  send: "📤", eye: "👁️", download: "⬇️", filter: "🔽",
};

// ─── HELPERS ─────────────────────────────────────────────────────
const fmtMMK = (n) => new Intl.NumberFormat("en-US").format(n) + " MMK";
const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—";
const fmtDateInput = (d) => (d ? new Date(d).toISOString().split("T")[0] : "");
const today = () => new Date().toISOString().split("T")[0];
const monthKey = (d) => {
  const dt = new Date(d);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
};
const currentMonthKey = () => monthKey(new Date());
const isExamPast = (examDate) => !!examDate && currentMonthKey() > examDate.slice(0, 7);
const addOneMonth = (dateStr) => {
  const [year, month, day] = dateStr.split("-").map(Number);
  const nm = month === 12 ? 1 : month + 1;
  const ny = month === 12 ? year + 1 : year;
  const lastDay = new Date(ny, nm, 0).getDate();
  return `${ny}-${String(nm).padStart(2, "0")}-${String(Math.min(day, lastDay)).padStart(2, "0")}`;
};
// Add `n` calendar months to a date, clamping to the last valid day if needed — mirrors server/controllers/invoiceController.js
// so periods generated here line up exactly with the periodStart values stored on invoices/payment history.
const addMonths = (dateStr, n) => {
  const [year, month, day] = dateStr.split("-").map(Number);
  const total = year * 12 + (month - 1) + n;
  const newYear = Math.floor(total / 12);
  const newMonth = (total % 12) + 1;
  const lastDay = new Date(newYear, newMonth, 0).getDate();
  return `${newYear}-${String(newMonth).padStart(2, "0")}-${String(Math.min(day, lastDay)).padStart(2, "0")}`;
};
// Chip label shows the actual billing day (each student's period starts on a different day of
// the month) — e.g. "4 Jun '26" — rather than just the month, which would look identical across
// students despite different billing dates.
const chipDateLabel = (dateStr) => {
  const [y, m, d] = dateStr.split("-").map(Number);
  const monthShort = new Date(y, m - 1, 1).toLocaleDateString("en-GB", { month: "short" });
  return `${d} ${monthShort} '${String(y).slice(2)}`;
};
const EXAM_SESSION_MONTHS = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
  may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9,
  oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};
// Batches store an exam session as free text like "May/June 2027" or "Oct/Nov 2026" — billing
// should stop at the FIRST month named (May, Oct), not any specific exam date on the batch.
const examSessionCutoffMonth = (examSession) => {
  if (!examSession) return null;
  const yearMatch = examSession.match(/\d{4}/);
  if (!yearMatch) return null;
  const firstWord = examSession.split(/[\s/,-]+/)[0]?.toLowerCase();
  const monthNum = EXAM_SESSION_MONTHS[firstWord];
  if (!monthNum) return null;
  return `${yearMatch[0]}-${String(monthNum).padStart(2, "0")}`;
};
const fmtPeriod = (start, end) => {
  if (!start || !end) return "—";
  const fmt = (d) => new Date(d + "T12:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
  const endYear = new Date(end + "T12:00:00").getFullYear();
  return `${fmt(start)} – ${fmt(end)} ${endYear}`;
};
const isExamSoon = (examDate) => {
  if (!examDate) return false;
  const examMk = examDate.slice(0, 7);
  const nowMk = currentMonthKey();
  if (examMk < nowMk) return false;
  const diff = (new Date(examMk + "-01") - new Date(nowMk + "-01")) / (1000 * 60 * 60 * 24 * 30);
  return diff <= 2;
};

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
    border: `1px solid ${BRAND.border}`, borderLeft: `4px solid ${accent}`, minWidth: 180,
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
    display: "inline-block", padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600, color, background: bg,
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
};

// ─── SHARED COMPONENTS ───────────────────────────────────────────
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
    Active: [BRAND.green, BRAND.greenLight],
    Inactive: [BRAND.grey, BRAND.greyLight],
    Expelled: [BRAND.red, BRAND.redLight],
  };
  const [c, bg] = map[stage] || [BRAND.grey, BRAND.greyLight];
  return <span style={S.badge(c, bg)}>{stage}</span>;
}

const FEE_STATUS_STYLE = {
  paid: { color: BRAND.green, bg: BRAND.greenLight, border: BRAND.green, icon: "✓ ", label: "Paid" },
  unpaid: { color: BRAND.red, bg: BRAND.redLight, border: BRAND.red, icon: "", label: "Unpaid" },
  overdue: { color: BRAND.orange, bg: BRAND.orangeLight, border: BRAND.orange, icon: "⚠ ", label: "Overdue" },
  upcoming: { color: BRAND.grey, bg: BRAND.greyLight, border: BRAND.border, icon: "", label: "Upcoming" },
};

function FeeMonthChip({ period }) {
  const st = FEE_STATUS_STYLE[period.status];
  const tooltip = `${fmtPeriod(period.periodStart, period.periodEnd)} — ${st.label}${period.paidDate ? ` on ${fmtDate(period.paidDate)}` : ""}`;
  return (
    <span
      title={tooltip}
      style={{
        display: "inline-flex", alignItems: "center", padding: "5px 10px", borderRadius: 6,
        fontSize: 12, fontWeight: 600, color: st.color, background: st.bg,
        border: `1px solid ${st.border}`, opacity: period.status === "upcoming" ? 0.7 : 1,
      }}
    >
      {st.icon}{chipDateLabel(period.periodStart)}
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
const D = {
  tile: { background: BRAND.white, borderRadius: 12, border: `1px solid ${BRAND.border}`, padding: "18px 20px" },
  tileGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 14, marginBottom: 16 },
  tileNum: { fontSize: 24, fontWeight: 700, color: BRAND.charcoal, lineHeight: 1.2 },
  tileLabel: { fontSize: 12, color: BRAND.grey, marginTop: 4 },
  finCard: { background: BRAND.white, borderRadius: 12, border: `1px solid ${BRAND.border}`, padding: "24px 28px", marginBottom: 16 },
  finGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 24 },
  finLabel: { fontSize: 12, color: BRAND.grey, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.4px" },
  finNum: { fontSize: 26, fontWeight: 700 },
  finSub: { fontSize: 12, color: BRAND.grey, marginTop: 4 },
  panel: { background: BRAND.white, borderRadius: 12, border: `1px solid ${BRAND.border}`, padding: "20px 24px", flex: "1 1 340px" },
  panelTitle: { fontSize: 14, fontWeight: 700, marginBottom: 16, color: BRAND.charcoal },
  notice: (bg, color) => ({ padding: "10px 14px", background: bg, color, borderRadius: 8, marginBottom: 10, fontSize: 13 }),
};

function Dashboard({ data }) {
  const { students, teachers = [], dues = [], paymentHistory = [], leads, batches } = data;
  const activeStudents = students.filter((s) => s.status === "Active").length;
  const activeTeachers = teachers.filter((t) => t.status === "Active");
  const mrr = students
    .filter((s) => s.status === "Active")
    .reduce((sum, s) => {
      const batch = batches.find((b) => b.id === s.batchId);
      return sum + (s.customFee != null ? s.customFee : (batch ? batch.fee : 0));
    }, 0);
  const teacherSalaryCost = activeTeachers.reduce((sum, t) => sum + (t.monthlySalary || 0), 0);
  const commissionCost = Math.round(
    batches.reduce((sum, b) => {
      if (!b.commissionPercent) return sum;
      const batchRevenue = students
        .filter((s) => s.status === "Active" && s.batchId === b.id)
        .reduce((rev, s) => rev + (s.customFee != null ? s.customFee : b.fee), 0);
      const teacher = teachers.find((t) => t.id === b.teacherId);
      const profitAfterSalary = batchRevenue - (teacher ? teacher.monthlySalary || 0 : 0);
      return sum + Math.max(0, profitAfterSalary) * (b.commissionPercent / 100);
    }, 0)
  );
  const netProfit = mrr - teacherSalaryCost - commissionCost;
  // Collected money comes from payment history; what is still owed comes from this month's
  // dues, which are worked out from the students rather than read off stored documents.
  const totalRevenue = paymentHistory.reduce((sum, ph) => sum + ph.amount, 0);
  const unpaidInvoices = dues.filter((d) => d.status !== "Paid").length;
  const totalLeads = leads.filter((l) => l.stage === "Lead" || l.stage === "Prospect").length;
  const thisMonth = currentMonthKey();
  const monthRevenue = paymentHistory
    .filter((ph) => monthKey(ph.paidDate) === thisMonth)
    .reduce((sum, ph) => sum + ph.amount, 0);
  const overdueInvoices = dues.filter((d) => d.status === "Overdue");
  const recentLeads = leads
    .filter((l) => l.stage === "Lead")
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 5);
  const strikStudents = students.filter((s) => s.strikes >= 2 && s.status === "Active");

  return (
    <div>
      <div style={S.pageTitle}>Dashboard</div>
      <div style={S.pageDesc}>Titan Learning Center — Overview</div>

      <div style={D.finCard}>
        <div style={D.finGrid}>
          <div>
            <div style={D.finLabel}>Recurring Revenue</div>
            <div style={{ ...D.finNum, color: BRAND.charcoal }}>{fmtMMK(mrr)}</div>
            <div style={D.finSub}>Collected this month: {fmtMMK(monthRevenue)}</div>
          </div>
          <div>
            <div style={D.finLabel}>Teacher Salaries</div>
            <div style={{ ...D.finNum, color: BRAND.charcoal }}>{fmtMMK(teacherSalaryCost)}</div>
            <div style={D.finSub}>{activeTeachers.length} active teacher{activeTeachers.length !== 1 ? "s" : ""}</div>
          </div>
          <div>
            <div style={D.finLabel}>Teacher Commission</div>
            <div style={{ ...D.finNum, color: BRAND.charcoal }}>{fmtMMK(commissionCost)}</div>
            <div style={D.finSub}>% of batch profit after salary</div>
          </div>
          <div>
            <div style={D.finLabel}>Net Profit</div>
            <div style={{ ...D.finNum, color: netProfit >= 0 ? BRAND.green : BRAND.red }}>{fmtMMK(netProfit)}</div>
            <div style={D.finSub}>Revenue minus salaries & commission</div>
          </div>
        </div>
      </div>

      <div style={D.tileGrid}>
        <div style={D.tile}>
          <div style={D.tileNum}>{activeStudents}</div>
          <div style={D.tileLabel}>Active Students</div>
        </div>
        <div style={D.tile}>
          <div style={D.tileNum}>{activeTeachers.length}</div>
          <div style={D.tileLabel}>Active Teachers</div>
        </div>
        <div style={D.tile}>
          <div style={D.tileNum}>{unpaidInvoices}</div>
          <div style={D.tileLabel}>Unpaid This Month</div>
        </div>
        <div style={D.tile}>
          <div style={D.tileNum}>{totalLeads}</div>
          <div style={D.tileLabel}>Active Leads</div>
        </div>
        <div style={D.tile}>
          <div style={D.tileNum}>{fmtMMK(totalRevenue)}</div>
          <div style={D.tileLabel}>Lifetime Revenue</div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        <div style={D.panel}>
          <div style={D.panelTitle}>Batch Capacity</div>
          {batches.map((b) => {
            const enrolled = students.filter((s) => s.batchId === b.id && s.status === "Active").length;
            const pct = Math.round((enrolled / b.maxStudents) * 100);
            return (
              <div key={b.id} style={{ marginBottom: 14 }}>
                <div style={{ ...S.flexBetween, marginBottom: 4 }}>
                  <div>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{b.name}</span>
                    {b.examSession && (
                      <span style={{ marginLeft: 8, fontSize: 10, color: isExamPast(b.examDate) ? BRAND.grey : BRAND.gold }}>
                        {isExamPast(b.examDate) ? "✓" : "🎯"} {b.examSession}
                      </span>
                    )}
                  </div>
                  <span style={{ fontSize: 12, color: BRAND.grey }}>{enrolled}/{b.maxStudents}</span>
                </div>
                <div style={{ height: 6, borderRadius: 4, background: BRAND.greyLight, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${pct}%`, background: pct >= 90 ? BRAND.red : pct >= 70 ? BRAND.gold : BRAND.green, borderRadius: 4, transition: "width 0.5s" }} />
                </div>
              </div>
            );
          })}
        </div>

        <div style={D.panel}>
          <div style={D.panelTitle}>Attention Needed</div>
          {overdueInvoices.length > 0 && (
            <div style={D.notice(BRAND.orangeLight, BRAND.orange)}>
              <strong>{overdueInvoices.length}</strong> overdue fee{overdueInvoices.length > 1 ? "s" : ""} pending collection
            </div>
          )}
          {strikStudents.length > 0 && (
            <div style={D.notice(BRAND.redLight, BRAND.red)}>
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


// ─── TEACHERS ────────────────────────────────────────────────────
function TeachersPage({ teachers, onSaveTeacher, onDeleteTeacher }) {
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState(null);

  const filtered = teachers.filter((t) => {
    if (search && !t.name.toLowerCase().includes(search.toLowerCase()) && !t.subject.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const activeSalaryCost = teachers.filter((t) => t.status === "Active").reduce((sum, t) => sum + (t.monthlySalary || 0), 0);

  async function saveTeacher(teacher) {
    try {
      await onSaveTeacher(teacher);
      setShowAdd(false);
      setEditing(null);
    } catch (err) {
      alert(err.message);
    }
  }

  async function deleteTeacher(id) {
    if (!confirm("Remove this teacher?")) return;
    try {
      await onDeleteTeacher(id);
    } catch (err) {
      alert(err.message);
    }
  }

  return (
    <div>
      <div style={S.pageTitle}>Teachers</div>
      <div style={S.pageDesc}>Manage teaching staff and monthly salaries</div>

      <div style={S.statsRow}>
        <div style={S.statCard(BRAND.crimson)}>
          <div style={S.statNum}>{teachers.filter((t) => t.status === "Active").length}</div>
          <div style={S.statLabel}>Active Teachers</div>
        </div>
        <div style={S.statCard(BRAND.gold)}>
          <div style={S.statNum}>{fmtMMK(activeSalaryCost)}</div>
          <div style={S.statLabel}>Monthly Salary Cost</div>
        </div>
      </div>

      <div style={S.toolbar}>
        <div style={S.searchBox}>
          <span style={S.searchIcon}>{ICONS.search}</span>
          <input style={S.searchInput} placeholder="Search teachers..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <button style={S.btn("primary")} onClick={() => setShowAdd(true)}>{ICONS.add} Add Teacher</button>
      </div>

      <div style={S.card}>
        {filtered.length === 0 ? (
          <EmptyState icon="👩‍🏫" message="No teachers found" action={<button style={S.btn("primary")} onClick={() => setShowAdd(true)}>Add First Teacher</button>} />
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={S.table}>
              <thead>
                <tr>
                  <th style={S.th}>Name</th>
                  <th style={S.th}>Subject</th>
                  <th style={S.th}>Contact</th>
                  <th style={S.th}>Monthly Salary</th>
                  <th style={S.th}>Status</th>
                  <th style={S.th}>Joined</th>
                  <th style={S.th}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((t) => (
                  <tr key={t.id} onMouseEnter={(e) => e.currentTarget.style.background = BRAND.cream} onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>
                    <td style={S.td}><div style={{ fontWeight: 600 }}>{t.name}</div></td>
                    <td style={S.td}>{t.subject}</td>
                    <td style={S.td}>
                      <div style={{ fontSize: 12 }}>{t.phone}</div>
                      <div style={{ fontSize: 11, color: BRAND.grey }}>{t.email}</div>
                    </td>
                    <td style={S.td}><strong>{fmtMMK(t.monthlySalary || 0)}</strong></td>
                    <td style={S.td}><Badge stage={t.status} /></td>
                    <td style={S.td}>{fmtDate(t.joinDate)}</td>
                    <td style={S.td}>
                      <div style={{ display: "flex", gap: 4 }}>
                        <button style={S.btn("small")} onClick={() => setEditing(t)}>Edit</button>
                        <button style={S.btn("small")} onClick={() => deleteTeacher(t.id)}>🗑️</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {(showAdd || editing) && (
        <TeacherForm teacher={editing} onSave={saveTeacher} onClose={() => { setShowAdd(false); setEditing(null); }} />
      )}
    </div>
  );
}

function TeacherForm({ teacher, onSave, onClose }) {
  const [form, setForm] = useState(
    teacher || {
      name: "", email: "", phone: "", subject: "Computer Science",
      monthlySalary: 0, status: "Active", joinDate: today(), notes: "",
    }
  );
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  return (
    <Modal title={teacher ? "Edit Teacher" : "Add Teacher"} onClose={onClose}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div style={S.formGroup}><label style={S.formLabel}>Full Name *</label><input style={S.input} value={form.name} onChange={(e) => set("name", e.target.value)} /></div>
        <div style={S.formGroup}>
          <label style={S.formLabel}>Subject</label>
          <select style={S.select} value={form.subject} onChange={(e) => set("subject", e.target.value)}>
            {SUBJECTS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div style={S.formGroup}><label style={S.formLabel}>Email</label><input style={S.input} value={form.email} onChange={(e) => set("email", e.target.value)} /></div>
        <div style={S.formGroup}><label style={S.formLabel}>Phone</label><input style={S.input} value={form.phone} onChange={(e) => set("phone", e.target.value)} /></div>
        <div style={S.formGroup}><label style={S.formLabel}>Monthly Salary (MMK)</label><input style={S.input} type="number" value={form.monthlySalary} onChange={(e) => set("monthlySalary", parseInt(e.target.value) || 0)} /></div>
        <div style={S.formGroup}>
          <label style={S.formLabel}>Status</label>
          <select style={S.select} value={form.status} onChange={(e) => set("status", e.target.value)}>
            <option value="Active">Active</option><option value="Inactive">Inactive</option>
          </select>
        </div>
        <div style={S.formGroup}><label style={S.formLabel}>Join Date</label><input style={S.input} type="date" value={fmtDateInput(form.joinDate)} onChange={(e) => set("joinDate", e.target.value)} /></div>
      </div>
      <div style={S.formGroup}><label style={S.formLabel}>Notes</label><textarea style={{ ...S.input, minHeight: 60 }} value={form.notes || ""} onChange={(e) => set("notes", e.target.value)} /></div>
      <div style={{ display: "flex", gap: 12, justifyContent: "flex-end", marginTop: 12 }}>
        <button style={S.btn("secondary")} onClick={onClose}>Cancel</button>
        <button style={S.btn("primary")} onClick={() => form.name ? onSave(form) : alert("Name is required")}>Save Teacher</button>
      </div>
    </Modal>
  );
}


// ─── INVOICES ────────────────────────────────────────────────────
// What a month costs and who has not paid it yet.
//
// Nothing is generated here. Every active student owes their fee for one month starting on
// their billing day, so any month — this one, last one, next March — can simply be asked
// for. That is what makes the totals a forecast rather than a record of whatever someone
// remembered to create, and it is why there is no "generate" button any more.
const thisMonth = () => new Date().toISOString().split("T")[0].slice(0, 7);

const shiftMonth = (mk, n) => {
  const [y, m] = mk.split("-").map(Number);
  const total = y * 12 + (m - 1) + n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
};

const monthLabel = (mk) =>
  new Date(mk + "-01T12:00:00").toLocaleDateString("en-GB", { month: "long", year: "numeric" });

const EMPTY_TOTALS = { expected: 0, collected: 0, outstanding: 0, studentsLeft: 0, overdue: 0 };

function InvoicesPage({ students, batches, settings, initialDues, initialTotals, onPaymentRecorded }) {
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterBatch, setFilterBatch] = useState("all");
  const [fromMonth, setFromMonth] = useState(thisMonth);
  const [toMonth, setToMonth] = useState(thisMonth);
  const [dues, setDues] = useState(() => initialDues || []);
  const [totals, setTotals] = useState(() => initialTotals || EMPTY_TOTALS);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [preview, setPreview] = useState(null);
  const [payTarget, setPayTarget] = useState(null);
  const [receipts, setReceipts] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [statusSort, setStatusSort] = useState(null); // null | "outstanding" | "paid"

  const singleMonth = fromMonth === toMonth;

  // The months on screen are the only thing fetched, so stepping to next March costs one
  // small request rather than carrying a year of rows around.
  useEffect(() => {
    let live = true;
    setLoading(true);
    setLoadError(null);
    api
      .getDues(fromMonth, toMonth)
      .then((res) => {
        if (!live) return;
        setDues(res.dues);
        setTotals(res.totals);
      })
      .catch((err) => live && setLoadError(err.message))
      .finally(() => live && setLoading(false));
    return () => { live = false; };
  }, [fromMonth, toMonth, reloadKey]);

  useEffect(() => setSelected(new Set()), [search, filterStatus, filterBatch, fromMonth, toMonth]);

  const studentsById = useMemo(
    () => Object.fromEntries(students.map((s) => [s.id, s])),
    [students]
  );

  function toggleStatusSort() {
    setStatusSort((prev) => (prev === null ? "outstanding" : prev === "outstanding" ? "paid" : null));
  }

  const STATUS_PRIORITY = { Overdue: 0, Unpaid: 1, Paid: 2 };

  const filtered = dues
    .filter((due) => {
      if (filterBatch !== "all" && due.batchId !== filterBatch) return false;
      if (filterStatus === "outstanding" && due.status === "Paid") return false;
      if (filterStatus !== "all" && filterStatus !== "outstanding" && due.status !== filterStatus) return false;
      if (search) {
        const q = search.toLowerCase();
        const student = studentsById[due.studentId];
        const contact = student?.invoiceContact || student?.parentName || "";
        return (
          due.studentName.toLowerCase().includes(q) ||
          (due.nameBurmese || "").toLowerCase().includes(q) ||
          contact.toLowerCase().includes(q) ||
          (due.invoiceNumber || "").toLowerCase().includes(q)
        );
      }
      return true;
    })
    .sort((a, b) => {
      if (statusSort) {
        const pa = STATUS_PRIORITY[a.status] ?? 3;
        const pb = STATUS_PRIORITY[b.status] ?? 3;
        const diff = statusSort === "outstanding" ? pa - pb : pb - pa;
        if (diff !== 0) return diff;
      }
      return a.dueDate.localeCompare(b.dueDate) || a.studentName.localeCompare(b.studentName);
    });

  // Totals follow the filter, so narrowing to one batch or to the unpaid rows answers
  // "how much is that worth" without arithmetic.
  const shown = {
    expected: filtered.reduce((sum, d) => sum + d.amount, 0),
    collected: filtered.filter((d) => d.status === "Paid").reduce((sum, d) => sum + d.amount, 0),
  };
  const isFiltered = search !== "" || filterStatus !== "all" || filterBatch !== "all";
  const view = isFiltered
    ? {
        expected: shown.expected,
        collected: shown.collected,
        outstanding: shown.expected - shown.collected,
        studentsLeft: new Set(filtered.filter((d) => d.status !== "Paid").map((d) => d.studentId)).size,
      }
    : totals;

  function toggleSelect(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  const selectable = filtered.filter((d) => d.status !== "Paid");
  const allSelected = selectable.length > 0 && selectable.every((d) => selected.has(d.id));

  function toggleSelectAll() {
    setSelected(allSelected ? new Set() : new Set(selectable.map((d) => d.id)));
  }

  // Settling runs through the slip modal — the KBZPay screenshot and the paid date from it
  // are both required before anything is recorded.
  function markPaid(due) {
    setPayTarget([due]);
  }

  function bulkMarkPaid() {
    const toMark = filtered.filter((d) => selected.has(d.id) && d.status !== "Paid");
    if (toMark.length === 0) return alert("No unpaid fees in the selection.");
    setPayTarget(toMark);
  }

  // One slip can settle several months or several students. They go one after another
  // rather than in parallel: each payment takes the next receipt number, and overlapping
  // requests would race for it.
  async function confirmPayment(payment) {
    const target = payTarget || [];
    const recorded = [];
    try {
      for (const due of target) {
        const { payment: saved } = await api.payDue({
          studentId: due.studentId,
          periodStart: due.periodStart,
          ...payment,
        });
        recorded.push(saved);
        if (onPaymentRecorded) onPaymentRecorded(saved);
      }
    } finally {
      if (recorded.length) {
        setSelected(new Set());
        setReloadKey((n) => n + 1);
      }
    }
    setPayTarget(null);
    // Same courtesy as registering a student: a receipt on the spot, drawn from the record
    // the server wrote rather than from what was typed into the form.
    if (recorded.length) setReceipts(recorded);
  }

  const rangeLabel = singleMonth
    ? monthLabel(fromMonth)
    : `${monthLabel(fromMonth)} – ${monthLabel(toMonth)}`;

  return (
    <div>
      <div style={S.pageTitle} className="page-title">Invoices</div>
      <div style={S.pageDesc}>
        Who still owes for {rangeLabel}
        {filterBatch !== "all" && ` · ${(batches || []).find((b) => b.id === filterBatch)?.name || ""}`}
        {" — the schedule follows each student's billing date, so nothing needs generating and any month can be looked at"}
      </div>

      <div style={S.statsRow}>
        <div style={S.statCard(BRAND.crimson)}>
          <div style={S.statNum}>{view.studentsLeft}</div>
          <div style={S.statLabel}>Students Left To Pay</div>
        </div>
        <div style={S.statCard(BRAND.orange)}>
          <div style={S.statNum}>{fmtMMK(view.outstanding)}</div>
          <div style={S.statLabel}>Still To Collect</div>
        </div>
        <div style={S.statCard(BRAND.green)}>
          <div style={S.statNum}>{fmtMMK(view.collected)}</div>
          <div style={S.statLabel}>Collected</div>
        </div>
        <div style={S.statCard(BRAND.gold)}>
          <div style={S.statNum}>{fmtMMK(view.expected)}</div>
          <div style={S.statLabel}>Expected In Total</div>
        </div>
      </div>

      <div style={S.toolbar} className="toolbar">
        <div style={S.searchBox}>
          <span style={S.searchIcon}>{ICONS.search}</span>
          <input style={S.searchInput} placeholder="Search students..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select style={{ ...S.select, width: "auto", minWidth: 140 }} value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
          <option value="all">All Status</option>
          <option value="outstanding">Left to pay</option>
          <option value="Unpaid">Unpaid</option>
          <option value="Overdue">Overdue</option>
          <option value="Paid">Paid</option>
        </select>
        <select style={{ ...S.select, width: "auto", minWidth: 160 }} value={filterBatch} onChange={(e) => setFilterBatch(e.target.value)}>
          <option value="all">All Batches</option>
          {(batches || []).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }} className="date-filter-row">
          <button
            style={{ ...S.btn("small"), padding: "6px 10px" }}
            onClick={() => { setFromMonth(shiftMonth(fromMonth, -1)); setToMonth(shiftMonth(toMonth, -1)); }}
            title="Previous month"
          >◀</button>
          <input
            style={{ ...S.input, width: 150, fontSize: 13 }}
            type="month"
            value={fromMonth}
            onChange={(e) => {
              const v = e.target.value || thisMonth();
              setFromMonth(v);
              if (v > toMonth) setToMonth(v);
            }}
            title="From month"
          />
          <span style={{ fontSize: 12, color: BRAND.grey }}>–</span>
          <input
            style={{ ...S.input, width: 150, fontSize: 13 }}
            type="month"
            value={toMonth}
            onChange={(e) => {
              const v = e.target.value || thisMonth();
              setToMonth(v);
              if (v < fromMonth) setFromMonth(v);
            }}
            title="To month — set it ahead to forecast"
          />
          <button
            style={{ ...S.btn("small"), padding: "6px 10px" }}
            onClick={() => { setFromMonth(shiftMonth(fromMonth, 1)); setToMonth(shiftMonth(toMonth, 1)); }}
            title="Next month"
          >▶</button>
          {(fromMonth !== thisMonth() || toMonth !== thisMonth()) && (
            <button
              style={S.btn("small")}
              onClick={() => { setFromMonth(thisMonth()); setToMonth(thisMonth()); }}
              title="Back to this month"
            >This month</button>
          )}
        </div>
      </div>

      {selected.size > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 16px", background: BRAND.blueLight, border: `1px solid ${BRAND.blue}22`, borderRadius: 8, marginBottom: 16, flexWrap: "wrap" }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: BRAND.blue }}>{selected.size} selected</span>
          <button style={S.btn("success")} onClick={bulkMarkPaid}>✅ Mark Paid</button>
          <button style={{ ...S.btn("secondary"), marginLeft: "auto" }} onClick={() => setSelected(new Set())}>Clear</button>
        </div>
      )}

      <div style={S.card} className="card">
        {loadError ? (
          <EmptyState icon="⚠️" message={loadError} action={<button style={S.btn("secondary")} onClick={() => setReloadKey((n) => n + 1)}>Try again</button>} />
        ) : loading && dues.length === 0 ? (
          <div style={{ fontSize: 13, color: BRAND.grey, padding: "24px 0", textAlign: "center" }}>Working out what is owed…</div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon="🧾"
            message={
              dues.length === 0
                ? `Nothing is billed for ${rangeLabel}. Active students are billed from their own billing date.`
                : "No fees match the current filter."
            }
          />
        ) : (
          <div style={{ overflowX: "auto", opacity: loading ? 0.6 : 1, transition: "opacity 0.15s" }}>
            <table style={S.table} className="data-table">
              <thead>
                <tr>
                  <th style={{ ...S.th, width: 36, paddingRight: 4 }}>
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleSelectAll}
                      style={{ cursor: "pointer", width: 15, height: 15 }}
                      title="Select everything still to pay"
                    />
                  </th>
                  <th style={S.th}>Student</th>
                  <th style={S.th}>Guardian fb contact</th>
                  <th style={S.th}>Batch</th>
                  <th style={S.th}>Period</th>
                  <th style={S.th}>Amount</th>
                  <th
                    style={{ ...S.th, cursor: "pointer", userSelect: "none" }}
                    onClick={toggleStatusSort}
                    title="Click to sort: outstanding first, then paid first"
                  >
                    Status {statusSort === "outstanding" ? "▲" : statusSort === "paid" ? "▼" : ""}
                  </th>
                  <th style={S.th}>Due Date</th>
                  <th style={S.th}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((due) => (
                  <tr
                    key={due.id}
                    style={{ background: selected.has(due.id) ? BRAND.blueLight : "transparent" }}
                    onMouseEnter={(e) => { if (!selected.has(due.id)) e.currentTarget.style.background = BRAND.cream; }}
                    onMouseLeave={(e) => { if (!selected.has(due.id)) e.currentTarget.style.background = "transparent"; }}
                  >
                    <td style={{ ...S.td, width: 36, paddingRight: 4 }}>
                      {due.status !== "Paid" && (
                        <input
                          type="checkbox"
                          checked={selected.has(due.id)}
                          onChange={() => toggleSelect(due.id)}
                          style={{ cursor: "pointer", width: 15, height: 15 }}
                        />
                      )}
                    </td>
                    <td style={S.td} data-label="Student">
                      <div style={{ fontWeight: 600 }}>{due.studentName}</div>
                      {due.nameBurmese && <div style={{ fontSize: 12, color: BRAND.grey }}>{due.nameBurmese}</div>}
                    </td>
                    <td style={S.td} data-label="Guardian fb contact">
                      {(() => {
                        const student = studentsById[due.studentId];
                        const contact = student?.invoiceContact || student?.parentName;
                        if (!contact) return <span style={{ color: BRAND.grey }}>—</span>;
                        return (
                          <div>
                            <div>{contact}</div>
                            {student.parentPhone && (
                              <div style={{ fontSize: 12, color: BRAND.grey }}>{student.parentPhone}</div>
                            )}
                          </div>
                        );
                      })()}
                    </td>
                    <td style={S.td} data-label="Batch"><span style={S.tag}>{due.batchName}</span></td>
                    <td style={{ ...S.td, whiteSpace: "nowrap", fontSize: 12 }} data-label="Period">
                      {fmtPeriod(due.periodStart, due.periodEnd)}
                    </td>
                    <td style={S.td} data-label="Amount">{fmtMMK(due.amount)}</td>
                    <td style={S.td} data-label="Status">
                      <Badge stage={due.status} />
                      {due.status === "Paid" && due.paidDate && (
                        <div style={{ fontSize: 11, color: BRAND.grey, marginTop: 2 }}>{fmtDate(due.paidDate)}</div>
                      )}
                    </td>
                    <td style={S.td} data-label="Due Date">{fmtDate(due.dueDate)}</td>
                    <td style={S.td} data-label="Actions">
                      <div style={{ display: "flex", gap: 4 }}>
                        <button style={S.btn("small")} onClick={() => setPreview(due)} title="Preview the bill">👁️</button>
                        {due.status !== "Paid" && (
                          <button style={S.btn("success")} onClick={() => markPaid(due)}>Mark Paid</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {receipts && receipts.length > 0 && (
        <Modal
          title={
            receipts.length === 1
              ? `Receipt — ${receipts[0].studentName}`
              : `Receipts — ${receipts.length} payments`
          }
          onClose={() => setReceipts(null)}
        >
          {receipts.map((ph, i) => (
            <div
              key={ph.id}
              style={
                i === 0
                  ? undefined
                  : { marginTop: 24, paddingTop: 24, borderTop: `1px solid ${BRAND.border}` }
              }
            >
              <ReceiptPreview payment={ph} />
            </div>
          ))}
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
            <button style={S.btn("secondary")} onClick={() => setReceipts(null)}>Done</button>
          </div>
        </Modal>
      )}

      {payTarget && (
        <MarkPaidModal
          charges={payTarget}
          onCancel={() => setPayTarget(null)}
          onConfirm={confirmPayment}
        />
      )}

      {preview && (
        <Modal title="Invoice Preview" onClose={() => setPreview(null)}>
          <InvoicePreview invoice={preview} settings={settings} />
        </Modal>
      )}
    </div>
  );
}

function InvoicePreview({ invoice, settings }) {
  const previewRef = useRef(null);
  const [saving, setSaving] = useState(false);

  async function saveAsImage() {
    if (!previewRef.current) return;
    setSaving(true);
    try {
      const canvas = await html2canvas(previewRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#FFFFFF",
        logging: false,
      });
      const link = document.createElement("a");
      link.download = `${invoice.invoiceNumber || `${invoice.studentName}-${invoice.monthKey}`}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    } catch (err) {
      alert("Could not save image: " + err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
    <div ref={previewRef} style={S.invoicePreview}>
      <div style={{ ...S.flexBetween, marginBottom: 24 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 700, color: BRAND.crimson }}>TITAN</div>
          <div style={{ fontSize: 11, color: BRAND.grey, letterSpacing: "2px", textTransform: "uppercase" }}>Learning Center</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: BRAND.charcoal }}>INVOICE</div>
          <div style={{ fontSize: 13, color: BRAND.grey, fontFamily: "monospace" }}>
            {invoice.invoiceNumber || `Due ${fmtDate(invoice.dueDate)}`}
          </div>
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
            {(invoice.periodStart || invoice.dueDate) && (
              <div style={{ marginBottom: 4 }}>
                <span style={{ color: BRAND.grey }}>Billing Period:</span>{" "}
                <strong>{fmtPeriod(
                  invoice.periodStart || invoice.dueDate,
                  invoice.periodEnd || addOneMonth(invoice.periodStart || invoice.dueDate)
                )}</strong>
              </div>
            )}
            <div><span style={{ color: BRAND.grey }}>Due Date:</span> {fmtDate(invoice.dueDate)}</div>
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
          {(invoice.items || []).map((item, i) => {
            // The stored period is now the prepay period, so the saved description is
            // already right — no need to rewrite it from the due date.
            const correctedDesc = item.desc;
            return (
            <tr key={i}>
              <td style={S.td}>{correctedDesc}</td>
              <td style={{ ...S.td, textAlign: "center" }}>{item.qty}</td>
              <td style={{ ...S.td, textAlign: "right" }}>{fmtMMK(item.rate)}</td>
              <td style={{ ...S.td, textAlign: "right", fontWeight: 600 }}>{fmtMMK(item.qty * item.rate)}</td>
            </tr>
            );
          })}
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

    <div style={{ textAlign: "center", marginTop: 16 }}>
      <button style={S.btn("primary")} onClick={saveAsImage} disabled={saving}>
        {saving ? "Saving…" : `${ICONS.download} Save as Image`}
      </button>
    </div>
    </div>
  );
}

// ─── RECEIPT PREVIEW ─────────────────────────────────────────────
function ReceiptPreview({ payment: ph }) {
  const receiptRef = useRef(null);
  const [saving, setSaving] = useState(false);

  // Use the invoice's due date (periodStart) as billing start — not the actual payment date
  const billingStart = ph.periodStart || ph.paidDate;
  const billingEnd = ph.periodEnd || addOneMonth(billingStart);

  async function saveAsImage() {
    if (!receiptRef.current) return;
    setSaving(true);
    try {
      const canvas = await html2canvas(receiptRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#FFFFFF",
        logging: false,
      });
      const link = document.createElement("a");
      link.download = `Receipt-${ph.invoiceNumber}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    } catch (err) {
      alert("Could not save image: " + err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div ref={receiptRef} style={S.invoicePreview}>
        {/* Header */}
        <div style={{ ...S.flexBetween, marginBottom: 24 }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 700, color: BRAND.crimson }}>TITAN</div>
            <div style={{ fontSize: 11, color: BRAND.grey, letterSpacing: "2px", textTransform: "uppercase" }}>Learning Center</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: BRAND.green }}>RECEIPT</div>
            <div style={{ fontSize: 13, color: BRAND.grey, fontFamily: "monospace" }}>{ph.invoiceNumber}</div>
          </div>
        </div>

        {/* Bill To + Dates */}
        <div style={{ borderTop: `2px solid ${BRAND.crimson}`, paddingTop: 16, marginBottom: 20 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, fontSize: 13 }}>
            <div>
              <div style={{ fontWeight: 600, marginBottom: 4, color: BRAND.grey, fontSize: 11, textTransform: "uppercase" }}>Received From</div>
              <div style={{ fontWeight: 600 }}>{ph.studentName}</div>
              {ph.nameBurmese && <div style={{ color: BRAND.charcoal }}>{ph.nameBurmese}</div>}
              {ph.studentEmail && <div style={{ color: BRAND.grey, fontSize: 12 }}>{ph.studentEmail}</div>}
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ marginBottom: 4 }}>
                <span style={{ color: BRAND.grey }}>Billing Period:</span>{" "}
                <strong>{fmtPeriod(billingStart, billingEnd)}</strong>
              </div>
              <div><span style={{ color: BRAND.grey }}>Paid Date:</span> {fmtDate(ph.paidDate)}</div>
              <div style={{ marginTop: 6 }}>
                <span style={{ ...S.badge(BRAND.green, BRAND.greenLight), fontSize: 12, padding: "3px 10px" }}>PAID</span>
              </div>
            </div>
          </div>
        </div>

        {/* Item row */}
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
            <tr>
              <td style={S.td}>{ph.batchName} · {fmtPeriod(billingStart, billingEnd)}</td>
              <td style={{ ...S.td, textAlign: "center" }}>1</td>
              <td style={{ ...S.td, textAlign: "right" }}>{fmtMMK(ph.amount)}</td>
              <td style={{ ...S.td, textAlign: "right", fontWeight: 600 }}>{fmtMMK(ph.amount)}</td>
            </tr>
          </tbody>
        </table>

        {/* Total */}
        <div style={{ borderTop: `2px solid ${BRAND.crimson}`, paddingTop: 12, textAlign: "right" }}>
          <div style={{ fontSize: 13, color: BRAND.grey, marginBottom: 4 }}>Amount Paid</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: BRAND.green }}>{fmtMMK(ph.amount)}</div>
        </div>

        {/* Footer */}
        <div style={{ marginTop: 24, padding: "12px 16px", background: BRAND.cream, borderRadius: 6, fontSize: 12, color: BRAND.grey }}>
          <strong style={{ color: BRAND.charcoal }}>Titan Learning Center</strong> — Understanding over Memorization. Be Curious.
        </div>
      </div>

      <div style={{ textAlign: "center", marginTop: 16 }}>
        <button style={S.btn("primary")} onClick={saveAsImage} disabled={saving}>
          {saving ? "Saving…" : `${ICONS.download} Save as Image`}
        </button>
      </div>
    </div>
  );
}

// ─── PAYMENT HISTORY ─────────────────────────────────────────────
function PaymentHistoryPage({ paymentHistory, batches, onDelete, onUpdate }) {
  const [search, setSearch] = useState("");
  const [filterBatch, setFilterBatch] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [receipt, setReceipt] = useState(null);
  const [slipFor, setSlipFor] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editDate, setEditDate] = useState("");
  const [savingDate, setSavingDate] = useState(false);

  function startEditDate(ph) {
    setEditingId(ph.id);
    setEditDate(fmtDateInput(ph.paidDate));
  }

  async function saveEditDate(id) {
    if (!editDate) return;
    setSavingDate(true);
    try {
      await onUpdate(id, { paidDate: editDate });
      setEditingId(null);
    } catch (err) {
      alert(err.message);
    } finally {
      setSavingDate(false);
    }
  }

  const filtered = paymentHistory.filter((ph) => {
    if (filterBatch !== "all" && ph.batchId !== filterBatch) return false;
    if (dateFrom && ph.paidDate < dateFrom) return false;
    if (dateTo && ph.paidDate > dateTo) return false;
    if (search) {
      const s = search.toLowerCase();
      return (
        ph.studentName.toLowerCase().includes(s) ||
        (ph.nameBurmese && ph.nameBurmese.toLowerCase().includes(s)) ||
        ph.invoiceNumber.toLowerCase().includes(s)
      );
    }
    return true;
  });

  const totalCollected = filtered.reduce((sum, ph) => sum + ph.amount, 0);
  const hasDateFilter = dateFrom || dateTo;

  return (
    <div>
      <div style={S.pageTitle}>Payment History</div>
      <div style={S.pageDesc}>Record of every received payment — invoices removed after payment</div>

      <div style={S.statsRow}>
        <div style={S.statCard(BRAND.green)}>
          <div style={S.statNum}>{filtered.length}</div>
          <div style={S.statLabel}>Payments Shown</div>
        </div>
        <div style={S.statCard(BRAND.crimson)}>
          <div style={S.statNum}>{fmtMMK(totalCollected)}</div>
          <div style={S.statLabel}>Total Collected</div>
        </div>
      </div>

      <div style={S.toolbar}>
        <div style={S.searchBox}>
          <span style={S.searchIcon}>{ICONS.search}</span>
          <input style={S.searchInput} placeholder="Search by student name or invoice #..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select style={{ ...S.select, width: "auto", minWidth: 160 }} value={filterBatch} onChange={(e) => setFilterBatch(e.target.value)}>
          <option value="all">All Batches</option>
          {batches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 12, color: BRAND.grey, whiteSpace: "nowrap" }}>Paid:</span>
          <input style={{ ...S.input, width: 140, fontSize: 13 }} type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} title="From" />
          <span style={{ fontSize: 12, color: BRAND.grey }}>–</span>
          <input style={{ ...S.input, width: 140, fontSize: 13 }} type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} title="To" />
          {hasDateFilter && (
            <button style={{ ...S.btn("small"), color: BRAND.red, padding: "4px 8px" }} onClick={() => { setDateFrom(""); setDateTo(""); }} title="Clear">✕</button>
          )}
        </div>
      </div>

      <div style={S.card}>
        {filtered.length === 0 ? (
          <EmptyState icon="💳" message="No payment records yet. Payments appear here when invoices are marked as paid." />
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={S.table}>
              <thead>
                <tr>
                  <th style={S.th}>Student</th>
                  <th style={S.th}>Batch</th>
                  <th style={S.th}>Invoice #</th>
                  <th style={S.th}>Period</th>
                  <th style={S.th}>Amount</th>
                  <th style={S.th}>Paid Date</th>
                  <th style={S.th}>Payment #</th>
                  <th style={S.th}></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((ph) => (
                  <tr key={ph.id} onMouseEnter={(e) => e.currentTarget.style.background = BRAND.cream} onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>
                    <td style={S.td}>
                      <div style={{ fontWeight: 600 }}>{ph.studentName}</div>
                      {ph.nameBurmese && <div style={{ fontSize: 12, color: BRAND.charcoal }}>{ph.nameBurmese}</div>}
                      <div style={{ fontSize: 11, color: BRAND.grey }}>{ph.studentEmail}</div>
                    </td>
                    <td style={S.td}><span style={S.tag}>{ph.batchName}</span></td>
                    <td style={{ ...S.td, fontFamily: "monospace", fontSize: 12 }}>{ph.invoiceNumber}</td>
                    <td style={{ ...S.td, fontSize: 12, whiteSpace: "nowrap" }}>
                      {ph.periodStart ? fmtPeriod(ph.periodStart, ph.periodEnd) : "—"}
                    </td>
                    <td style={{ ...S.td, fontWeight: 700, color: BRAND.green }}>{fmtMMK(ph.amount)}</td>
                    <td style={S.td}>
                      {editingId === ph.id ? (
                        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                          <input
                            type="date"
                            value={editDate}
                            onChange={(e) => setEditDate(e.target.value)}
                            style={{ ...S.input, width: 140, padding: "4px 8px" }}
                          />
                          <button
                            style={S.btn("small")}
                            onClick={() => saveEditDate(ph.id)}
                            disabled={savingDate}
                            title="Save"
                          >{savingDate ? "…" : "✓"}</button>
                          <button
                            style={S.btn("small")}
                            onClick={() => setEditingId(null)}
                            disabled={savingDate}
                            title="Cancel"
                          >✕</button>
                        </div>
                      ) : (
                        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                          {fmtDate(ph.paidDate)}
                          <button
                            style={{ ...S.btn("small"), padding: "2px 4px" }}
                            onClick={() => startEditDate(ph)}
                            title="Edit paid date"
                          >✏️</button>
                        </div>
                      )}
                    </td>
                    <td style={S.td}>
                      <span style={S.badge(BRAND.crimson, BRAND.redLight)}>{ph.kind === "registration" ? "Registration" : "#" + ph.paymentCount}</span>
                    </td>
                    <td style={S.td}>
                      <div style={{ display: "flex", gap: 4 }}>
                        <button style={S.btn("small")} onClick={() => setReceipt(ph)} title="Generate Receipt">🧾 Receipt</button>
                        {ph.slip && ph.slip.attachedAt && (
                          <button style={S.btn("small")} onClick={() => setSlipFor(ph)} title="View the KBZPay slip for this payment">📎 Slip</button>
                        )}
                        <button
                          style={{ ...S.btn("small"), color: BRAND.red }}
                          onClick={() => {
                            if (confirm(`Delete payment record for ${ph.studentName}? This also removes the next auto-generated invoice.`)) {
                              onDelete(ph.id).catch((err) => alert(err.message));
                            }
                          }}
                          title="Delete payment record"
                        >🗑️</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {receipt && (
        <Modal title="Payment Receipt" onClose={() => setReceipt(null)}>
          <ReceiptPreview payment={receipt} />
        </Modal>
      )}

      {slipFor && (
        <SlipViewer payment={slipFor} loadSlip={api.getPaymentSlip} onClose={() => setSlipFor(null)} />
      )}
    </div>
  );
}

// ─── TRANSACTIONS ────────────────────────────────────────────────
// The KBZPay slips filed against payments, by student. One card per student who has paid;
// pressing a card opens that student's slips, newest first, and pressing a slip opens it
// full size. Owner-only — the other roles record payments but do not review the evidence.
//
// Slip images are not part of the payment-history list (they are ~100 KB each), so a
// student's images are fetched when their card is opened and kept for the rest of the visit.
const hasSlip = (ph) => !!(ph.slip && ph.slip.attachedAt);

function StudentSlips({ group, slipCache, onBack }) {
  // Mirrors the cache so a fetch landing re-renders; the cache itself survives going back.
  const [, bump] = useState(0);
  const [viewing, setViewing] = useState(null);
  const [failed, setFailed] = useState({});

  useEffect(() => {
    let live = true;
    for (const ph of group.payments) {
      if (!hasSlip(ph) || slipCache.has(ph.id)) continue;
      slipCache.set(ph.id, null); // claim it, so a re-open does not refetch mid-flight
      api
        .getPaymentSlip(ph.id)
        .then((slip) => {
          slipCache.set(ph.id, slip);
          if (live) bump((n) => n + 1);
        })
        .catch((err) => {
          slipCache.delete(ph.id);
          if (live) setFailed((prev) => ({ ...prev, [ph.id]: err.message }));
        });
    }
    return () => { live = false; };
  }, [group.studentId, group.payments, slipCache]);

  return (
    <div>
      <button style={{ ...S.btn("secondary"), marginBottom: 16 }} onClick={onBack}>← All students</button>

      <div style={S.pageTitle}>{group.name}</div>
      <div style={S.pageDesc}>
        {group.nameBurmese ? `${group.nameBurmese} · ` : ""}
        {group.batchName} · {group.payments.length} payment{group.payments.length !== 1 ? "s" : ""} · {fmtMMK(group.total)} collected
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 20, alignItems: "start" }}>
        {group.payments.map((ph) => {
          const slip = slipCache.get(ph.id);
          const error = failed[ph.id];
          const missing = !hasSlip(ph);

          return (
            <div
              key={ph.id}
              style={{
                ...S.card,
                marginBottom: 0,
                padding: 0,
                overflow: "hidden",
                cursor: slip ? "pointer" : "default",
                transition: "box-shadow 0.15s, border-color 0.15s",
              }}
              onClick={() => slip && setViewing(ph)}
              title={slip ? "Open this slip" : undefined}
              onMouseEnter={(e) => {
                if (!slip) return;
                e.currentTarget.style.borderColor = BRAND.gold;
                e.currentTarget.style.boxShadow = "0 2px 12px rgba(0,0,0,0.08)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = BRAND.border;
                e.currentTarget.style.boxShadow = "none";
              }}
            >
              <div
                style={{
                  height: 190, background: BRAND.greyLight, display: "flex", alignItems: "center",
                  justifyContent: "center", overflow: "hidden", borderBottom: `1px solid ${BRAND.border}`,
                }}
              >
                {slip ? (
                  <img
                    src={slip.image}
                    alt={`KBZPay slip for ${ph.invoiceNumber}`}
                    style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "top" }}
                  />
                ) : (
                  <div style={{ textAlign: "center", fontSize: 12, color: BRAND.grey, padding: 16 }}>
                    {missing ? "🚫 No slip on file" : error ? `⚠️ ${error}` : "Loading slip…"}
                  </div>
                )}
              </div>

              <div style={{ padding: "12px 16px 14px" }}>
                <div style={{ fontWeight: 700, fontSize: 15, color: BRAND.green }}>{fmtMMK(ph.amount)}</div>
                <div style={{ fontSize: 12, color: BRAND.grey, marginTop: 2 }}>Paid {fmtDate(ph.paidDate)}</div>
                <div style={{ ...S.flexBetween, marginTop: 8, gap: 8 }}>
                  <span style={{ fontFamily: "monospace", fontSize: 11 }}>{ph.invoiceNumber}</span>
                  <span style={S.badge(BRAND.crimson, BRAND.redLight)}>{ph.kind === "registration" ? "Registration" : "#" + ph.paymentCount}</span>
                </div>
                {ph.periodStart && (
                  <div style={{ fontSize: 11, color: BRAND.grey, marginTop: 6 }}>
                    {fmtPeriod(ph.periodStart, ph.periodEnd)}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {viewing && (
        <SlipViewer
          payment={viewing}
          slip={slipCache.get(viewing.id)}
          onClose={() => setViewing(null)}
        />
      )}
    </div>
  );
}

function TransactionsPage({ paymentHistory, students, batches }) {
  const [search, setSearch] = useState("");
  const [filterBatch, setFilterBatch] = useState("all");
  const [openStudentId, setOpenStudentId] = useState(null);
  // Fetched slip images, kept across card open/close for the life of the tab.
  const slipCache = useRef(new Map()).current;

  const studentsById = useMemo(
    () => Object.fromEntries(students.map((s) => [s.id, s])),
    [students]
  );

  const groups = useMemo(() => {
    const byStudent = new Map();
    for (const ph of paymentHistory) {
      if (!byStudent.has(ph.studentId)) byStudent.set(ph.studentId, []);
      byStudent.get(ph.studentId).push(ph);
    }
    return [...byStudent.entries()]
      .map(([studentId, payments]) => {
        const sorted = payments
          .slice()
          .sort((a, b) => (b.paidDate || "").localeCompare(a.paidDate || ""));
        const student = studentsById[studentId];
        const latest = sorted[0];
        return {
          studentId,
          name: latest.studentName,
          nameBurmese: latest.nameBurmese || (student ? student.nameBurmese : "") || "",
          batchId: latest.batchId,
          batchName: latest.batchName || "—",
          payments: sorted,
          slipCount: sorted.filter(hasSlip).length,
          total: sorted.reduce((sum, p) => sum + p.amount, 0),
          lastPaid: latest.paidDate,
        };
      })
      .sort((a, b) => (b.lastPaid || "").localeCompare(a.lastPaid || ""));
  }, [paymentHistory, studentsById]);

  const filtered = groups.filter((g) => {
    if (filterBatch !== "all" && g.batchId !== filterBatch) return false;
    if (!search) return true;
    const s = search.toLowerCase();
    return g.name.toLowerCase().includes(s) || g.nameBurmese.toLowerCase().includes(s);
  });

  const open = openStudentId ? groups.find((g) => g.studentId === openStudentId) : null;
  if (open) {
    return <StudentSlips group={open} slipCache={slipCache} onBack={() => setOpenStudentId(null)} />;
  }

  const totalSlips = groups.reduce((sum, g) => sum + g.slipCount, 0);

  return (
    <div>
      <div style={S.pageTitle}>Transactions</div>
      <div style={S.pageDesc}>KBZPay slips filed against payments — pick a student to see theirs</div>

      <div style={S.statsRow}>
        <div style={S.statCard(BRAND.crimson)}>
          <div style={S.statNum}>{filtered.length}</div>
          <div style={S.statLabel}>Students Shown</div>
        </div>
        <div style={S.statCard(BRAND.green)}>
          <div style={S.statNum}>{totalSlips}</div>
          <div style={S.statLabel}>Slips On File</div>
        </div>
      </div>

      <div style={S.toolbar}>
        <div style={S.searchBox}>
          <span style={S.searchIcon}>{ICONS.search}</span>
          <input
            style={S.searchInput}
            placeholder="Search by student name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          style={{ ...S.select, width: "auto", minWidth: 160 }}
          value={filterBatch}
          onChange={(e) => setFilterBatch(e.target.value)}
        >
          <option value="all">All Batches</option>
          {batches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      </div>

      {filtered.length === 0 ? (
        <div style={S.card}>
          <EmptyState
            icon="📸"
            message={
              groups.length === 0
                ? "No payments recorded yet. Slips appear here once invoices are marked paid."
                : "No students match that search."
            }
          />
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 20 }}>
          {filtered.map((g) => (
            <div
              key={g.studentId}
              onClick={() => setOpenStudentId(g.studentId)}
              title="Open this student's slips"
              style={{ ...S.card, marginBottom: 0, cursor: "pointer", transition: "box-shadow 0.15s, border-color 0.15s" }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = BRAND.gold;
                e.currentTarget.style.boxShadow = "0 2px 12px rgba(0,0,0,0.08)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = BRAND.border;
                e.currentTarget.style.boxShadow = "none";
              }}
            >
              <div style={{ fontWeight: 700, fontSize: 16 }}>{g.name}</div>
              {g.nameBurmese && <div style={{ fontSize: 13 }}>{g.nameBurmese}</div>}
              <div style={{ fontSize: 12, color: BRAND.grey, marginTop: 2 }}>{g.batchName}</div>

              <div style={{ ...S.flexBetween, marginTop: 14, gap: 8 }}>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: BRAND.green }}>{fmtMMK(g.total)}</div>
                  <div style={{ fontSize: 11, color: BRAND.grey }}>Last paid {fmtDate(g.lastPaid)}</div>
                </div>
                <span style={S.badge(BRAND.crimson, BRAND.redLight)}>
                  📸 {g.slipCount}/{g.payments.length}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── FEE TRACKER ─────────────────────────────────────────────────
// For each student, builds the sequence of one-month billing periods running from their
// billing anchor (billingStartDate, falling back to enrolledDate) up to their batch's exam
// month (or the current month, if the batch has no exam date set yet).
function buildFeePeriods(student, batch, paymentHistory) {
  const anchor = student.billingStartDate || student.enrolledDate;
  if (!anchor) return [];

  const examCutoffMk =
    (batch && examSessionCutoffMonth(batch.examSession)) ||
    (batch && batch.examDate ? batch.examDate.slice(0, 7) : null);
  const nowMk = currentMonthKey();
  const todayStr = today();

  const paidByStart = new Map();
  for (const ph of paymentHistory) {
    if (ph.studentId === student.id && ph.periodStart) paidByStart.set(ph.periodStart, ph);
  }
  const periods = [];
  for (let idx = 0; idx < 240; idx++) {
    const periodStart = addMonths(anchor, idx);
    const mk = periodStart.slice(0, 7);
    if (examCutoffMk ? mk > examCutoffMk : mk > nowMk) break;
    const periodEnd = addMonths(anchor, idx + 1);

    const ph = paidByStart.get(periodStart);
    let status, paidDate;
    if (ph) {
      status = "paid";
      paidDate = ph.paidDate;
    } else if (periodStart > todayStr) {
      status = "upcoming";
    } else {
      status = "unpaid";
    }
    periods.push({ periodStart, periodEnd, monthKey: mk, status, paidDate });
  }
  return periods;
}

function FeeTrackerPage({ students, batches, paymentHistory }) {
  const [search, setSearch] = useState("");
  const [filterBatch, setFilterBatch] = useState("all");
  const [filterStatus, setFilterStatus] = useState("Active");

  const filtered = students.filter((s) => {
    if (filterBatch !== "all" && s.batchId !== filterBatch) return false;
    if (filterStatus !== "all" && s.status !== filterStatus) return false;
    if (search && !s.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const rows = filtered.map((s) => {
    const batch = batches.find((b) => b.id === s.batchId);
    const periods = buildFeePeriods(s, batch, paymentHistory);
    const behind = periods.some((p) => p.status === "unpaid" || p.status === "overdue");
    return { student: s, batch, periods, behind };
  });

  const behindCount = rows.filter((r) => r.behind).length;

  return (
    <div>
      <div style={S.pageTitle}>Fee Tracker</div>
      <div style={S.pageDesc}>Monthly billing calendar per student — green months are paid, from billing start through their exam month</div>

      <div style={S.statsRow}>
        <div style={S.statCard(BRAND.crimson)}>
          <div style={S.statNum}>{rows.length}</div>
          <div style={S.statLabel}>Students Tracked</div>
        </div>
        <div style={S.statCard(behindCount > 0 ? BRAND.red : BRAND.green)}>
          <div style={S.statNum}>{behindCount}</div>
          <div style={S.statLabel}>Behind on Payments</div>
        </div>
      </div>

      <div style={S.toolbar}>
        <div style={S.searchBox}>
          <span style={S.searchIcon}>{ICONS.search}</span>
          <input style={S.searchInput} placeholder="Search students..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select style={{ ...S.select, width: "auto", minWidth: 160 }} value={filterBatch} onChange={(e) => setFilterBatch(e.target.value)}>
          <option value="all">All Batches</option>
          {batches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <select style={{ ...S.select, width: "auto", minWidth: 120 }} value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
          <option value="all">All Status</option>
          <option value="Active">Active</option>
          <option value="Inactive">Inactive</option>
          <option value="Expelled">Expelled</option>
        </select>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginLeft: "auto", fontSize: 12, color: BRAND.grey }}>
          {Object.entries(FEE_STATUS_STYLE).map(([key, st]) => (
            <span key={key} style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: st.bg, border: `1px solid ${st.border}`, display: "inline-block" }} />
              {st.label}
            </span>
          ))}
        </div>
      </div>

      <div style={S.card}>
        {rows.length === 0 ? (
          <EmptyState icon="🗓️" message="No students match this filter" />
        ) : (
          <div>
            {rows.map(({ student: s, batch, periods }, idx) => (
              <div key={s.id} style={{ padding: "16px 4px", borderBottom: idx < rows.length - 1 ? `1px solid ${BRAND.border}` : "none" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>
                      {s.name}
                      {s.nameBurmese && <span style={{ fontWeight: 400, color: BRAND.grey, fontSize: 12, marginLeft: 8 }}>{s.nameBurmese}</span>}
                    </div>
                    <div style={{ fontSize: 12, color: BRAND.grey, marginTop: 3, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                      <span style={S.tag}>{batch ? batch.name : "No batch"}</span>
                      {batch?.examSession && <span>🎯 {batch.examSession}</span>}
                    </div>
                  </div>
                  <Badge stage={s.status} />
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {periods.length === 0 ? (
                    <span style={{ fontSize: 12, color: BRAND.grey }}>No billing periods — set a billing start date and batch exam date</span>
                  ) : (
                    periods.map((p) => <FeeMonthChip key={p.periodStart} period={p} />)
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── CRM ─────────────────────────────────────────────────────────
function CRMPage({ leads, batches, onSaveLead, onDeleteLead, onMoveStage, onConvertToStudent }) {
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState(null);
  const [viewMode, setViewMode] = useState("pipeline");

  const stageColors = [BRAND.blue, BRAND.orange, BRAND.green, BRAND.crimson];

  async function saveLead(lead) {
    try {
      await onSaveLead(lead);
      setShowAdd(false);
      setEditing(null);
    } catch (err) {
      alert(err.message);
    }
  }

  async function deleteLead(id) {
    if (!confirm("Delete this lead?")) return;
    try {
      await onDeleteLead(id);
      setEditing(null);
    } catch (err) {
      alert(err.message);
    }
  }

  async function moveStage(id, newStage) {
    try {
      await onMoveStage(id, newStage);
    } catch (err) {
      alert(err.message);
    }
  }

  async function convertToStudent(lead) {
    try {
      await onConvertToStudent(lead.id);
      alert(`${lead.name} converted to student and moved to Customer stage.`);
    } catch (err) {
      alert(err.message);
    }
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
            const stageLeads = leads
              .filter((l) => l.stage === stage)
              .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
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
                {leads.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)).map((l) => (
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
        <LeadForm
          lead={editing}
          onSave={saveLead}
          onClose={() => { setShowAdd(false); setEditing(null); }}
          onDelete={editing ? () => deleteLead(editing.id) : null}
        />
      )}
    </div>
  );
}

function LeadForm({ lead, onSave, onClose, onDelete }) {
  const [form, setForm] = useState(
    lead || {
      name: "", email: "", phone: "", parentName: "", parentPhone: "",
      source: "Facebook DM", stage: "Prospect", notes: "",
      createdAt: today(), updatedAt: today(), followUpDate: "",
      interestLevel: "Medium", convertedStudentId: null,
    }
  );
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
function SettingsPage({ data, onSaveSettings, onImportData, onResetData }) {
  const [settings, setSettings] = useState(data.settings || {});
  const set = (k, v) => setSettings((p) => ({ ...p, [k]: v }));

  async function save() {
    try {
      await onSaveSettings(settings);
      alert("Settings saved.");
    } catch (err) {
      alert(err.message);
    }
  }

  function exportData() {
    // Dues are left out on purpose — they are worked out from the students, so there is
    // nothing about them to restore. Payment history is in, because since fees stopped being
    // stored as documents it is the only record of money received. Note that slip images are
    // not part of the payment list and so are not in this file.
    const exportObj = {
      students: data.students,
      teachers: data.teachers,
      batches: data.batches,
      leads: data.leads,
      settings: data.settings,
      paymentHistory: data.paymentHistory,
    };
    const blob = new Blob([JSON.stringify(exportObj, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `titan-sms-backup-${today()}.json`; a.click();
    URL.revokeObjectURL(url);
  }

  function importData(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const imported = JSON.parse(ev.target.result);
        if (imported.students && imported.batches && imported.leads) {
          await onImportData(imported);
          alert("Data imported successfully.");
        } else {
          alert("Invalid backup file.");
        }
      } catch {
        alert("Failed to parse file.");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  async function resetAll() {
    if (!confirm("Reset ALL data? This cannot be undone.")) return;
    if (!confirm("Are you absolutely sure?")) return;
    try {
      await onResetData();
      alert("All data has been reset.");
    } catch (err) {
      alert(err.message);
    }
  }

  return (
    <div>
      <div style={S.pageTitle}>Settings</div>
      <div style={S.pageDesc}>Configure invoicing, data management, and preferences</div>

      <div style={S.card}>
        <div style={S.cardTitle}>{ICONS.money} Invoice Settings</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div style={S.formGroup}><label style={S.formLabel}>Invoice Prefix</label><input style={S.input} value={settings.invoicePrefix || ""} onChange={(e) => set("invoicePrefix", e.target.value)} /></div>
          <div style={S.formGroup}><label style={S.formLabel}>Next Invoice Number</label><input style={S.input} type="number" value={settings.nextInvoiceNum || 1001} onChange={(e) => set("nextInvoiceNum", parseInt(e.target.value) || 1001)} /></div>
          <div style={S.formGroup}><label style={S.formLabel}>Default Monthly Fee (MMK)</label><input style={S.input} type="number" value={settings.defaultFee || 0} onChange={(e) => set("defaultFee", parseInt(e.target.value) || 0)} /></div>
          <div style={S.formGroup}><label style={S.formLabel}>Currency</label><input style={S.input} value={settings.currency || "MMK"} onChange={(e) => set("currency", e.target.value)} /></div>
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
          <div>Total Teachers: <strong>{data.teachers.length}</strong></div>
          <div>Active Teachers: <strong>{data.teachers.filter((t) => t.status === "Active").length}</strong></div>
          <div>Total Batches: <strong>{data.batches.length}</strong></div>
          <div>Owed This Month: <strong>{fmtMMK((data.duesTotals || {}).outstanding || 0)}</strong></div>
          <div>Total CRM Leads: <strong>{data.leads.length}</strong></div>
          <div>Lifetime Revenue: <strong>{fmtMMK(data.paymentHistory.reduce((s, ph) => s + ph.amount, 0))}</strong></div>
        </div>
      </div>
    </div>
  );
}

// ─── MAIN APP ────────────────────────────────────────────────────
// The full owner console, copied from the pre-auth build of this app. Only two things
// were added: a logout button (that build had no login) and the responsive shell rules
// in the <style> block below.
export default function OwnerSMS({ onLogout }) {
  const [activeTab, setActiveTab] = useState("Dashboard");
  const [data, setData] = useState({ students: [], teachers: [], batches: [], dues: [], duesTotals: {}, leads: [], settings: {}, paymentHistory: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function fetchAll() {
      try {
        // No overdue sweep to run: a fee is late when its date has passed, which is worked
        // out on the spot rather than stamped onto a document.
        const [students, teachers, batches, dues, leads, settings, paymentHistory] = await Promise.all([
          api.getStudents(),
          api.getTeachers(),
          api.getBatches(),
          api.getDues(),
          api.getLeads(),
          api.getSettings(),
          api.getPaymentHistory(),
        ]);
        setData({ students, teachers, batches, dues: dues.dues, duesTotals: dues.totals, leads, settings, paymentHistory });
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    fetchAll();
  }, []);

  // ── Student handlers ──
  async function handleSaveStudent(studentData) {
    if (studentData.id) {
      const updated = await api.updateStudent(studentData.id, studentData);
      setData((prev) => ({ ...prev, students: prev.students.map((s) => s.id === studentData.id ? updated : s) }));
      return updated;
    } else {
      // Registering also records the first payment, so both come back together and the
      // form uses the payment to draw the receipt.
      const { student, payment } = await api.createStudent(studentData);
      setData((prev) => ({
        ...prev,
        students: [...prev.students, student],
        paymentHistory: [payment, ...prev.paymentHistory],
      }));
      return { ...student, payment };
    }
  }

  async function handleDeleteStudent(id) {
    await api.deleteStudent(id);
    setData((prev) => ({ ...prev, students: prev.students.filter((s) => s.id !== id) }));
  }

  async function handleAddStrike(id) {
    const updated = await api.addStrike(id);
    setData((prev) => ({ ...prev, students: prev.students.map((s) => s.id === id ? updated : s) }));
  }

  async function handleRemoveStrike(id) {
    const updated = await api.removeStrike(id);
    setData((prev) => ({ ...prev, students: prev.students.map((s) => s.id === id ? updated : s) }));
  }

  // ── Teacher handlers ──
  async function handleSaveTeacher(teacherData) {
    if (teacherData.id) {
      const updated = await api.updateTeacher(teacherData.id, teacherData);
      setData((prev) => ({ ...prev, teachers: prev.teachers.map((t) => t.id === teacherData.id ? updated : t) }));
    } else {
      const created = await api.createTeacher(teacherData);
      setData((prev) => ({ ...prev, teachers: [...prev.teachers, created] }));
    }
  }

  async function handleDeleteTeacher(id) {
    await api.deleteTeacher(id);
    setData((prev) => ({ ...prev, teachers: prev.teachers.filter((t) => t.id !== id) }));
  }

  // ── Batch handlers ──
  async function handleSaveBatch(batchData) {
    if (batchData.id) {
      const updated = await api.updateBatch(batchData.id, batchData);
      setData((prev) => ({ ...prev, batches: prev.batches.map((b) => b.id === batchData.id ? updated : b) }));
    } else {
      const created = await api.createBatch(batchData);
      setData((prev) => ({ ...prev, batches: [...prev.batches, created] }));
    }
  }

  async function handleDeleteBatch(id) {
    await api.deleteBatch(id);
    setData((prev) => ({ ...prev, batches: prev.batches.filter((b) => b.id !== id) }));
  }

  // ── Payments ──
  // The invoices page does the recording and owns the months it is showing; this only keeps
  // the rest of the console in step — payment history, and the current month behind the
  // dashboard.
  async function handlePaymentRecorded(payment) {
    setData((prev) => ({ ...prev, paymentHistory: [payment, ...prev.paymentHistory] }));
    try {
      const fresh = await api.getDues();
      setData((prev) => ({ ...prev, dues: fresh.dues, duesTotals: fresh.totals }));
    } catch {
      // A stale dashboard is not worth interrupting the payment that just succeeded.
    }
  }

  async function handleUpdatePaymentHistory(id, data) {
    const updated = await api.updatePaymentHistory(id, data);
    setData((prev) => ({
      ...prev,
      paymentHistory: prev.paymentHistory.map((ph) => ph.id === id ? updated : ph),
    }));
  }

  async function handleDeletePaymentHistory(id) {
    const result = await api.deletePaymentHistory(id);
    setData((prev) => ({
      ...prev,
      paymentHistory: prev.paymentHistory.filter((ph) => ph.id !== id),
    }));
  }

  // ── Lead handlers ──
  async function handleSaveLead(leadData) {
    if (leadData.id) {
      const updated = await api.updateLead(leadData.id, leadData);
      setData((prev) => ({ ...prev, leads: prev.leads.map((l) => l.id === leadData.id ? updated : l) }));
    } else {
      const created = await api.createLead(leadData);
      setData((prev) => ({ ...prev, leads: [...prev.leads, created] }));
    }
  }

  async function handleDeleteLead(id) {
    await api.deleteLead(id);
    setData((prev) => ({ ...prev, leads: prev.leads.filter((l) => l.id !== id) }));
  }

  async function handleMoveStage(id, newStage) {
    const lead = data.leads.find((l) => l.id === id);
    const updated = await api.updateLead(id, { ...lead, stage: newStage });
    setData((prev) => ({ ...prev, leads: prev.leads.map((l) => l.id === id ? updated : l) }));
  }

  async function handleConvertToStudent(leadId) {
    const result = await api.convertLeadToStudent(leadId);
    setData((prev) => ({
      ...prev,
      students: [...prev.students, result.student],
      leads: prev.leads.map((l) => l.id === leadId ? result.lead : l),
    }));
  }

  // ── Settings handlers ──
  async function handleSaveSettings(settings) {
    const updated = await api.updateSettings(settings);
    setData((prev) => ({ ...prev, settings: updated }));
  }

  async function handleImportData(importedData) {
    const result = await api.importData(importedData);
    setData(result);
  }

  async function handleResetData() {
    const result = await api.resetData();
    setData(result);
  }

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh", fontFamily: "'Crimson Pro', Georgia, serif", fontSize: 18, color: "#8B1A1A" }}>
        Loading Titan SMS…
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", height: "100vh", fontFamily: "'Crimson Pro', Georgia, serif", gap: 12 }}>
        <div style={{ fontSize: 24, color: "#C62828" }}>Could not connect to server</div>
        <div style={{ fontSize: 14, color: "#9E9E9E" }}>{error}</div>
        <div style={{ fontSize: 13, color: "#9E9E9E" }}>Make sure the Express server is running on port 5000 and MongoDB is connected.</div>
      </div>
    );
  }

  // What each batch bills in a month: every active student's own class fee added up. A
  // student on a negotiated fee counts at that fee, not at the batch default, so a batch of
  // discounted students does not read as though everyone pays list price.
  //
  // Owner-only: this is passed to StudentsPage only here, never from TitanSMS, which is what
  // keeps admin and students_admin from seeing it regardless of what those roles have loaded.
  const revenueByBatch = {};
  for (const s of data.students) {
    if (s.status !== "Active") continue;
    const batch = data.batches.find((b) => b.id === s.batchId);
    if (!batch) continue;
    const fee = s.customFee != null ? s.customFee : batch.fee;
    revenueByBatch[batch.id] = (revenueByBatch[batch.id] || 0) + fee;
  }

  const pages = {
    Dashboard: <Dashboard data={data} />,
    // Same Students page every role sees; teachers enable batch assignment + commission,
    // and receiptRenderer adds the first-payment receipt after creating a student.
    // revenueByBatch is owner-only, computed above.
    Students: (
      <StudentsPage
        students={data.students}
        batches={data.batches}
        teachers={data.teachers}
        onSaveStudent={handleSaveStudent}
        onDeleteStudent={handleDeleteStudent}
        onAddStrike={handleAddStrike}
        onRemoveStrike={handleRemoveStrike}
        onSaveBatch={handleSaveBatch}
        onDeleteBatch={handleDeleteBatch}
        receiptRenderer={(payment) => <ReceiptPreview payment={payment} />}
        revenueByBatch={revenueByBatch}
      />
    ),
    Teachers: (
      <TeachersPage
        teachers={data.teachers}
        onSaveTeacher={handleSaveTeacher}
        onDeleteTeacher={handleDeleteTeacher}
      />
    ),
    Invoices: (
      <InvoicesPage
        students={data.students}
        batches={data.batches}
        settings={data.settings}
        initialDues={data.dues}
        initialTotals={data.duesTotals}
        onPaymentRecorded={handlePaymentRecorded}
      />
    ),
    "Payment History": (
      <PaymentHistoryPage
        paymentHistory={data.paymentHistory}
        batches={data.batches}
        onDelete={handleDeletePaymentHistory}
        onUpdate={handleUpdatePaymentHistory}
      />
    ),
    Transactions: (
      <TransactionsPage
        paymentHistory={data.paymentHistory}
        students={data.students}
        batches={data.batches}
      />
    ),
    "Fee Tracker": (
      <FeeTrackerPage
        students={data.students}
        batches={data.batches}
        paymentHistory={data.paymentHistory}
      />
    ),
    CRM: (
      <CRMPage
        leads={data.leads}
        batches={data.batches}
        onSaveLead={handleSaveLead}
        onDeleteLead={handleDeleteLead}
        onMoveStage={handleMoveStage}
        onConvertToStudent={handleConvertToStudent}
      />
    ),
    Settings: (
      <SettingsPage
        data={data}
        onSaveSettings={handleSaveSettings}
        onImportData={handleImportData}
        onResetData={handleResetData}
      />
    ),
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

        /* ─── Responsive / mobile ─────────────────────────────── */
        @media (max-width: 768px) {
          /* Stop iOS Safari zooming in when a field is focused */
          input, select, textarea { font-size: 16px !important; }

          .app-shell { flex-direction: column !important; }

          .app-sidebar {
            width: 100% !important;
            height: auto !important;
            flex-direction: row !important;
            align-items: center !important;
            z-index: 100;
          }
          .sidebar-header { padding: 10px 14px !important; border-bottom: none !important; }
          .sidebar-sub, .sidebar-version, .sidebar-role { display: none !important; }
          .nav-list {
            flex: 1 !important;
            padding-top: 0 !important;
            display: flex !important;
            flex-direction: row !important;
            overflow-x: auto !important;
          }
          .nav-item {
            padding: 14px 16px !important;
            border-left: none !important;
            border-bottom: 3px solid transparent !important;
            white-space: nowrap;
          }
          .nav-item-active { border-bottom-color: ${BRAND.gold} !important; }
          .sidebar-footer {
            border-top: none !important;
            padding: 8px 10px !important;
            display: flex !important;
            align-items: center !important;
          }
          .logout-btn { width: auto !important; padding: 8px 10px !important; white-space: nowrap; }

          .app-main { padding: 16px !important; max-width: 100% !important; }
        }
      `}</style>
      <div style={S.app} className="app-shell">
        <nav style={S.sidebar} className="app-sidebar">
          <div style={S.sidebarHeader} className="sidebar-header">
            <div style={S.sidebarLogo}>TITAN</div>
            <div style={S.sidebarSub} className="sidebar-sub">Learning Center</div>
          </div>
          <div style={{ flex: 1, paddingTop: 12 }} className="nav-list">
            {TABS.map((tab) => (
              <div
                key={tab}
                style={S.navItem(activeTab === tab)}
                className={`nav-item${activeTab === tab ? " nav-item-active" : ""}`}
                onClick={() => setActiveTab(tab)}
              >
                <span>{ICONS[tab]}</span>
                <span>{tab}</span>
              </div>
            ))}
          </div>
          <div style={{ padding: "12px 20px", borderTop: `1px solid ${BRAND.charcoalLight}` }} className="sidebar-footer">
            <div style={{ fontSize: 11, color: BRAND.grey, marginBottom: 8 }} className="sidebar-role">
              Signed in as owner
            </div>
            <button
              onClick={onLogout}
              className="logout-btn"
              style={{
                width: "100%", padding: "8px 12px", background: "transparent",
                color: BRAND.grey, border: `1px solid ${BRAND.charcoalLight}`, borderRadius: 6,
                fontSize: 12, fontFamily: "inherit", cursor: "pointer",
              }}
            >
              Log out
            </button>
          </div>
          <div style={{ padding: "12px 20px 16px", fontSize: 11, color: BRAND.grey }} className="sidebar-version">
            v2.0 MERN — Understanding over Memorization
          </div>
        </nav>
        <main style={S.main} className="app-main">
          {pages[activeTab]}
        </main>
      </div>
    </>
  );
}
