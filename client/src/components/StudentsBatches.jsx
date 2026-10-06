// Shared Students + Batches feature — one implementation used by every role's shell
// (TitanSMS.jsx and OwnerSMS.jsx) so the two never drift apart.
//
// Batches render as squares in a grid; pressing one raises a large window listing that
// batch's students as detail cards. Capability differences are passed in as props rather
// than forked into separate components:
//   teachers        - when non-empty, the batch form can assign a teacher + commission.
//   receiptRenderer - when supplied, creating a student offers a first-payment receipt.
//   revenueByBatch  - when supplied ({ batchId: monthly total }), each batch card shows what
//                     it bills in a month. Owner-only: the shell decides who gets this by
//                     deciding whether to compute and pass it at all.

import { useState, useMemo, Fragment } from "react";
import { SlipFields, SlipMissingNote, emptySlipPayment, isSlipComplete } from "./PaymentSlip";
import { planSummary } from "../paymentPlan";

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

// ─── HELPERS ─────────────────────────────────────────────────────
const STRIKE_MAX = 3;
const SUBJECTS = ["Computer Science", "ICT", "Mathematics", "Physics", "Biology", "Chemistry"];

const fmtMMK = (n) => new Intl.NumberFormat("en-US").format(n) + " MMK";
const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—";
const fmtDateInput = (d) => (d ? new Date(d).toISOString().split("T")[0] : "");
const today = () => new Date().toISOString().split("T")[0];
// Add `n` calendar months, clamping to the month's last day — the same arithmetic the server
// bills with, so suggested installment dates land where monthly billing would.
const addMonths = (dateStr, n) => {
  const [year, month, day] = dateStr.split("-").map(Number);
  const total = year * 12 + (month - 1) + n;
  const newYear = Math.floor(total / 12);
  const newMonth = (total % 12) + 1;
  const lastDay = new Date(newYear, newMonth, 0).getDate();
  return `${newYear}-${String(newMonth).padStart(2, "0")}-${String(Math.min(day, lastDay)).padStart(2, "0")}`;
};
const MAX_INSTALLMENTS = 24;
const EMPTY_PLAN = { kind: "monthly", months: null, installments: [] };

// ─── PRIMITIVES ──────────────────────────────────────────────────
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
        <span
          key={i}
          style={{
            width: 8, height: 8, borderRadius: "50%",
            background: i < count ? BRAND.red : BRAND.border,
            display: "inline-block",
          }}
        />
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

// ─── STUDENT DETAIL CARD (inside the batch window) ───────────────
function StudentDetailCard({ student, batch, onEdit, onDelete, onAddStrike, onRemoveStrike }) {
  // Exactly these four, always shown in this order — a missing one reads "—" rather than
  // vanishing, so every card lines up and a gap is obvious. Everything else lives in Edit.
  const billing = student.billingStartDate || student.enrolledDate;
  const rows = [
    ["Student Telegram", student.telegram],
    ["Guardian fb contact", student.invoiceContact],
    ["Billing Date", billing ? fmtDate(billing) : null],
    ["Payment Plan", planSummary(student, batch)],
  ];

  return (
    <div style={{ border: `1px solid ${BRAND.border}`, borderRadius: 10, padding: 16, background: BRAND.white }}>
      <div style={{ ...S.flexBetween, gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15 }}>{student.name}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
            <Badge stage={student.status} />
            <Strikes count={student.strikes} />
          </div>
        </div>
        <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
          <button style={S.btn("small")} onClick={() => onEdit(student)}>✏️ Edit</button>
          <button style={{ ...S.btn("small"), color: BRAND.red }} onClick={() => onDelete(student.id)}>🗑️</button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "6px 12px", fontSize: 13 }}>
        {rows.map(([label, value]) => (
          <Fragment key={label}>
            <div style={{ color: BRAND.grey, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.5px", paddingTop: 2 }}>
              {label}
            </div>
            <div>{value || <span style={{ color: BRAND.grey }}>—</span>}</div>
          </Fragment>
        ))}
      </div>

      <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ fontSize: 11, color: BRAND.grey, textTransform: "uppercase", letterSpacing: "0.5px" }}>Strikes</span>
        <button style={{ ...S.btn("small"), padding: "2px 8px" }} onClick={() => onAddStrike(student.id).catch((e) => alert(e.message))}>+</button>
        {student.strikes > 0 && (
          <button style={{ ...S.btn("small"), padding: "2px 8px" }} onClick={() => onRemoveStrike(student.id).catch((e) => alert(e.message))}>−</button>
        )}
      </div>
    </div>
  );
}

