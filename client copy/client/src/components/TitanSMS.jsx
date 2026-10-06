import { useState, useEffect, useRef, useMemo } from "react";
import html2canvas from "html2canvas";
import * as api from "../api";

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
const STRIKE_MAX = 3;
const SUBJECTS = ["Computer Science", "ICT", "Mathematics", "Physics", "Biology", "Chemistry"];
const TABS = ["Dashboard", "Students", "Teachers", "Batches", "Invoices", "Payment History", "Fee Tracker", "CRM", "Settings"];

const ICONS = {
  Dashboard: "📊", Students: "🎓", Teachers: "👩‍🏫", Batches: "📚", Invoices: "🧾", "Payment History": "💳", "Fee Tracker": "🗓️", CRM: "🤝", Settings: "⚙️",
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

function Strikes({ count }) {
  return (
    <span style={{ display: "inline-flex", gap: 3 }} title={`${count}/${STRIKE_MAX} strikes`}>
      {[0, 1, 2].map((i) => (
        <span key={i} style={{ width: 8, height: 8, borderRadius: "50%", background: i < count ? BRAND.red : BRAND.border, display: "inline-block" }} />
      ))}
    </span>
  );
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
  const { students, teachers = [], invoices, leads, batches } = data;
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
  const totalRevenue = invoices.filter((i) => i.status === "Paid").reduce((sum, i) => sum + i.amountPaid, 0);
  const unpaidInvoices = invoices.filter((i) => i.status === "Unpaid" || i.status === "Overdue").length;
  const totalLeads = leads.filter((l) => l.stage === "Lead" || l.stage === "Prospect").length;
  const thisMonth = currentMonthKey();
  const monthRevenue = invoices
    .filter((i) => i.status === "Paid" && monthKey(i.paidDate) === thisMonth)
    .reduce((sum, i) => sum + i.amountPaid, 0);
  const overdueInvoices = invoices.filter((i) => i.status === "Overdue");
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
          <div style={D.tileLabel}>Unpaid Invoices</div>
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
              <strong>{overdueInvoices.length}</strong> overdue invoice{overdueInvoices.length > 1 ? "s" : ""} pending collection
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

// ─── STUDENTS ────────────────────────────────────────────────────
function exportStudentsCSV(students, batches) {
  const headers = [
    "Name", "Burmese Name", "Email", "Phone", "Telegram",
    "Batch", "Subject", "Status", "Strikes", "Custom Fee (MMK)",
    "Enrolled Date", "Billing Start Date",
    "Parent/Contact", "Parent Phone", "Parent Facebook", "Notes",
  ];
  const rows = students.map((s) => {
    const batch = batches.find((b) => b.id === s.batchId);
    return [
      s.name, s.nameBurmese || "", s.email, s.phone || "", s.telegram || "",
      batch ? batch.name : "", s.subject, s.status, s.strikes, s.customFee != null ? s.customFee : "",
      s.enrolledDate || "", s.billingStartDate || "",
      s.parentName || "", s.parentPhone || "", s.parentFacebook || "", s.notes || "",
    ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",");
  });
  const csv = [headers.join(","), ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `students_${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function StudentsPage({ students, batches, onSaveStudent, onDeleteStudent, onAddStrike, onRemoveStrike }) {
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState(null);
  const [filterBatch, setFilterBatch] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");

  const filtered = students.filter((s) => {
    if (filterBatch !== "all" && s.batchId !== filterBatch) return false;
    if (filterStatus !== "all" && s.status !== filterStatus) return false;
    if (search && !s.name.toLowerCase().includes(search.toLowerCase()) && !s.email.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  async function saveStudent(student) {
    const saved = await onSaveStudent(student);
    if (student.id) {
      // editing — close immediately
      setShowAdd(false);
      setEditing(null);
    }
    return saved;
  }

  async function deleteStudent(id) {
    if (!confirm("Remove this student?")) return;
    try {
      await onDeleteStudent(id);
    } catch (err) {
      alert(err.message);
    }
  }

  async function addStrike(id) {
    try {
      await onAddStrike(id);
    } catch (err) {
      alert(err.message);
    }
  }

  async function removeStrike(id) {
    try {
      await onRemoveStrike(id);
    } catch (err) {
      alert(err.message);
    }
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
          {batches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <select style={{ ...S.select, width: "auto", minWidth: 120 }} value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
          <option value="all">All Status</option>
          <option value="Active">Active</option>
          <option value="Inactive">Inactive</option>
          <option value="Expelled">Expelled</option>
        </select>
        <button style={S.btn("secondary")} onClick={() => exportStudentsCSV(filtered, batches)}>{ICONS.download} Export CSV</button>
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
                  const batch = batches.find((b) => b.id === s.batchId);
                  return (
                    <tr key={s.id} onMouseEnter={(e) => e.currentTarget.style.background = BRAND.cream} onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>
                      <td style={S.td}>
                        <div style={{ fontWeight: 600 }}>{s.name}</div>
                        {s.nameBurmese && <div style={{ fontSize: 12, color: BRAND.charcoal }}>{s.nameBurmese}</div>}
                        <div style={{ fontSize: 11, color: BRAND.grey }}>{s.email}</div>
                      </td>
                      <td style={S.td}>
                        <span style={S.tag}>{batch ? batch.name : "—"}</span>
                        {s.customFee != null && (
                          <div style={{ fontSize: 11, color: BRAND.crimson, marginTop: 3, fontWeight: 600 }}>
                            {fmtMMK(s.customFee)} (custom)
                          </div>
                        )}
                      </td>
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
          batches={batches}
          onSave={saveStudent}
          onClose={() => { setShowAdd(false); setEditing(null); }}
        />
      )}
    </div>
  );
}

function StudentForm({ student, batches, onSave, onClose }) {
  const [form, setForm] = useState(
    student || {
      name: "", email: "", phone: "", batchId: batches[0]?.id || "",
      subject: "Computer Science", status: "Active", strikes: 0, customFee: null,
      enrolledDate: today(), billingStartDate: today(), parentName: "", parentPhone: "", parentFacebook: "",
      nameBurmese: "", telegram: "", notes: "",
    }
  );
  const [saving, setSaving] = useState(false);
  const [receiptData, setReceiptData] = useState(null);

  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));
  const batchFee = batches.find((b) => b.id === form.batchId)?.fee ?? 0;

  async function handleSave() {
    if (!form.name) { alert("Name is required"); return; }
    setSaving(true);
    try {
      const saved = await onSave(form);
      if (!student && saved) {
        const batch = batches.find((b) => b.id === saved.batchId);
        const billingStart = saved.billingStartDate || saved.enrolledDate || today();
        setReceiptData({
          studentName: saved.name,
          nameBurmese: saved.nameBurmese || "",
          studentEmail: saved.email || "",
          batchName: batch ? batch.name : "—",
          paidDate: saved.enrolledDate || today(),
          periodStart: billingStart,
          periodEnd: addOneMonth(billingStart),
          amount: saved.customFee != null ? saved.customFee : (batch ? batch.fee : 0),
          invoiceNumber: "",
        });
      }
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (receiptData) {
    return (
      <Modal title="Receipt — First Payment" onClose={onClose}>
        <ReceiptPreview payment={receiptData} />
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
          <button style={S.btn("secondary")} onClick={onClose}>Done</button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title={student ? "Edit Student" : "Add Student"} onClose={onClose}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div style={S.formGroup}><label style={S.formLabel}>Full Name (English) *</label><input style={S.input} value={form.name} onChange={(e) => set("name", e.target.value)} /></div>
        <div style={S.formGroup}><label style={S.formLabel}>Burmese Name</label><input style={S.input} value={form.nameBurmese || ""} onChange={(e) => set("nameBurmese", e.target.value)} placeholder="မြန်မာနာမည်" /></div>
        <div style={S.formGroup}><label style={S.formLabel}>Email</label><input style={S.input} value={form.email} onChange={(e) => set("email", e.target.value)} /></div>
        <div style={S.formGroup}><label style={S.formLabel}>Phone</label><input style={S.input} value={form.phone} onChange={(e) => set("phone", e.target.value)} /></div>
        <div style={S.formGroup}><label style={S.formLabel}>Telegram</label><input style={S.input} value={form.telegram || ""} onChange={(e) => set("telegram", e.target.value)} placeholder="@username" /></div>
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
        <div style={S.formGroup}>
          <label style={S.formLabel}>Custom Fee (MMK)</label>
          <input
            style={S.input}
            type="number"
            value={form.customFee ?? ""}
            onChange={(e) => set("customFee", e.target.value === "" ? null : parseInt(e.target.value))}
            placeholder={`Batch default: ${fmtMMK(batchFee)}`}
          />
        </div>
        <div style={S.formGroup}><label style={S.formLabel}>Enrolled Date</label><input style={S.input} type="date" value={fmtDateInput(form.enrolledDate)} onChange={(e) => set("enrolledDate", e.target.value)} /></div>
        <div style={S.formGroup}><label style={S.formLabel}>Billing Period</label><input style={S.input} type="date" value={fmtDateInput(form.billingStartDate || form.enrolledDate)} onChange={(e) => set("billingStartDate", e.target.value)} /></div>
        <div style={S.formGroup}><label style={S.formLabel}>Contact</label><input style={S.input} value={form.parentName} onChange={(e) => set("parentName", e.target.value)} /></div>
        <div style={S.formGroup}><label style={S.formLabel}>Parent Phone</label><input style={S.input} value={form.parentPhone} onChange={(e) => set("parentPhone", e.target.value)} /></div>
        <div style={S.formGroup}><label style={S.formLabel}>Parent Facebook</label><input style={S.input} value={form.parentFacebook || ""} onChange={(e) => set("parentFacebook", e.target.value)} placeholder="Facebook username or profile URL" /></div>
      </div>
      <div style={S.formGroup}><label style={S.formLabel}>Notes</label><textarea style={{ ...S.input, height: 60, resize: "vertical" }} value={form.notes} onChange={(e) => set("notes", e.target.value)} /></div>
      <div style={{ display: "flex", gap: 12, justifyContent: "flex-end", marginTop: 12 }}>
        <button style={S.btn("secondary")} onClick={onClose}>Cancel</button>
        <button style={S.btn("primary")} onClick={handleSave} disabled={saving}>
          {saving ? "Saving…" : student ? "Save Student" : "Save & Generate Receipt"}
        </button>
      </div>
    </Modal>
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

// ─── BATCHES ─────────────────────────────────────────────────────
function BatchesPage({ batches, students, teachers = [], onSaveBatch, onDeleteBatch }) {
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState(null);

  async function saveBatch(batch) {
    try {
      await onSaveBatch(batch);
      setShowAdd(false);
      setEditing(null);
    } catch (err) {
      alert(err.message);
    }
  }

  async function deleteBatch(id) {
    const hasStudents = students.some((s) => s.batchId === id);
    if (hasStudents) return alert("Cannot delete a batch that has enrolled students.");
    if (!confirm("Delete this batch?")) return;
    try {
      await onDeleteBatch(id);
    } catch (err) {
      alert(err.message);
    }
  }

  return (
    <div>
      <div style={S.pageTitle}>Batches</div>
      <div style={S.pageDesc}>Manage cohorts — max 15 students per batch</div>

      <div style={S.toolbar}>
        <button style={S.btn("primary")} onClick={() => setShowAdd(true)}>{ICONS.add} Add Batch</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 20 }}>
        {batches.map((b) => {
          const enrolled = students.filter((s) => s.batchId === b.id && s.status === "Active");
          const pct = Math.round((enrolled.length / b.maxStudents) * 100);
          const monthlyRevenue = enrolled.reduce((sum, s) => sum + (s.customFee != null ? s.customFee : b.fee), 0);
          const teacher = teachers.find((t) => t.id === b.teacherId);
          const teacherSalary = teacher ? teacher.monthlySalary || 0 : 0;
          const profitAfterSalary = monthlyRevenue - teacherSalary;
          const commission = Math.round(Math.max(0, profitAfterSalary) * (b.commissionPercent || 0) / 100);
          return (
            <div key={b.id} style={S.card}>
              <div style={{ ...S.flexBetween, marginBottom: 12 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 16 }}>{b.name}</div>
                  <div style={{ fontSize: 12, color: BRAND.grey }}>{b.syllabus} • {b.days}</div>
                  {teacher && (
                    <div style={{ fontSize: 12, color: BRAND.grey, marginTop: 2 }}>
                      👨‍🏫 <strong style={{ color: BRAND.charcoal }}>{teacher.name}</strong>
                      {(b.commissionPercent || 0) > 0 && <> · {b.commissionPercent}% commission</>}
                    </div>
                  )}
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
              <div style={{ fontSize: 13, color: BRAND.grey }}>
                Fee: <strong style={{ color: BRAND.charcoal }}>{fmtMMK(b.fee)}</strong>/month
                &nbsp;·&nbsp; <strong style={{ color: BRAND.charcoal }}>{b.sessionsPerMonth || 8}</strong> sessions
                {!teacher && (b.commissionPercent || 0) > 0 && (
                  <>&nbsp;·&nbsp; <strong style={{ color: BRAND.charcoal }}>{b.commissionPercent}%</strong> commission</>
                )}
              </div>
              {b.examSession && (
                <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={S.badge(
                    isExamPast(b.examDate) ? BRAND.grey : isExamSoon(b.examDate) ? BRAND.orange : BRAND.gold,
                    isExamPast(b.examDate) ? BRAND.greyLight : isExamSoon(b.examDate) ? BRAND.orangeLight : "#FFF8E8"
                  )}>
                    {isExamPast(b.examDate) ? "✓ Complete" : isExamSoon(b.examDate) ? "⚡ " : "🎯 "}{isExamPast(b.examDate) ? "" : b.examSession}
                  </span>
                  {b.examDate && (
                    <span style={{ fontSize: 12, color: BRAND.grey }}>
                      Exam: {fmtDate(b.examDate)}
                    </span>
                  )}
                </div>
              )}
              <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${BRAND.border}` }}>
                <div style={{ fontSize: 10, color: BRAND.grey, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 3 }}>Monthly Revenue</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: BRAND.crimson }}>{fmtMMK(monthlyRevenue)}</div>
                <div style={{ fontSize: 11, color: BRAND.grey, marginTop: 2 }}>{enrolled.length} student{enrolled.length !== 1 ? "s" : ""} × fees</div>
                {teacherSalary > 0 && (
                  <div style={{ fontSize: 11, color: BRAND.grey, marginTop: 2 }}>
                    Teacher salary: <strong style={{ color: BRAND.red }}>−{fmtMMK(teacherSalary)}</strong>
                  </div>
                )}
                {commission > 0 && (
                  <div style={{ fontSize: 11, color: BRAND.grey, marginTop: 2 }}>
                    Commission ({b.commissionPercent}% of {fmtMMK(Math.max(0, profitAfterSalary))} profit): <strong style={{ color: BRAND.red }}>−{fmtMMK(commission)}</strong>
                  </div>
                )}
                {(teacherSalary > 0 || commission > 0) && (
                  <div style={{ fontSize: 11, marginTop: 2 }}>
                    Batch profit: <strong style={{ color: profitAfterSalary - commission >= 0 ? BRAND.green : BRAND.red }}>{fmtMMK(profitAfterSalary - commission)}</strong>
                  </div>
                )}
              </div>

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
        <BatchForm batch={editing} teachers={teachers} onSave={saveBatch} onClose={() => { setShowAdd(false); setEditing(null); }} />
      )}
    </div>
  );
}

