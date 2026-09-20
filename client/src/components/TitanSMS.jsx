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

// Tabs for the two scoped accounts. The owner gets the full console instead — see
// OwnerSMS.jsx, picked in App.jsx. The server enforces this split as well
// (server/middleware/roleGuard.js); this only decides what to render.
//   admin          — finance only.
//   students_admin — the Students tab, which covers batches too.
const TABS_BY_ROLE = {
  admin: ["Invoices", "Payment History"],
  students_admin: ["Students"],
};

// Roles whose data load includes invoices, payments and revenue. Everyone else would get
// a 403 from those endpoints. Students and batches are readable by every role.
const CAN_SEE_FINANCE = ["owner", "admin"];

const ICONS = {
  Students: "🎓", Invoices: "🧾", "Payment History": "💳",
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
const addOneMonth = (dateStr) => {
  const [year, month, day] = dateStr.split("-").map(Number);
  const nm = month === 12 ? 1 : month + 1;
  const ny = month === 12 ? year + 1 : year;
  const lastDay = new Date(ny, nm, 0).getDate();
  return `${ny}-${String(nm).padStart(2, "0")}-${String(Math.min(day, lastDay)).padStart(2, "0")}`;
};
const fmtPeriod = (start, end) => {
  if (!start || !end) return "—";
  const fmt = (d) => new Date(d + "T12:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
  const endYear = new Date(end + "T12:00:00").getFullYear();
  return `${fmt(start)} – ${fmt(end)} ${endYear}`;
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
  invoicePreview: { border: `2px solid ${BRAND.crimson}`, borderRadius: 10, padding: 32, background: BRAND.white, maxWidth: 600, margin: "0 auto" },
  flex: { display: "flex", alignItems: "center", gap: 8 },
  flexBetween: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  tag: { display: "inline-block", padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 600, background: BRAND.cream, color: BRAND.charcoal, marginRight: 4 },
  emptyState: { textAlign: "center", padding: "48px 20px", color: BRAND.grey },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
};

// ─── SHARED COMPONENTS ───────────────────────────────────────────
// contentStyle widens the panel for the roomier windows (e.g. a batch's students).
function Modal({ title, onClose, children, contentStyle }) {
  return (
    <div style={S.modal} onClick={onClose}>
      <div style={{ ...S.modalContent, ...contentStyle }} className="modal-content" onClick={(e) => e.stopPropagation()}>
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
    // Invoices
    Paid: [BRAND.green, BRAND.greenLight],
    Unpaid: [BRAND.red, BRAND.redLight],
    Overdue: [BRAND.orange, BRAND.orangeLight],
    // Students
    Active: [BRAND.green, BRAND.greenLight],
    Expelled: [BRAND.red, BRAND.redLight],
  };
  const [c, bg] = map[stage] || [BRAND.grey, BRAND.greyLight];
  return <span style={S.badge(c, bg)}>{stage}</span>;
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
    <div ref={previewRef} style={S.invoicePreview} className="invoice-preview">
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
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, fontSize: 13 }} className="preview-grid">
          <div>
            <div style={{ fontWeight: 600, marginBottom: 4, color: BRAND.grey, fontSize: 11, textTransform: "uppercase" }}>Bill To</div>
            <div style={{ fontWeight: 600 }}>{invoice.studentName}</div>
            <div style={{ color: BRAND.grey }}>{invoice.studentEmail}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            {invoice.periodStart && (
              <div style={{ marginBottom: 4 }}>
                <span style={{ color: BRAND.grey }}>Billing Period:</span>{" "}
                <strong>{fmtPeriod(invoice.periodStart, invoice.periodEnd)}</strong>
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

  // periodStart is the month the payment prepaid; fall back to the pay date
  // (payments cover one month starting from when they're made)
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
      <div ref={receiptRef} style={S.invoicePreview} className="invoice-preview">
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
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, fontSize: 13 }} className="preview-grid">
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
      <div style={S.pageTitle} className="page-title">Payment History</div>
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

      <div style={S.toolbar} className="toolbar">
        <div style={S.searchBox}>
          <span style={S.searchIcon}>{ICONS.search}</span>
          <input style={S.searchInput} placeholder="Search by student name or invoice #..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select style={{ ...S.select, width: "auto", minWidth: 160 }} value={filterBatch} onChange={(e) => setFilterBatch(e.target.value)}>
          <option value="all">All Batches</option>
          {batches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }} className="date-filter-row">
          <span style={{ fontSize: 12, color: BRAND.grey, whiteSpace: "nowrap" }}>Paid:</span>
          <input style={{ ...S.input, width: 140, fontSize: 13 }} type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} title="From" />
          <span style={{ fontSize: 12, color: BRAND.grey }}>–</span>
          <input style={{ ...S.input, width: 140, fontSize: 13 }} type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} title="To" />
          {hasDateFilter && (
            <button style={{ ...S.btn("small"), color: BRAND.red, padding: "4px 8px" }} onClick={() => { setDateFrom(""); setDateTo(""); }} title="Clear">✕</button>
          )}
        </div>
      </div>

      <div style={S.card} className="card">
        {filtered.length === 0 ? (
          <EmptyState icon="💳" message="No payment records yet. Payments appear here when invoices are marked as paid." />
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={S.table} className="data-table">
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
                    <td style={S.td} data-label="Student">
                      <div style={{ fontWeight: 600 }}>{ph.studentName}</div>
                      {ph.nameBurmese && <div style={{ fontSize: 12, color: BRAND.charcoal }}>{ph.nameBurmese}</div>}
                      <div style={{ fontSize: 11, color: BRAND.grey }}>{ph.studentEmail}</div>
                    </td>
                    <td style={S.td} data-label="Batch"><span style={S.tag}>{ph.batchName}</span></td>
                    <td style={{ ...S.td, fontFamily: "monospace", fontSize: 12 }} data-label="Invoice #">{ph.invoiceNumber}</td>
                    <td style={{ ...S.td, fontSize: 12, whiteSpace: "nowrap" }} data-label="Period">
                      {ph.periodStart ? fmtPeriod(ph.periodStart, ph.periodEnd) : "—"}
                    </td>
                    <td style={{ ...S.td, fontWeight: 700, color: BRAND.green }} data-label="Amount">{fmtMMK(ph.amount)}</td>
                    <td style={S.td} data-label="Paid Date">
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
                    <td style={S.td} data-label="Payment #">
                      <span style={S.badge(BRAND.crimson, BRAND.redLight)}>{ph.kind === "registration" ? "Registration" : "#" + ph.paymentCount}</span>
                    </td>
                    <td style={S.td} data-label="Actions">
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

// ─── MAIN APP ────────────────────────────────────────────────────
export default function TitanSMS({ onLogout }) {
  const role = api.getRole();
  const canSeeFinance = CAN_SEE_FINANCE.includes(role);
  // Unknown roles fall back to the most restricted tab set.
  const tabs = TABS_BY_ROLE[role] || TABS_BY_ROLE.students_admin;
  const [activeTab, setActiveTab] = useState(tabs[0]);
  const [data, setData] = useState({ students: [], batches: [], dues: [], duesTotals: {}, settings: {}, paymentHistory: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function fetchAll() {
      try {
        // Every role reads students and batches; the invoice screens need their names.
        if (!canSeeFinance) {
          // students_admin: the billing endpoints would 403.
          const [students, batches] = await Promise.all([api.getStudents(), api.getBatches()]);
          setData((prev) => ({ ...prev, students, batches }));
          return;
        }
        // No overdue sweep to run: a fee is late when its date has passed, which is worked
        // out on the spot rather than stamped onto a document.
        const [students, batches, dues, settings, paymentHistory] = await Promise.all([
          api.getStudents(),
          api.getBatches(),
          api.getDues(),
          api.getSettings(),
          api.getPaymentHistory(),
        ]);
        setData({ students, batches, dues: dues.dues, duesTotals: dues.totals, settings, paymentHistory });
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    fetchAll();
  }, [canSeeFinance]);

  // ── Student handlers ──
  async function handleSaveStudent(form) {
    if (form.id) {
      const updated = await api.updateStudent(form.id, form);
      setData((prev) => ({
        ...prev,
        students: prev.students.map((s) => (s.id === updated.id ? updated : s)),
      }));
      return updated;
    } else {
      // Registering also records the first payment, so both come back together and the
      // form uses the payment to draw the receipt.
      const { student, payment } = await api.createStudent(form);
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

  function replaceStudent(updated) {
    setData((prev) => ({
      ...prev,
      students: prev.students.map((s) => (s.id === updated.id ? updated : s)),
    }));
  }

  async function handleAddStrike(id) {
    replaceStudent(await api.addStrike(id));
  }

  async function handleRemoveStrike(id) {
    replaceStudent(await api.removeStrike(id));
  }

  // ── Batch handlers ──
  async function handleSaveBatch(form) {
    if (form.id) {
      const updated = await api.updateBatch(form.id, form);
      setData((prev) => ({
        ...prev,
        batches: prev.batches.map((b) => (b.id === updated.id ? updated : b)),
      }));
    } else {
      const created = await api.createBatch(form);
      setData((prev) => ({ ...prev, batches: [...prev.batches, created] }));
    }
  }

  async function handleDeleteBatch(id) {
    await api.deleteBatch(id);
    setData((prev) => ({ ...prev, batches: prev.batches.filter((b) => b.id !== id) }));
  }

  // ── Payments ──
  // The invoices page does the recording and owns the months it is showing; this only keeps
  // payment history in step.
  async function handlePaymentRecorded(payment) {
    setData((prev) => ({ ...prev, paymentHistory: [payment, ...prev.paymentHistory] }));
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

  const pages = {
    Students: (
      <StudentsPage
        students={data.students}
        batches={data.batches}
        onSaveStudent={handleSaveStudent}
        onDeleteStudent={handleDeleteStudent}
        onAddStrike={handleAddStrike}
        onRemoveStrike={handleRemoveStrike}
        onSaveBatch={handleSaveBatch}
        onDeleteBatch={handleDeleteBatch}
        receiptRenderer={(payment) => <ReceiptPreview payment={payment} />}
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
          /* Prevent iOS Safari from zooming in when a field is focused */
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
          .sidebar-sub, .sidebar-version { display: none !important; }
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
          .sidebar-role { display: none !important; }
          .logout-btn { width: auto !important; padding: 8px 10px !important; white-space: nowrap; }

          .app-main { padding: 16px !important; max-width: 100% !important; }
          .page-title { font-size: 22px !important; }
          .card { padding: 14px !important; }
          .modal-content { padding: 18px !important; width: 92% !important; }

          .toolbar { flex-direction: column !important; align-items: stretch !important; }
          .toolbar > * { width: 100% !important; flex: 0 0 auto !important; }
          .date-filter-row { flex-wrap: wrap; }

          .invoice-preview { padding: 18px !important; }
          .preview-grid { grid-template-columns: 1fr !important; text-align: left !important; }
          .preview-grid > div:last-child { text-align: left !important; margin-top: 8px; }
        }

        @media (max-width: 640px) {
          /* Data tables reflow into stacked cards — each cell becomes a labeled row */
          .data-table thead { display: none; }
          .data-table, .data-table tbody, .data-table tr, .data-table td { display: block; width: 100%; }
          .data-table tr {
            margin-bottom: 12px;
            border: 1px solid ${BRAND.border};
            border-radius: 8px;
            padding: 8px 10px;
            background: ${BRAND.white} !important;
          }
          .data-table td {
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 10px;
            padding: 6px 2px !important;
            border-bottom: 1px dashed ${BRAND.border} !important;
            text-align: right;
          }
          .data-table tr td:last-child { border-bottom: none !important; }
          .data-table td[data-label]::before {
            content: attr(data-label);
            font-weight: 600;
            color: ${BRAND.grey};
            font-size: 11px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            text-align: left;
            flex-shrink: 0;
          }
        }
      `}</style>
      <div style={S.app} className="app-shell">
        <nav style={S.sidebar} className="app-sidebar">
          <div style={S.sidebarHeader} className="sidebar-header">
            <div style={S.sidebarLogo}>TITAN</div>
            <div style={S.sidebarSub} className="sidebar-sub">Learning Center</div>
          </div>
          <div style={{ flex: 1, paddingTop: 12 }} className="nav-list">
            {tabs.map((tab) => (
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
            {role && (
              <div style={{ fontSize: 11, color: BRAND.grey, marginBottom: 8, textTransform: "capitalize" }} className="sidebar-role">
                Signed in as {role.replace("_", " ")}
              </div>
            )}
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
          {tabs.includes(activeTab) ? pages[activeTab] : pages[tabs[0]]}
        </main>
      </div>
    </>
  );
}