// ─── PAYMENT PLAN ────────────────────────────────────────────────
// Monthly: a fee per month and, optionally, how many months (blank runs to the batch's
// exam). Installments: a number of payments, each with its own amount and due date. The
// first payment of either is the one collected at registration, so the first installment's
// date is the billing date and is not editable here.
function PaymentPlanFields({ plan, anchor, customFee, batchFee, onPlanChange, onFeeChange, disabled }) {
  const installments = plan.installments || [];

  function setKind(kind) {
    if (kind === plan.kind) return;
    // Switching to installments for the first time suggests three monthly payments.
    const next = { ...plan, kind };
    if (kind === "installments" && installments.length === 0) next.installments = resize([], 3);
    onPlanChange(next);
  }

  // New rows default to a month after the one before, which is where monthly billing would
  // have put them; existing rows keep what was typed.
  function resize(list, count) {
    const out = list.slice(0, count);
    while (out.length < count) {
      const prev = out.length ? out[out.length - 1].dueDate || anchor : anchor;
      out.push({ amount: "", dueDate: out.length === 0 ? anchor : addMonths(prev, 1) });
    }
    return out;
  }

  function setCount(raw) {
    const count = Math.max(1, Math.min(MAX_INSTALLMENTS, parseInt(raw) || 1));
    onPlanChange({ ...plan, installments: resize(installments, count) });
  }

  function setInstallment(i, key, value) {
    onPlanChange({ ...plan, installments: installments.map((inst, j) => (j === i ? { ...inst, [key]: value } : inst)) });
  }

  const total = installments.reduce((sum, i) => sum + (Number(i.amount) || 0), 0);
  const segment = (active) => ({
    ...S.btn(active ? "primary" : "secondary"),
    flex: 1,
    justifyContent: "center",
  });

  return (
    <div style={{ border: `1px solid ${BRAND.border}`, borderRadius: 10, padding: 20, marginBottom: 16 }}>
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>Payment plan</div>
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <button type="button" style={segment(plan.kind !== "installments")} onClick={() => setKind("monthly")} disabled={disabled}>
          Monthly
        </button>
        <button type="button" style={segment(plan.kind === "installments")} onClick={() => setKind("installments")} disabled={disabled}>
          Installments
        </button>
      </div>

      {plan.kind !== "installments" ? (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }} className="preview-grid">
            <div style={S.formGroup}>
              <label style={S.formLabel}>Fee per month (MMK)</label>
              <input
                style={S.input}
                type="number"
                min="0"
                value={customFee ?? ""}
                onChange={(e) => onFeeChange(e.target.value === "" ? null : parseInt(e.target.value))}
                placeholder={`Batch default: ${fmtMMK(batchFee)}`}
                disabled={disabled}
              />
            </div>
            <div style={S.formGroup}>
              <label style={S.formLabel}>Number of months</label>
              <input
                style={S.input}
                type="number"
                min="1"
                value={plan.months ?? ""}
                onChange={(e) => onPlanChange({ ...plan, months: e.target.value === "" ? null : parseInt(e.target.value) })}
                placeholder="Until the batch's exam"
                disabled={disabled}
              />
            </div>
          </div>
          <div style={{ fontSize: 12, color: BRAND.grey }}>
            Billed on the billing date each month. Leave the number of months blank to keep billing until the batch's exam.
          </div>
        </>
      ) : (
        <>
          <div style={{ ...S.formGroup, maxWidth: 200 }}>
            <label style={S.formLabel}>Number of payments</label>
            <input
              style={S.input}
              type="number"
              min="1"
              max={MAX_INSTALLMENTS}
              value={installments.length}
              onChange={(e) => setCount(e.target.value)}
              disabled={disabled}
            />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "auto 1fr 1fr", gap: "8px 12px", alignItems: "center" }}>
            <div style={S.formLabel}>#</div>
            <div style={S.formLabel}>Amount (MMK)</div>
            <div style={S.formLabel}>Due date</div>
            {installments.map((inst, i) => (
              <Fragment key={i}>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{i + 1}</div>
                <input
                  style={S.input}
                  type="number"
                  min="1"
                  value={inst.amount}
                  onChange={(e) => setInstallment(i, "amount", e.target.value === "" ? "" : parseInt(e.target.value))}
                  disabled={disabled}
                />
                {i === 0 ? (
                  <div style={{ fontSize: 12, color: BRAND.grey, lineHeight: 1.3 }}>
                    {anchor ? fmtDate(anchor) : "Billing date"}
                    <div>Paid at registration</div>
                  </div>
                ) : (
                  <input
                    style={S.input}
                    type="date"
                    value={inst.dueDate || ""}
                    onChange={(e) => setInstallment(i, "dueDate", e.target.value)}
                    disabled={disabled}
                  />
                )}
              </Fragment>
            ))}
          </div>
          <div style={{ ...S.flexBetween, marginTop: 12, fontSize: 13 }}>
            <span style={{ color: BRAND.grey }}>Each payment is invoiced on its due date.</span>
            <span>Total: <strong>{fmtMMK(total)}</strong></span>
          </div>
        </>
      )}
    </div>
  );
}

