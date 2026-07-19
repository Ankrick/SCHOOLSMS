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

const TABS = ["Invoices", "Payment History"];

const ICONS = {
  Invoices: "🧾", "Payment History": "💳",
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
    Paid: [BRAND.green, BRAND.greenLight],
    Unpaid: [BRAND.red, BRAND.redLight],
    Overdue: [BRAND.orange, BRAND.orangeLight],
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
function InvoicesPage({ invoices, students, batches, settings, onMarkPaid, onDeleteInvoice, onGenerateInvoices }) {
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [dueDateFrom, setDueDateFrom] = useState("");
  const [dueDateTo, setDueDateTo] = useState("");
  const [preview, setPreview] = useState(null);
  const [showGenerate, setShowGenerate] = useState(false);
  const [selected, setSelected] = useState(new Set());
  const [statusSort, setStatusSort] = useState(null); // null | "outstanding" | "paid"

  // Clear selection whenever the visible list changes
  useEffect(() => setSelected(new Set()), [search, filterStatus, dueDateFrom, dueDateTo]);

  const hasDateFilter = dueDateFrom || dueDateTo;

  const studentsById = useMemo(
    () => Object.fromEntries(students.map((s) => [s.id, s])),
    [students]
  );

  function toggleStatusSort() {
    setStatusSort((prev) => (prev === null ? "outstanding" : prev === "outstanding" ? "paid" : null));
  }

  const STATUS_PRIORITY = { Overdue: 0, Unpaid: 1, Paid: 2 };

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
      if (statusSort) {
        const pa = STATUS_PRIORITY[a.status] ?? 3;
        const pb = STATUS_PRIORITY[b.status] ?? 3;
        const diff = statusSort === "outstanding" ? pa - pb : pb - pa;
        if (diff !== 0) return diff;
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
            {invoice.dueDate && (
              <div style={{ marginBottom: 4 }}>
                <span style={{ color: BRAND.grey }}>Billing Period:</span>{" "}
                <strong>{fmtPeriod(invoice.dueDate, addOneMonth(invoice.dueDate))}</strong>
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

// ─── MAIN APP ────────────────────────────────────────────────────
export default function TitanSMS() {
  const [activeTab, setActiveTab] = useState("Invoices");
  const [data, setData] = useState({ students: [], batches: [], invoices: [], settings: {}, paymentHistory: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function fetchAll() {
      try {
        await api.markInvoicesOverdue();
        const [students, batches, invoices, settings, paymentHistory] = await Promise.all([
          api.getStudents(),
          api.getBatches(),
          api.getInvoices(),
          api.getSettings(),
          api.getPaymentHistory(),
        ]);
        setData({ students, batches, invoices, settings, paymentHistory });
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    fetchAll();
  }, []);

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