function BatchForm({ batch, teachers = [], onSave, onClose }) {
  const [form, setForm] = useState(
    batch
      ? { examSession: "", examDate: "", sessionsPerMonth: 8, teacherId: "", commissionPercent: 0, ...batch }
      : { name: "", syllabus: "CIE", days: "", maxStudents: 15, fee: 180000, examSession: "", examDate: "", sessionsPerMonth: 8, teacherId: "", commissionPercent: 0 }
  );
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
        <div style={S.formGroup}><label style={S.formLabel}>Sessions / Month</label><input style={S.input} type="number" value={form.sessionsPerMonth || 8} onChange={(e) => set("sessionsPerMonth", parseInt(e.target.value) || 8)} /></div>
        <div style={S.formGroup}>
          <label style={S.formLabel}>Teacher</label>
          <select style={S.select} value={form.teacherId || ""} onChange={(e) => set("teacherId", e.target.value)}>
            <option value="">— Unassigned —</option>
            {teachers.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>
        <div style={S.formGroup}><label style={S.formLabel}>Teacher Commission (%)</label><input style={S.input} type="number" min="0" max="100" value={form.commissionPercent || 0} onChange={(e) => set("commissionPercent", Math.min(100, Math.max(0, parseFloat(e.target.value) || 0)))} /></div>
      </div>
      <div style={{ fontSize: 12, color: BRAND.grey, marginBottom: 8 }}>Commission is paid from batch profit: (monthly revenue − teacher salary) × commission %.</div>
      <div style={{ ...S.formGroup, marginTop: 4 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: BRAND.grey, marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.5px" }}>Exam Target</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div style={S.formGroup}><label style={S.formLabel}>Exam Session</label><input style={S.input} value={form.examSession || ""} onChange={(e) => set("examSession", e.target.value)} placeholder="e.g. Oct/Nov 2026" /></div>
          <div style={S.formGroup}><label style={S.formLabel}>Exam Date</label><input style={S.input} type="date" value={form.examDate || ""} onChange={(e) => set("examDate", e.target.value)} /></div>
        </div>
        <div style={{ fontSize: 12, color: BRAND.grey }}>Invoices stop after the exam month. Leave blank for open-ended batches.</div>
      </div>
      <div style={{ display: "flex", gap: 12, justifyContent: "flex-end", marginTop: 12 }}>
        <button style={S.btn("secondary")} onClick={onClose}>Cancel</button>
        <button style={S.btn("primary")} onClick={() => form.name ? onSave(form) : alert("Name is required")}>Save Batch</button>
      </div>
    </Modal>
  );
}

// ─── INVOICES ────────────────────────────────────────────────────
function InvoicesPage({ invoices, students, batches, settings, onMarkPaid, onDeleteInvoice, onGenerateInvoices }) {
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [dueDateFrom, setDueDateFrom] = useState("");
  const [dueDateTo, setDueDateTo] = useState("");
  const [preview, setPreview] = useState(null);
  const [showGenerate, setShowGenerate] = useState(false);
  const [selected, setSelected] = useState(new Set());
  const [dueSort, setDueSort] = useState(null); // null (default) | "asc" | "desc"

  // Clear selection whenever the visible list changes
  useEffect(() => setSelected(new Set()), [search, filterStatus, dueDateFrom, dueDateTo]);

  function toggleDueSort() {
    setDueSort((prev) => (prev === "asc" ? "desc" : "asc"));
  }

  const hasDateFilter = dueDateFrom || dueDateTo;

  const studentsById = useMemo(
    () => Object.fromEntries(students.map((s) => [s.id, s])),
    [students]
  );

  const filtered = invoices
    .filter((inv) => {
      if (filterStatus !== "all" && inv.status !== filterStatus) return false;
      if (dueDateFrom && inv.dueDate && inv.dueDate < dueDateFrom) return false;
      if (dueDateTo && inv.dueDate && inv.dueDate > dueDateTo) return false;
      if (search) {
        const s = search.toLowerCase();
        const parentName = studentsById[inv.studentId]?.parentName || "";
        return (
          inv.invoiceNumber.toLowerCase().includes(s) ||
          inv.studentName.toLowerCase().includes(s) ||
          parentName.toLowerCase().includes(s)
        );
      }
      return true;
    })
    .sort((a, b) => {
      if (dueSort) {
        // Most urgent (earliest/most overdue due date) first when ascending
        const cmp = (a.dueDate || "").localeCompare(b.dueDate || "");
        return dueSort === "asc" ? cmp : -cmp;
      }
      return new Date(b.issueDate) - new Date(a.issueDate);
    });

  async function generateMonthlyInvoices() {
    try {
      const count = await onGenerateInvoices();
      setShowGenerate(false);
      alert(`${count} invoice${count !== 1 ? "s" : ""} generated.`);
    } catch (err) {
      setShowGenerate(false);
      alert(err.message);
    }
  }

  async function markPaid(id) {
    try {
      await onMarkPaid(id);
    } catch (err) {
      alert(err.message);
    }
  }

  async function deleteInvoice(id) {
    if (!confirm("Delete this invoice?")) return;
    try {
      await onDeleteInvoice(id);
    } catch (err) {
      alert(err.message);
    }
  }

  function toggleSelect(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelected(
      selected.size === filtered.length && filtered.length > 0
        ? new Set()
        : new Set(filtered.map((i) => i.id))
    );
  }

  async function bulkMarkPaid() {
    const toMark = filtered.filter((i) => selected.has(i.id) && (i.status === "Unpaid" || i.status === "Overdue"));
    if (toMark.length === 0) return alert("No unpaid invoices in the selection.");
    try {
      await Promise.all(toMark.map((i) => onMarkPaid(i.id)));
      setSelected(new Set());
    } catch (err) {
      alert(err.message);
    }
  }

  async function bulkDelete() {
    if (!confirm(`Delete ${selected.size} selected invoice${selected.size !== 1 ? "s" : ""}? This cannot be undone.`)) return;
    try {
      await Promise.all([...selected].map((id) => onDeleteInvoice(id)));
      setSelected(new Set());
    } catch (err) {
      alert(err.message);
    }
  }

  const allSelected = filtered.length > 0 && filtered.every((i) => selected.has(i.id));

  const totalUnpaid = filtered
    .filter((i) => i.status === "Unpaid" || i.status === "Overdue")
    .reduce((s, i) => s + i.amount - i.amountPaid, 0);
  const totalPaidThisMonth = invoices
    .filter((i) => i.status === "Paid" && i.paidDate && monthKey(i.paidDate) === currentMonthKey())
    .reduce((s, i) => s + i.amountPaid, 0);

  // Eligible-for-next-invoice count mirrors server logic
  let toInvoiceCount = 0;
  let examExcludedCount = 0;
  for (const s of students) {
    if (s.status !== "Active") continue;
    const studentInvs = invoices.filter((i) => i.studentId === s.id);
    if (studentInvs.some((i) => i.status === "Unpaid" || i.status === "Overdue")) continue;
    const lastInv = studentInvs.slice().sort((a, b) =>
      (b.periodEnd || b.dueDate || "").localeCompare(a.periodEnd || a.dueDate || "")
    )[0];
    const periodStart = lastInv
      ? (lastInv.periodEnd || lastInv.dueDate)
      : (s.billingStartDate || s.enrolledDate || today());
    const batch = batches.find((b) => b.id === s.batchId);
    if (batch && batch.examDate && periodStart.slice(0, 7) > batch.examDate.slice(0, 7)) {
      examExcludedCount++;
    } else {
      toInvoiceCount++;
    }
  }

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
          <div style={S.statLabel}>Outstanding Balance{hasDateFilter ? " (Filtered)" : ""}</div>
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
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 12, color: BRAND.grey, whiteSpace: "nowrap" }}>Due:</span>
          <input
            style={{ ...S.input, width: 140, fontSize: 13 }}
            type="date"
            value={dueDateFrom}
            onChange={(e) => setDueDateFrom(e.target.value)}
            title="Due date from"
          />
          <span style={{ fontSize: 12, color: BRAND.grey }}>–</span>
          <input
            style={{ ...S.input, width: 140, fontSize: 13 }}
            type="date"
            value={dueDateTo}
            onChange={(e) => setDueDateTo(e.target.value)}
            title="Due date to"
          />
          {hasDateFilter && (
            <button
              style={{ ...S.btn("small"), color: BRAND.red, padding: "4px 8px" }}
              onClick={() => { setDueDateFrom(""); setDueDateTo(""); }}
              title="Clear date filter"
            >✕</button>
          )}
        </div>
        <button style={S.btn("gold")} onClick={() => setShowGenerate(true)}>{ICONS.money} Generate Monthly Invoices</button>
      </div>

      {selected.size > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 16px", background: BRAND.blueLight, border: `1px solid ${BRAND.blue}22`, borderRadius: 8, marginBottom: 16, flexWrap: "wrap" }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: BRAND.blue }}>{selected.size} selected</span>
          <button style={S.btn("success")} onClick={bulkMarkPaid}>✅ Mark Paid</button>
          <button style={S.btn("danger")} onClick={bulkDelete}>🗑️ Delete</button>
          <button style={{ ...S.btn("secondary"), marginLeft: "auto" }} onClick={() => setSelected(new Set())}>Clear</button>
        </div>
      )}

      <div style={S.card}>
        {filtered.length === 0 ? (
          <EmptyState icon="🧾" message="No invoices yet" action={<button style={S.btn("gold")} onClick={() => setShowGenerate(true)}>Generate Invoices</button>} />
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={S.table}>
              <thead>
                <tr>
                  <th style={{ ...S.th, width: 36, paddingRight: 4 }}>
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleSelectAll}
                      style={{ cursor: "pointer", width: 15, height: 15 }}
                      title="Select all"
                    />
                  </th>
                  <th style={S.th}>Invoice #</th>
                  <th style={S.th}>Student</th>
                  <th style={S.th}>Parent</th>
                  <th style={S.th}>Batch</th>
                  <th style={S.th}>Period</th>
                  <th style={S.th}>Amount</th>
                  <th
                    style={{ ...S.th, cursor: "pointer", userSelect: "none" }}
                    onClick={toggleDueSort}
                    title="Sort by due date — most urgent (overdue) first"
                  >
                    Status {dueSort === "asc" ? "▲" : dueSort === "desc" ? "▼" : "⇅"}
                  </th>
                  <th style={S.th}>Due Date</th>
                  <th style={S.th}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((inv) => (
                  <tr
                    key={inv.id}
                    style={{ background: selected.has(inv.id) ? BRAND.blueLight : "transparent" }}
                    onMouseEnter={(e) => { if (!selected.has(inv.id)) e.currentTarget.style.background = BRAND.cream; }}
                    onMouseLeave={(e) => { if (!selected.has(inv.id)) e.currentTarget.style.background = "transparent"; }}
                  >
                    <td style={{ ...S.td, width: 36, paddingRight: 4 }}>
                      <input
                        type="checkbox"
                        checked={selected.has(inv.id)}
                        onChange={() => toggleSelect(inv.id)}
                        style={{ cursor: "pointer", width: 15, height: 15 }}
                      />
                    </td>
                    <td style={{ ...S.td, fontWeight: 600, fontFamily: "monospace" }}>{inv.invoiceNumber}</td>
                    <td style={S.td}>{inv.studentName}</td>
                    <td style={S.td}>
                      {(() => {
                        const parent = studentsById[inv.studentId];
                        if (!parent || !parent.parentName) return <span style={{ color: BRAND.grey }}>—</span>;
                        return (
                          <div>
                            <div>{parent.parentName}</div>
                            {parent.parentPhone && (
                              <div style={{ fontSize: 12, color: BRAND.grey }}>{parent.parentPhone}</div>
                            )}
                          </div>
                        );
                      })()}
                    </td>
                    <td style={S.td}><span style={S.tag}>{inv.batchName}</span></td>
                    <td style={S.td} style={{ whiteSpace: "nowrap", fontSize: 12 }}>
                      {inv.periodStart ? fmtPeriod(inv.periodStart, inv.periodEnd) : inv.monthKey}
                    </td>
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
            For each active student with no unpaid invoices, this generates <strong>all overdue periods</strong> since
            their last paid invoice date (or enrollment date). Multiple catch-up invoices are created if several months have passed.
          </p>
          <p style={{ fontSize: 13, color: BRAND.grey, marginBottom: examExcludedCount > 0 ? 8 : 20 }}>
            Students to invoice: <strong>{toInvoiceCount}</strong>
          </p>
          {examExcludedCount > 0 && (
            <p style={{ fontSize: 13, color: BRAND.grey, marginBottom: 20, padding: "8px 12px", background: BRAND.orangeLight, borderRadius: 6 }}>
              Excluded — exam period over: <strong style={{ color: BRAND.orange }}>{examExcludedCount}</strong> student{examExcludedCount !== 1 ? "s" : ""}
            </p>
          )}
          <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
            <button style={S.btn("secondary")} onClick={() => setShowGenerate(false)}>Cancel</button>
            <button style={S.btn("gold")} onClick={generateMonthlyInvoices}>Generate Now</button>
          </div>
        </Modal>
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
      link.download = `${invoice.invoiceNumber}.png`;
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
            const correctedDesc = invoice.dueDate && item.desc
              ? item.desc.replace(/ · .+$/, ` · ${fmtPeriod(invoice.dueDate, addOneMonth(invoice.dueDate))}`)
              : item.desc;
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
                      <span style={S.badge(BRAND.crimson, BRAND.redLight)}>#{ph.paymentCount}</span>
                    </td>
                    <td style={S.td}>
                      <div style={{ display: "flex", gap: 4 }}>
                        <button style={S.btn("small")} onClick={() => setReceipt(ph)} title="Generate Receipt">🧾 Receipt</button>
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
    </div>
  );
}

// ─── FEE TRACKER ─────────────────────────────────────────────────
// For each student, builds the sequence of one-month billing periods running from their
// billing anchor (billingStartDate, falling back to enrolledDate) up to their batch's exam
// month (or the current month, if the batch has no exam date set yet).
function buildFeePeriods(student, batch, invoices, paymentHistory) {
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
  const invByStart = new Map();
  for (const inv of invoices) {
    if (inv.studentId === student.id && inv.periodStart) invByStart.set(inv.periodStart, inv);
  }

  const periods = [];
  for (let idx = 0; idx < 240; idx++) {
    const periodStart = addMonths(anchor, idx);
    const mk = periodStart.slice(0, 7);
    if (examCutoffMk ? mk > examCutoffMk : mk > nowMk) break;
    const periodEnd = addMonths(anchor, idx + 1);

    // An outstanding invoice for this exact period wins over a same-period payment record —
    // that combination means a duplicate invoice was raised after the period was already paid,
    // and the still-open balance is what actually needs attention.
    const inv = invByStart.get(periodStart);
    const ph = paidByStart.get(periodStart);
    let status, paidDate;
    if (inv && (inv.status === "Unpaid" || inv.status === "Overdue")) {
      status = inv.status === "Overdue" ? "overdue" : "unpaid";
    } else if (ph) {
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

function FeeTrackerPage({ students, batches, invoices, paymentHistory }) {
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
    const periods = buildFeePeriods(s, batch, invoices, paymentHistory);
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
    const exportObj = {
      students: data.students,
      teachers: data.teachers,
      batches: data.batches,
      invoices: data.invoices,
      leads: data.leads,
      settings: data.settings,
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
        if (imported.students && imported.batches && imported.invoices && imported.leads) {
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
  const [data, setData] = useState({ students: [], teachers: [], batches: [], invoices: [], leads: [], settings: {}, paymentHistory: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function fetchAll() {
      try {
        await api.markInvoicesOverdue();
        const [students, teachers, batches, invoices, leads, settings, paymentHistory] = await Promise.all([
          api.getStudents(),
          api.getTeachers(),
          api.getBatches(),
          api.getInvoices(),
          api.getLeads(),
          api.getSettings(),
          api.getPaymentHistory(),
        ]);
        setData({ students, teachers, batches, invoices, leads, settings, paymentHistory });
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
      const created = await api.createStudent(studentData);
      setData((prev) => ({ ...prev, students: [...prev.students, created] }));
      return created;
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

  // ── Invoice handlers ──
  async function handleMarkPaid(id) {
    const result = await api.markInvoicePaid(id);
    setData((prev) => {
      // Remove the paid invoice; optionally append the newly generated next invoice
      const invoices = prev.invoices.filter((i) => i.id !== result.deletedInvoiceId);
      return {
        ...prev,
        invoices: result.nextInvoice ? [...invoices, result.nextInvoice] : invoices,
        paymentHistory: [result.history, ...prev.paymentHistory],
      };
    });
  }

  async function handleDeleteInvoice(id) {
    await api.deleteInvoice(id);
    setData((prev) => ({ ...prev, invoices: prev.invoices.filter((i) => i.id !== id) }));
  }

  async function handleGenerateInvoices() {
    const result = await api.generateMonthlyInvoices();
    setData((prev) => ({ ...prev, invoices: [...prev.invoices, ...result.invoices] }));
    return result.count;
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
      invoices: result.deletedInvoiceId
        ? prev.invoices.filter((i) => i.id !== result.deletedInvoiceId)
        : prev.invoices,
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
        <div style={{ fontSize: 13, color: "#9E9E9E" }}>Make sure the Express server is running on port 5001 and MongoDB is connected.</div>
      </div>
    );
  }

  const pages = {
    Dashboard: <Dashboard data={data} />,
    Students: (
      <StudentsPage
        students={data.students}
        batches={data.batches}
        onSaveStudent={handleSaveStudent}
        onDeleteStudent={handleDeleteStudent}
        onAddStrike={handleAddStrike}
        onRemoveStrike={handleRemoveStrike}
      />
    ),
    Teachers: (
      <TeachersPage
        teachers={data.teachers}
        onSaveTeacher={handleSaveTeacher}
        onDeleteTeacher={handleDeleteTeacher}
      />
    ),
    Batches: (
      <BatchesPage
        batches={data.batches}
        students={data.students}
        teachers={data.teachers}
        onSaveBatch={handleSaveBatch}
        onDeleteBatch={handleDeleteBatch}
      />
    ),
    Invoices: (
      <InvoicesPage
        invoices={data.invoices}
        students={data.students}
        batches={data.batches}
        settings={data.settings}
        onMarkPaid={handleMarkPaid}
        onDeleteInvoice={handleDeleteInvoice}
        onGenerateInvoices={handleGenerateInvoices}
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
    "Fee Tracker": (
      <FeeTrackerPage
        students={data.students}
        batches={data.batches}
        invoices={data.invoices}
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
            v2.0 MERN — Understanding over Memorization
          </div>
        </nav>
        <main style={S.main}>
          {pages[activeTab]}
        </main>
      </div>
    </>
  );
}