// Same rules the server applies, checked first so a mistake is caught before the slip upload.
function planError(plan, anchor) {
  if (plan.kind === "installments") {
    const list = plan.installments || [];
    if (list.length === 0) return "Add at least one payment to the installment plan.";
    for (let i = 0; i < list.length; i++) {
      if (!(Number(list[i].amount) > 0)) return `Enter an amount for payment ${i + 1}.`;
      const due = i === 0 ? anchor : list[i].dueDate;
      if (!due) return `Enter a due date for payment ${i + 1}.`;
      const prev = i === 0 ? null : i === 1 ? anchor : list[i - 1].dueDate;
      if (prev && due <= prev) return `Payment ${i + 1} must fall after payment ${i}.`;
    }
    return null;
  }
  if (plan.months != null && !(Number.isInteger(plan.months) && plan.months >= 1)) {
    return "The number of months must be a whole number of at least 1.";
  }
  return null;
}

// ─── FORMS ───────────────────────────────────────────────────────
// Registering a student is also their first payment: the form asks for the KBZPay slip and
// the date off it, the server records that fee against the student, and the receipt for it
// is shown as soon as the student is saved. Editing an existing student asks for neither.
//
// receiptRenderer is optional: shells that can show payment documents pass one, and a newly
// created student then gets a first-payment receipt.
// lockedBatchId fixes the batch for a new student (added from that batch's window); it is
// undefined when editing, where the batch stays selectable so students can be moved.
function StudentForm({ student, batches, lockedBatchId, onSave, onClose, receiptRenderer }) {
  const [form, setForm] = useState(
    student || {
      name: "", nameBurmese: "", email: "", phone: "", telegram: "",
      batchId: lockedBatchId !== undefined ? lockedBatchId : batches[0]?.id || "",
      subject: "Computer Science", status: "Active", strikes: 0,
      customFee: null, enrolledDate: today(), billingStartDate: today(),
      paymentPlan: EMPTY_PLAN,
      invoiceContact: "", parentPhone: "", notes: "",
    }
  );
  const [saving, setSaving] = useState(false);
  const [receiptData, setReceiptData] = useState(null);
  const isNew = !student;
  const [firstPayment, setFirstPayment] = useState(emptySlipPayment);

  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));
  const batchFee = batches.find((b) => b.id === form.batchId)?.fee ?? 0;
  const plan = form.paymentPlan || EMPTY_PLAN;
  const anchor = fmtDateInput(form.billingStartDate || form.enrolledDate);
  const isInstallments = plan.kind === "installments";
  // What registration collects: the first month, or the first installment.
  const firstAmount = isInstallments
    ? Number(plan.installments?.[0]?.amount) || 0
    : form.customFee != null ? form.customFee : batchFee;

  async function handleSave() {
    if (!form.name.trim()) return alert("Name is required");
    const badPlan = planError(plan, anchor);
    if (badPlan) return alert(badPlan);
    if (isNew && !isSlipComplete(firstPayment)) {
      return alert("Enter the paid date and attach the KBZPay slip for the first payment.");
    }
    setSaving(true);
    try {
      // Only the chosen kind's details are sent; the first installment always sits on the
      // billing date.
      const paymentPlan = isInstallments
        ? { kind: "installments", months: null, installments: plan.installments.map((inst, i) => ({ amount: Number(inst.amount), dueDate: i === 0 ? anchor : inst.dueDate })) }
        : { kind: "monthly", months: plan.months ?? null, installments: [] };
      const payload = { ...form, paymentPlan };
      const saved = await onSave(
        isNew
          ? {
              ...payload,
              firstPayment: {
                paidDate: firstPayment.paidDate,
                slip: { image: firstPayment.image, filename: firstPayment.filename },
              },
            }
          : payload
      );
      // The receipt is drawn from the payment the server actually recorded, so what the
      // student is handed matches the books exactly — amount, period and reference.
      if (isNew && saved && saved.payment && receiptRenderer) {
        setReceiptData(saved.payment);
      } else {
        onClose();
      }
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (receiptData && receiptRenderer) {
    return (
      <Modal title={`Receipt — ${form.name} registered`} onClose={onClose}>
        {receiptRenderer(receiptData)}
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
          <button style={S.btn("secondary")} onClick={onClose}>Done</button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title={student ? "Edit Student" : "Add Student"} onClose={onClose}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }} className="preview-grid">
        <div style={S.formGroup}><label style={S.formLabel}>Full Name (English) *</label><input style={S.input} value={form.name} onChange={(e) => set("name", e.target.value)} /></div>
        <div style={S.formGroup}><label style={S.formLabel}>Burmese Name</label><input style={S.input} value={form.nameBurmese || ""} onChange={(e) => set("nameBurmese", e.target.value)} /></div>
        <div style={S.formGroup}><label style={S.formLabel}>Email</label><input style={S.input} value={form.email || ""} onChange={(e) => set("email", e.target.value)} /></div>
        <div style={S.formGroup}><label style={S.formLabel}>Phone</label><input style={S.input} value={form.phone || ""} onChange={(e) => set("phone", e.target.value)} /></div>
        <div style={S.formGroup}><label style={S.formLabel}>Telegram</label><input style={S.input} value={form.telegram || ""} onChange={(e) => set("telegram", e.target.value)} placeholder="@username" /></div>
        <div style={S.formGroup}>
          <label style={S.formLabel}>Batch</label>
          {lockedBatchId !== undefined ? (
            <div style={{ ...S.input, background: BRAND.cream, color: BRAND.charcoal, lineHeight: "20px" }}>
              {batches.find((b) => b.id === lockedBatchId)?.name || "— No batch —"}
            </div>
          ) : (
            <select style={S.select} value={form.batchId || ""} onChange={(e) => set("batchId", e.target.value)}>
              <option value="">— No batch —</option>
              {batches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          )}
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
        <div style={S.formGroup}><label style={S.formLabel}>Billing Period</label><input style={S.input} type="date" value={fmtDateInput(form.billingStartDate || form.enrolledDate)} onChange={(e) => set("billingStartDate", e.target.value)} /></div>
        <div style={S.formGroup}>
          <label style={S.formLabel}>Guardian fb contact</label>
          <input
            style={S.input}
            value={form.invoiceContact || ""}
            onChange={(e) => set("invoiceContact", e.target.value)}
            placeholder="Who finance sends the invoice to"
          />
        </div>
        <div style={S.formGroup}><label style={S.formLabel}>Parent Phone</label><input style={S.input} value={form.parentPhone || ""} onChange={(e) => set("parentPhone", e.target.value)} /></div>
      </div>
      <div style={S.formGroup}><label style={S.formLabel}>Notes</label><textarea style={{ ...S.input, height: 60, resize: "vertical" }} value={form.notes || ""} onChange={(e) => set("notes", e.target.value)} /></div>

      <PaymentPlanFields
        plan={plan}
        anchor={anchor}
        customFee={form.customFee}
        batchFee={batchFee}
        onPlanChange={(next) => set("paymentPlan", next)}
        onFeeChange={(fee) => set("customFee", fee)}
        disabled={saving}
      />
      {!isNew && (
        <div style={{ fontSize: 12, color: BRAND.grey, marginTop: -8, marginBottom: 16 }}>
          Changing the plan changes what is invoiced from now on. Payments already recorded stay as they were.
        </div>
      )}

      {isNew && (
        <div style={{ border: `1px solid ${BRAND.border}`, borderRadius: 10, padding: 20, marginTop: 4 }}>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>First payment</div>
          <div style={{ fontSize: 12, color: BRAND.grey, marginBottom: 16 }}>
            {fmtMMK(firstAmount)} {isInstallments
              ? plan.installments.length === 1 ? "— the full payment" : `— installment 1 of ${plan.installments.length}`
              : "for the first billing month"}. Recorded against the student and receipted on save.
          </div>
          <SlipFields
            value={firstPayment}
            onChange={setFirstPayment}
            disabled={saving}
            dropHint="Kept with the payment and viewable later under Transactions."
          />
          <SlipMissingNote value={firstPayment} />
        </div>
      )}
      <div style={{ display: "flex", gap: 12, justifyContent: "flex-end", marginTop: 12 }}>
        <button style={S.btn("secondary")} onClick={onClose} disabled={saving}>Cancel</button>
        <button
          style={{ ...S.btn("primary"), ...(isNew && !isSlipComplete(firstPayment) ? { opacity: 0.5, cursor: "not-allowed" } : {}) }}
          onClick={handleSave}
          disabled={saving || (isNew && !isSlipComplete(firstPayment))}
        >
          {saving ? "Saving…" : !isNew || !receiptRenderer ? "Save Student" : "Save & Generate Receipt"}
        </button>
      </div>
    </Modal>
  );
}

// Teacher assignment and commission only render when the shell supplies teachers.
function BatchForm({ batch, teachers = [], onSave, onClose }) {
  const [form, setForm] = useState(
    batch
      ? { examSession: "", examDate: "", sessionsPerMonth: 8, teacherId: "", commissionPercent: 0, ...batch }
      : { name: "", syllabus: "CIE", days: "", maxStudents: 15, fee: 180000, examSession: "", examDate: "", sessionsPerMonth: 8, teacherId: "", commissionPercent: 0 }
  );
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  async function submit() {
    if (!form.name.trim()) return alert("Name is required");
    setSaving(true);
    try {
      await onSave(form);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={batch ? "Edit Batch" : "Add Batch"} onClose={onClose}>
      <div style={S.formGroup}>
        <label style={S.formLabel}>Batch Name *</label>
        <input style={S.input} value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. CIE 0478 — Sat/Mon" />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }} className="preview-grid">
        <div style={S.formGroup}>
          <label style={S.formLabel}>Syllabus</label>
          <select style={S.select} value={form.syllabus} onChange={(e) => set("syllabus", e.target.value)}>
            <option value="CIE">CIE</option>
            <option value="Edexcel">Edexcel</option>
          </select>
        </div>
        <div style={S.formGroup}><label style={S.formLabel}>Days</label><input style={S.input} value={form.days || ""} onChange={(e) => set("days", e.target.value)} placeholder="e.g. Sat & Mon" /></div>
        <div style={S.formGroup}><label style={S.formLabel}>Max Students</label><input style={S.input} type="number" value={form.maxStudents} onChange={(e) => set("maxStudents", parseInt(e.target.value) || 15)} /></div>
        <div style={S.formGroup}><label style={S.formLabel}>Monthly Fee (MMK)</label><input style={S.input} type="number" value={form.fee} onChange={(e) => set("fee", parseInt(e.target.value) || 0)} /></div>
        <div style={S.formGroup}><label style={S.formLabel}>Sessions / Month</label><input style={S.input} type="number" value={form.sessionsPerMonth || 8} onChange={(e) => set("sessionsPerMonth", parseInt(e.target.value) || 8)} /></div>
        {teachers.length > 0 && (
          <>
            <div style={S.formGroup}>
              <label style={S.formLabel}>Teacher</label>
              <select style={S.select} value={form.teacherId || ""} onChange={(e) => set("teacherId", e.target.value)}>
                <option value="">— Unassigned —</option>
                {teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div style={S.formGroup}>
              <label style={S.formLabel}>Teacher Commission (%)</label>
              <input
                style={S.input}
                type="number"
                min="0"
                max="100"
                value={form.commissionPercent || 0}
                onChange={(e) => set("commissionPercent", Math.min(100, Math.max(0, parseFloat(e.target.value) || 0)))}
              />
            </div>
          </>
        )}
      </div>
      {teachers.length > 0 && (
        <div style={{ fontSize: 12, color: BRAND.grey, marginBottom: 8 }}>
          Commission is paid from batch profit: (monthly revenue − teacher salary) × commission %.
        </div>
      )}
      <div style={{ ...S.formGroup, marginTop: 4 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: BRAND.grey, marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.5px" }}>Exam Target</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }} className="preview-grid">
          <div style={S.formGroup}><label style={S.formLabel}>Exam Session</label><input style={S.input} value={form.examSession || ""} onChange={(e) => set("examSession", e.target.value)} placeholder="e.g. Oct/Nov 2026" /></div>
          <div style={S.formGroup}><label style={S.formLabel}>Exam Date</label><input style={S.input} type="date" value={fmtDateInput(form.examDate)} onChange={(e) => set("examDate", e.target.value)} /></div>
        </div>
        <div style={{ fontSize: 12, color: BRAND.grey }}>Invoices stop after the exam month. Leave blank for open-ended batches.</div>
      </div>
      <div style={{ display: "flex", gap: 12, justifyContent: "flex-end", marginTop: 12 }}>
        <button style={S.btn("secondary")} onClick={onClose} disabled={saving}>Cancel</button>
        <button style={S.btn("primary")} onClick={submit} disabled={saving}>{saving ? "Saving…" : "Save Batch"}</button>
      </div>
    </Modal>
  );
}

// ─── THE PAGE ────────────────────────────────────────────────────
export function StudentsPage({
  students, batches, teachers = [],
  onSaveStudent, onDeleteStudent, onAddStrike, onRemoveStrike,
  onSaveBatch, onDeleteBatch,
  receiptRenderer,
  revenueByBatch,
}) {
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("Active");
  // Which batch's student window is open (batch id, or "__none" for the unassigned group).
  const [openBatchKey, setOpenBatchKey] = useState(null);
  // Which batch a new student is being added to. null = not adding. Students are only
  // ever created from inside a batch window, so the batch is implied and never picked.
  const [addingToBatchKey, setAddingToBatchKey] = useState(null);
  const [editingStudent, setEditingStudent] = useState(null);
  const [showAddBatch, setShowAddBatch] = useState(false);
  const [editingBatch, setEditingBatch] = useState(null);

  const matches = (s) => {
    if (filterStatus !== "all" && s.status !== filterStatus) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      s.name.toLowerCase().includes(q) ||
      (s.nameBurmese || "").toLowerCase().includes(q) ||
      (s.phone || "").toLowerCase().includes(q) ||
      (s.invoiceContact || "").toLowerCase().includes(q) ||
      (s.email || "").toLowerCase().includes(q)
    );
  };

  // Every batch, plus a trailing bucket for students who aren't in one.
  const groups = useMemo(() => {
    const visible = students.filter(matches);
    const byBatch = batches.map((b) => ({
      batch: b,
      students: visible.filter((s) => s.batchId === b.id).sort((a, b2) => a.name.localeCompare(b2.name)),
    }));
    const batchIds = new Set(batches.map((b) => b.id));
    const orphans = visible.filter((s) => !s.batchId || !batchIds.has(s.batchId));
    if (orphans.length) byBatch.push({ batch: null, students: orphans.sort((a, b2) => a.name.localeCompare(b2.name)) });
    return byBatch;
  }, [students, batches, search, filterStatus]);

  // Resolved live so the open window follows edits, searches and filter changes.
  const openGroup = openBatchKey
    ? groups.find((g) => (g.batch ? g.batch.id : "__none") === openBatchKey)
    : null;

  // Closing is left to the form: a newly registered student shows its receipt in the same
  // window, and unmounting here would take that receipt with it.
  async function saveStudent(form) {
    return onSaveStudent(form);
  }

  async function deleteStudent(id) {
    if (!confirm("Remove this student?")) return;
    try {
      await onDeleteStudent(id);
    } catch (err) {
      alert(err.message);
    }
  }

  async function saveBatch(form) {
    try {
      await onSaveBatch(form);
      setShowAddBatch(false);
      setEditingBatch(null);
    } catch (err) {
      alert(err.message);
    }
  }

  async function deleteBatch(id) {
    if (students.some((s) => s.batchId === id)) {
      return alert("Cannot delete a batch that still has students in it.");
    }
    if (!confirm("Delete this batch?")) return;
    try {
      await onDeleteBatch(id);
    } catch (err) {
      alert(err.message);
    }
  }

  return (
    <div>
      <div style={S.pageTitle} className="page-title">Students</div>
      <div style={S.pageDesc}>Every batch and who is in it — open a batch for full student details</div>

      <div style={S.toolbar} className="toolbar">
        <div style={S.searchBox}>
          <span style={S.searchIcon}>🔍</span>
          <input style={S.searchInput} placeholder="Search students..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select style={{ ...S.select, width: "auto", minWidth: 130 }} value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
          <option value="Active">Active</option>
          <option value="all">All Status</option>
          <option value="Inactive">Inactive</option>
          <option value="Expelled">Expelled</option>
        </select>
        <button style={S.btn("gold")} onClick={() => setShowAddBatch(true)}>➕ Add Batch</button>
      </div>

      {groups.length === 0 ? (
        <div style={S.card} className="card">
          <EmptyState
            icon="🎓"
            message="No batches yet — create one to start placing students"
            action={<button style={S.btn("gold")} onClick={() => setShowAddBatch(true)}>Add First Batch</button>}
          />
        </div>
      ) : (
        // Batches stay as squares in a grid; pressing one raises a large window over the page.
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 20, alignItems: "start" }}>
          {groups.map(({ batch, students: batchStudents }) => {
            const key = batch ? batch.id : "__none";
            const activeInBatch = batchStudents.filter((s) => s.status === "Active").length;
            const pct = batch && batch.maxStudents ? Math.round((activeInBatch / batch.maxStudents) * 100) : 0;

            return (
              <div
                key={key}
                onClick={() => setOpenBatchKey(key)}
                title="Open this batch"
                style={{ ...S.card, marginBottom: 0, cursor: "pointer", transition: "box-shadow 0.15s, border-color 0.15s" }}
                className="card"
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = BRAND.gold;
                  e.currentTarget.style.boxShadow = "0 2px 12px rgba(0,0,0,0.08)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = BRAND.border;
                  e.currentTarget.style.boxShadow = "none";
                }}
              >
                <div style={{ ...S.flexBetween, marginBottom: 12, gap: 8 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 16 }}>{batch ? batch.name : "No batch assigned"}</div>
                    <div style={{ fontSize: 12, color: BRAND.grey }}>
                      {batch ? `${batch.syllabus} • ${batch.days}` : "These students are not in a batch yet"}
                    </div>
                  </div>
                  {/* Batch actions must not open the window */}
                  {batch && (
                    <div style={{ display: "flex", gap: 4, flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
                      <button style={S.btn("small")} onClick={() => setEditingBatch(batch)}>Edit</button>
                      <button style={{ ...S.btn("small"), color: BRAND.red }} onClick={() => deleteBatch(batch.id)}>🗑️</button>
                    </div>
                  )}
                </div>

                {batch && (
                  <>
                    <div style={{ ...S.flexBetween, marginBottom: 6 }}>
                      <span style={{ fontSize: 13 }}>{activeInBatch} / {batch.maxStudents} students</span>
                      <span style={{ fontSize: 13, fontWeight: 600, color: pct >= 90 ? BRAND.red : BRAND.green }}>{pct}%</span>
                    </div>
                    <div style={{ height: 8, borderRadius: 4, background: BRAND.greyLight, overflow: "hidden", marginBottom: 16 }}>
                      <div style={{ height: "100%", width: `${Math.min(pct, 100)}%`, background: pct >= 90 ? BRAND.red : pct >= 70 ? BRAND.gold : BRAND.green, borderRadius: 4 }} />
                    </div>
                    <div style={{ fontSize: 13, color: BRAND.grey }}>
                      Fee: <strong style={{ color: BRAND.charcoal }}>{fmtMMK(batch.fee)}</strong>/month
                    </div>
                    {revenueByBatch && (
                      <div style={{ fontSize: 13, color: BRAND.grey, marginTop: 4 }}>
                        Revenue: <strong style={{ color: BRAND.green }}>{fmtMMK(revenueByBatch[batch.id] || 0)}</strong>/month
                      </div>
                    )}
                    {batch.examDate && (
                      <div style={{ fontSize: 12, color: BRAND.grey, marginTop: 4 }}>Exam: {fmtDate(batch.examDate)}</div>
                    )}
                  </>
                )}

                <div style={{ marginTop: 12, borderTop: `1px solid ${BRAND.border}`, paddingTop: 12 }}>
                  <div style={{ ...S.flexBetween, gap: 8, marginBottom: batchStudents.length ? 10 : 0 }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: BRAND.grey, textTransform: "uppercase", letterSpacing: "0.5px" }}>
                      Enrolled — {batchStudents.length}
                    </span>
                    <span style={{ fontSize: 11, color: BRAND.grey }}>⤢</span>
                  </div>

                  {batchStudents.length === 0 ? (
                    <div style={{ fontSize: 12, color: BRAND.grey }}>
                      No students {search || filterStatus !== "all" ? "match the current filter" : "in this batch yet"}.
                    </div>
                  ) : (
                    // Chips jump straight to a student; they must not open the batch window.
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }} onClick={(e) => e.stopPropagation()}>
                      {batchStudents.map((s) => (
                        <button
                          key={s.id}
                          onClick={() => setEditingStudent(s)}
                          title={`Edit ${s.name}`}
                          style={{ ...S.btn("small"), gap: 6, padding: "4px 10px", opacity: s.status === "Active" ? 1 : 0.6 }}
                        >
                          {s.name}
                          {s.strikes > 0 && <Strikes count={s.strikes} />}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* The batch window — a large panel over the page, not an inline expansion */}
      {openGroup && (
        <Modal
          title={openGroup.batch ? openGroup.batch.name : "No batch assigned"}
          onClose={() => setOpenBatchKey(null)}
          contentStyle={{ maxWidth: 1100, width: "92%", maxHeight: "90vh" }}
        >
          <div style={{ ...S.flexBetween, gap: 12, flexWrap: "wrap", marginTop: -10, marginBottom: 18, paddingBottom: 14, borderBottom: `1px solid ${BRAND.border}` }}>
            <div style={{ fontSize: 13, color: BRAND.grey }}>
              {openGroup.batch
                ? [
                    `${openGroup.batch.syllabus} • ${openGroup.batch.days}`,
                    `${openGroup.students.filter((s) => s.status === "Active").length} / ${openGroup.batch.maxStudents} students`,
                    `${fmtMMK(openGroup.batch.fee)}/month`,
                    openGroup.batch.examDate ? `Exam ${fmtDate(openGroup.batch.examDate)}` : null,
                  ].filter(Boolean).join("  •  ")
                : "These students are not in a batch yet"}
            </div>
            <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
              <button style={S.btn("primary")} onClick={() => setAddingToBatchKey(openBatchKey)}>
                ➕ Add Student
              </button>
              {openGroup.batch && (
                <button style={S.btn("small")} onClick={() => setEditingBatch(openGroup.batch)}>Edit batch</button>
              )}
            </div>
          </div>

          {openGroup.students.length === 0 ? (
            <EmptyState
              icon="🎓"
              message={search || filterStatus !== "all"
                ? "No students in this batch match the current filter"
                : "No students in this batch yet"}
              action={
                <button style={S.btn("primary")} onClick={() => setAddingToBatchKey(openBatchKey)}>
                  ➕ Add Student
                </button>
              }
            />
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 16 }}>
              {openGroup.students.map((s) => (
                <StudentDetailCard
                  key={s.id}
                  student={s}
                  batch={openGroup.batch}
                  onEdit={setEditingStudent}
                  onDelete={deleteStudent}
                  onAddStrike={onAddStrike}
                  onRemoveStrike={onRemoveStrike}
                />
              ))}
            </div>
          )}
        </Modal>
      )}

      {(addingToBatchKey !== null || editingStudent) && (
        <StudentForm
          student={editingStudent}
          batches={batches}
          // New students inherit the batch whose window they were added from, so the form
          // shows it as fixed rather than offering a picker.
          lockedBatchId={editingStudent ? undefined : addingToBatchKey === "__none" ? "" : addingToBatchKey}
          receiptRenderer={receiptRenderer}
          onSave={saveStudent}
          onClose={() => { setAddingToBatchKey(null); setEditingStudent(null); }}
        />
      )}

      {(showAddBatch || editingBatch) && (
        <BatchForm
          batch={editingBatch}
          teachers={teachers}
          onSave={saveBatch}
          onClose={() => { setShowAddBatch(false); setEditingBatch(null); }}
        />
      )}
    </div>
  );
}
