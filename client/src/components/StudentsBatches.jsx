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
//   readOnly        - the operator view: nothing can be added, edited or removed, and fees,
//                     billing and payment plans are not shown. The server already leaves
//                     those fields out for operators; this keeps the page from drawing
//                     empty slots for them.

import { useState, useEffect, useMemo, Fragment } from "react";
import { SlipFields, SlipMissingNote, emptySlipPayment, isSlipComplete } from "./PaymentSlip";
import { planSummary } from "../paymentPlan";
import { today } from "../dates";
import { getNewStudentsPerMonth } from "../api";

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

const fmtMMK = (n) => new Intl.NumberFormat("en-US").format(n) + " MMK";
const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—";
const fmtDateInput = (d) => (d ? new Date(d).toISOString().split("T")[0] : "");
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
// One student as seen from one of their batches: the billing shown is that batch's, and any
// other batches they attend are named underneath.
function StudentDetailCard({ student, enrollment, batch, otherBatches, readOnly, onEdit, onDelete, onAddStrike, onRemoveStrike }) {
  // Exactly these rows, always shown in this order — a missing one reads "—" rather than
  // vanishing, so every card lines up and a gap is obvious. Everything else lives in Edit.
  // Read-only (operator) cards show contact details only; billing never reaches them.
  const billing = enrollment.billingStartDate || enrollment.enrolledDate;
  const rows = readOnly
    ? [
        ["Student Telegram", student.telegram],
        ["Parent Phone", student.parentPhone],
      ]
    : [
        ["Student Telegram", student.telegram],
        ["Guardian fb contact", student.invoiceContact],
        ["Billing Date", billing ? fmtDate(billing) : null],
        ["Payment Plan", planSummary(enrollment, batch)],
      ];
  if (otherBatches.length) rows.push(["Also in", otherBatches.join(", ")]);
  const left = enrollment.status === "Inactive";

  return (
    <div style={{ border: `1px solid ${BRAND.border}`, borderRadius: 10, padding: 16, background: BRAND.white, opacity: left ? 0.75 : 1 }}>
      <div style={{ ...S.flexBetween, gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15 }}>{student.name}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
            <Badge stage={left && student.status === "Active" ? "Inactive" : student.status} />
            {left && student.status === "Active" && <span style={{ fontSize: 11, color: BRAND.grey }}>Left this batch</span>}
            {!readOnly && <Strikes count={student.strikes} />}
          </div>
        </div>
        {!readOnly && (
          <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
            <button style={S.btn("small")} onClick={() => onEdit(student)}>✏️ Edit</button>
            <button style={{ ...S.btn("small"), color: BRAND.red }} onClick={() => onDelete(student.id)}>🗑️</button>
          </div>
        )}
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

      {!readOnly && (
        <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 11, color: BRAND.grey, textTransform: "uppercase", letterSpacing: "0.5px" }}>Strikes</span>
          <button style={{ ...S.btn("small"), padding: "2px 8px" }} onClick={() => onAddStrike(student.id).catch((e) => alert(e.message))}>+</button>
          {student.strikes > 0 && (
            <button style={{ ...S.btn("small"), padding: "2px 8px" }} onClick={() => onRemoveStrike(student.id).catch((e) => alert(e.message))}>−</button>
          )}
        </div>
      )}
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
// A student is their details plus the batches they attend. Joining a batch is also its first
// payment, so the form asks for the KBZPay slip and the date off it whenever a batch is added
// — at registration or later. That date is also the day they joined; it is not asked twice.
//
// After saving, the first-payment receipts are shown with "Edit details": correcting the
// entry updates the student and those same receipts, which is what Payment History shows.
//
// receiptRenderer is optional: shells that can show payment documents pass one.

let enrollmentSeq = 0;
const newEnrollment = (batchId = "") => ({
  key: `new-${++enrollmentSeq}`,
  isNew: true,
  batchId,
  billingStartDate: "",
  customFee: null,
  paymentPlan: EMPTY_PLAN,
  status: "Active",
});
const normName = (n) => (n || "").toLowerCase().replace(/\s+/g, " ").trim();

function formFrom(student, addBatchId) {
  if (!student) {
    return {
      name: "", nameBurmese: "", telegram: "", invoiceContact: "", parentPhone: "", notes: "",
      subject: "Computer Science", status: "Active", strikes: 0,
      enrollments: [newEnrollment()],
    };
  }
  const enrollments = (student.enrollments || []).map((e) => ({ ...e, key: e.id, isNew: false, paymentPlan: e.paymentPlan || EMPTY_PLAN }));
  if (addBatchId !== undefined && !enrollments.some((e) => e.batchId === addBatchId)) enrollments.push(newEnrollment(addBatchId));
  return { ...student, enrollments };
}

// What registration collects for one batch: its first month, or its first installment.
function firstAmountOf(e, batches) {
  const plan = e.paymentPlan || EMPTY_PLAN;
  if (plan.kind === "installments") return Number(plan.installments?.[0]?.amount) || 0;
  if (e.customFee != null) return e.customFee;
  return batches.find((b) => b.id === e.batchId)?.fee ?? 0;
}

function EnrollmentCard({ enrollment: e, index, batches, takenBatchIds, anchor, onChange, onRemove, disabled }) {
  const set = (k, v) => onChange({ ...e, [k]: v });
  const batch = batches.find((b) => b.id === e.batchId);
  const left = e.status === "Inactive";
  return (
    <div style={{ border: `1px solid ${e.isNew ? BRAND.gold : BRAND.border}`, borderRadius: 10, padding: 16, marginBottom: 12, background: left ? BRAND.greyLight : BRAND.white }}>
      <div style={{ ...S.flexBetween, gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        <div style={{ fontSize: 13, fontWeight: 700 }}>
          {e.isNew ? (index === 0 ? "Batch" : "New batch") : `Batch ${index + 1}`}
          {!e.isNew && e.enrolledDate && <span style={{ fontWeight: 400, color: BRAND.grey }}> · joined {fmtDate(e.enrolledDate)}</span>}
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          {!e.isNew && (
            <select style={{ ...S.select, width: "auto", padding: "4px 8px", fontSize: 12 }} value={e.status} onChange={(ev) => set("status", ev.target.value)} disabled={disabled}>
              <option value="Active">Attending</option>
              <option value="Inactive">Left this batch</option>
            </select>
          )}
          {onRemove && (
            <button type="button" style={{ ...S.btn("small"), color: BRAND.red }} onClick={onRemove} disabled={disabled} title="Remove this batch">✕</button>
          )}
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }} className="preview-grid">
        <div style={S.formGroup}>
          <label style={S.formLabel}>Batch *</label>
          <select style={S.select} value={e.batchId} onChange={(ev) => set("batchId", ev.target.value)} disabled={disabled}>
            <option value="">— No batch —</option>
            {batches.map((b) => (
              <option key={b.id} value={b.id} disabled={b.id !== e.batchId && takenBatchIds.has(b.id)}>{b.name}</option>
            ))}
          </select>
        </div>
        <div style={S.formGroup}>
          <label style={S.formLabel}>Billing date</label>
          <input style={S.input} type="date" value={fmtDateInput(e.billingStartDate)} onChange={(ev) => set("billingStartDate", ev.target.value)} disabled={disabled} />
          {e.isNew && !e.billingStartDate && (
            <div style={{ fontSize: 11, color: BRAND.grey, marginTop: 4 }}>Leave empty to bill from the paid date.</div>
          )}
        </div>
      </div>
      {!left && (
        <PaymentPlanFields
          plan={e.paymentPlan || EMPTY_PLAN}
          anchor={anchor}
          customFee={e.customFee}
          batchFee={batch?.fee ?? 0}
          onPlanChange={(next) => set("paymentPlan", next)}
          onFeeChange={(fee) => set("customFee", fee)}
          disabled={disabled}
        />
      )}
    </div>
  );
}

function StudentFormBody({ student, correcting, batches, allStudents, initialBatchId, addBatchId, onSave, onSaved, onClose, onSwitchToExisting }) {
  const [form, setForm] = useState(() => {
    const f = formFrom(student, addBatchId);
    if (!student && initialBatchId !== undefined) f.enrollments[0].batchId = initialBatchId;
    else if (!student) f.enrollments[0].batchId = batches[0]?.id || "";
    return f;
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [payment, setPayment] = useState(() => (correcting ? { ...emptySlipPayment(), paidDate: correcting.paidDate } : emptySlipPayment()));
  const isNew = !student;

  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));
  // A billing date left empty at registration was saved as the paid date. Correcting the paid
  // date moves those billing dates with it; one chosen on purpose stays where it is.
  function changePayment(next) {
    if (correcting && next.paidDate && next.paidDate !== payment.paidDate) {
      setForm((p) => ({
        ...p,
        enrollments: p.enrollments.map((e) =>
          correcting.enrollmentIds.includes(e.id) && fmtDateInput(e.billingStartDate) === payment.paidDate
            ? { ...e, billingStartDate: next.paidDate }
            : e
        ),
      }));
    }
    setPayment(next);
  }
  const setEnrollment = (key, next) => setForm((p) => ({ ...p, enrollments: p.enrollments.map((e) => (e.key === key ? next : e)) }));
  const removeEnrollment = (key) => setForm((p) => ({ ...p, enrollments: p.enrollments.filter((e) => e.key !== key) }));
  const addEnrollment = () => {
    const taken = new Set(form.enrollments.map((e) => e.batchId));
    setForm((p) => ({ ...p, enrollments: [...p.enrollments, newEnrollment(batches.find((b) => !taken.has(b.id))?.id || "")] }));
  };

  // A new batch, or the batches whose receipts are being corrected, are paid for here.
  const paying = form.enrollments.filter((e) => e.isNew || (correcting && correcting.enrollmentIds.includes(e.id)));
  const needsPayment = paying.length > 0;
  const paymentReady = correcting ? !!payment.paidDate : isSlipComplete(payment);
  const firstTotal = paying.reduce((sum, e) => sum + firstAmountOf(e, batches), 0);
  const anchorOf = (e) => fmtDateInput(e.billingStartDate) || (e.isNew ? payment.paidDate : fmtDateInput(e.enrolledDate)) || today();

  // Typing the name of someone already registered offers their record instead of a new one.
  const sameName = isNew && normName(form.name).length > 1
    ? (allStudents || []).filter((s) => normName(s.name) === normName(form.name))
    : [];
  const batchName = (id) => batches.find((b) => b.id === id)?.name || "No batch";

  async function handleSave() {
    setError(null);
    if (!form.name.trim()) return setError("Enter the student's name.");
    if (form.enrollments.length === 0) return setError("Add at least one batch.");
    const ids = form.enrollments.map((e) => e.batchId);
    if (new Set(ids).size !== ids.length) return setError("The same batch is listed twice.");
    for (const e of form.enrollments) {
      const bad = e.status !== "Inactive" && planError(e.paymentPlan || EMPTY_PLAN, anchorOf(e));
      if (bad) return setError(`${batchName(e.batchId)}: ${bad}`);
    }
    if (needsPayment && !paymentReady) {
      return setError(correcting ? "Enter the paid date from the slip." : "Enter the paid date and attach the KBZPay slip for the first payment.");
    }

    setSaving(true);
    try {
      const enrollments = form.enrollments.map((e) => {
        const plan = e.paymentPlan || EMPTY_PLAN;
        const anchor = anchorOf(e);
        // Only the chosen kind's details are sent; the first installment always sits on the
        // billing date.
        const paymentPlan = plan.kind === "installments"
          ? { kind: "installments", months: null, installments: plan.installments.map((inst, i) => ({ amount: Number(inst.amount), dueDate: i === 0 ? anchor : inst.dueDate })) }
          : { kind: "monthly", months: plan.months ?? null, installments: [] };
        return {
          id: e.isNew ? undefined : e.id,
          batchId: e.batchId,
          billingStartDate: e.billingStartDate || "",
          customFee: e.customFee,
          paymentPlan,
          status: e.status,
        };
      });
      const { enrollments: _drop, key, ...profile } = form;
      const payload = { ...profile, enrollments };
      if (needsPayment) {
        payload.firstPayment = {
          paidDate: payment.paidDate,
          ...(payment.image ? { slip: { image: payment.image, filename: payment.filename } } : {}),
        };
      }
      if (correcting) payload.paymentIds = correcting.paymentIds;
      const saved = await onSave(payload, correcting ? "correct" : isNew ? "create" : "update");
      onSaved(saved);
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  const takenBatchIds = new Set(form.enrollments.map((e) => e.batchId).filter(Boolean));
  const title = correcting ? "Correct registration" : isNew ? "Add Student" : "Edit Student";

  return (
    <Modal title={title} onClose={onClose} contentStyle={{ maxWidth: 640 }}>
      {correcting && (
        <div style={{ ...S.card, background: BRAND.cream, padding: "10px 14px", fontSize: 13, marginBottom: 16 }}>
          Fix anything entered wrongly. Saving updates the student and the receipt — Payment History shows the corrected one.
        </div>
      )}

      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>Student</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }} className="preview-grid">
        <div style={S.formGroup}><label style={S.formLabel}>Full Name (English) *</label><input style={S.input} value={form.name} onChange={(e) => set("name", e.target.value)} autoFocus={isNew} /></div>
        <div style={S.formGroup}><label style={S.formLabel}>Burmese Name</label><input style={S.input} value={form.nameBurmese || ""} onChange={(e) => set("nameBurmese", e.target.value)} /></div>
      </div>
      {sameName.length > 0 && (
        <div style={{ ...S.card, background: BRAND.blueLight, borderColor: `${BRAND.blue}33`, padding: "10px 14px", fontSize: 13, marginTop: -6, marginBottom: 16 }}>
          {sameName.map((s) => (
            <div key={s.id} style={{ ...S.flexBetween, gap: 8, flexWrap: "wrap" }}>
              <span>
                <strong>{s.name}</strong> is already a student — {(s.enrollments || []).map((e) => batchName(e.batchId)).join(", ")}
                {s.invoiceContact ? ` · contact ${s.invoiceContact}` : ""}
              </span>
              <button type="button" style={S.btn("small")} onClick={() => onSwitchToExisting(s, form.enrollments[0]?.batchId)}>
                Add the batch to this student
              </button>
            </div>
          ))}
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }} className="preview-grid">
        <div style={S.formGroup}><label style={S.formLabel}>Telegram</label><input style={S.input} value={form.telegram || ""} onChange={(e) => set("telegram", e.target.value)} placeholder="@username" /></div>
        <div style={S.formGroup}>
          <label style={S.formLabel}>Guardian fb contact</label>
          <input style={S.input} value={form.invoiceContact || ""} onChange={(e) => set("invoiceContact", e.target.value)} placeholder="Who finance sends the invoice to" />
        </div>
        <div style={S.formGroup}><label style={S.formLabel}>Parent Phone</label><input style={S.input} value={form.parentPhone || ""} onChange={(e) => set("parentPhone", e.target.value)} /></div>
        {!isNew && !correcting && (
          <div style={S.formGroup}>
            <label style={S.formLabel}>Status</label>
            <select style={S.select} value={form.status} onChange={(e) => set("status", e.target.value)}>
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
              <option value="Expelled">Expelled</option>
            </select>
          </div>
        )}
      </div>
      <div style={S.formGroup}><label style={S.formLabel}>Notes</label><textarea style={{ ...S.input, height: 52, resize: "vertical" }} value={form.notes || ""} onChange={(e) => set("notes", e.target.value)} /></div>

      <div style={{ ...S.flexBetween, marginTop: 8, marginBottom: 12 }}>
        <div style={{ fontSize: 15, fontWeight: 700 }}>Batches</div>
        <button type="button" style={S.btn("small")} onClick={addEnrollment} disabled={saving}>➕ Add another batch</button>
      </div>
      {form.enrollments.map((e, i) => (
        <EnrollmentCard
          key={e.key}
          enrollment={e}
          index={i}
          batches={batches}
          takenBatchIds={takenBatchIds}
          anchor={anchorOf(e)}
          onChange={(next) => setEnrollment(e.key, next)}
          // A batch with payments can only be left; one not yet saved can simply be taken off.
          onRemove={e.isNew && form.enrollments.length > 1 ? () => removeEnrollment(e.key) : null}
          disabled={saving}
        />
      ))}

      {needsPayment && (
        <div style={{ border: `1px solid ${BRAND.border}`, borderRadius: 10, padding: 20, marginTop: 4 }}>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>First payment</div>
          <div style={{ fontSize: 12, color: BRAND.grey, marginBottom: 16 }}>
            {paying.map((e) => `${batchName(e.batchId)} ${fmtMMK(firstAmountOf(e, batches))}`).join(" + ")}
            {paying.length > 1 ? ` = ${fmtMMK(firstTotal)}` : ""}. The paid date is also the day they join.
            {correcting ? " The slip on file is kept unless you attach a new one." : " Receipted on save."}
          </div>
          <SlipFields
            value={payment}
            onChange={changePayment}
            disabled={saving}
            dropHint={correcting ? "Only if the slip attached was the wrong one." : "Kept with the payment and viewable later under Transactions."}
          />
          {!correcting && <SlipMissingNote value={payment} />}
        </div>
      )}

      {error && <div style={{ marginTop: 12, padding: "10px 12px", borderRadius: 8, background: BRAND.redLight, color: BRAND.red, fontSize: 13 }}>⚠️ {error}</div>}

      <div style={{ display: "flex", gap: 12, justifyContent: "flex-end", marginTop: 16 }}>
        <button style={S.btn("secondary")} onClick={onClose} disabled={saving}>Cancel</button>
        <button
          style={{ ...S.btn("primary"), ...(needsPayment && !paymentReady ? { opacity: 0.5, cursor: "not-allowed" } : {}) }}
          onClick={handleSave}
          disabled={saving || (needsPayment && !paymentReady)}
        >
          {saving ? "Saving…" : correcting ? "Save & Show Receipt" : needsPayment ? "Save & Generate Receipt" : "Save Student"}
        </button>
      </div>
    </Modal>
  );
}

// The form, then the receipts it produced, then — on "Edit details" — the form again in
// correction mode, as many times as it takes.
function StudentForm({ student, batches, allStudents, initialBatchId, addBatchId, onSave, onClose, receiptRenderer, onSwitchToExisting }) {
  const [stage, setStage] = useState({ student, correcting: null, saved: null, receipts: null, round: 0 });

  function saved({ student: savedStudent, payments = [] }) {
    if (payments.length && receiptRenderer) setStage((s) => ({ ...s, saved: savedStudent, receipts: payments }));
    else onClose();
  }

  if (stage.receipts) {
    const { receipts, saved: savedStudent } = stage;
    return (
      <Modal title={`Receipt${receipts.length > 1 ? "s" : ""} — ${savedStudent.name}`} onClose={onClose}>
        {receipts.map((p, i) => (
          <div key={p.id} style={i ? { marginTop: 24, paddingTop: 24, borderTop: `1px solid ${BRAND.border}` } : undefined}>
            {receiptRenderer(p)}
          </div>
        ))}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, marginTop: 12 }}>
          <button
            style={S.btn("secondary")}
            onClick={() => setStage((s) => ({
              student: s.saved,
              correcting: {
                paymentIds: s.receipts.map((p) => p.id),
                enrollmentIds: s.receipts.map((p) => p.enrollmentId),
                paidDate: s.receipts[0].paidDate,
              },
              saved: null,
              receipts: null,
              round: s.round + 1,
            }))}
          >
            ✏️ Edit details
          </button>
          <button style={S.btn("primary")} onClick={onClose}>Done</button>
        </div>
      </Modal>
    );
  }

  return (
    <StudentFormBody
      key={stage.round}
      student={stage.student}
      correcting={stage.correcting}
      batches={batches}
      allStudents={allStudents}
      initialBatchId={initialBatchId}
      addBatchId={stage.round === 0 ? addBatchId : undefined}
      onSave={onSave}
      onSaved={saved}
      onClose={onClose}
      onSwitchToExisting={onSwitchToExisting}
    />
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

// ─── NEW STUDENTS PER MONTH ──────────────────────────────────────
// Owner and operator only: those two shells are the ones with this tab, and the server
// refuses anyone else. Loads each time the tab opens, so a student just added is counted.
// showMoney is what the owner's shell passes; the server only sends money to the owner, so
// for anyone else there is nothing here to reveal.
const fmtMonth = (month, opts = { month: "long", year: "numeric" }) => {
  const [year, m] = month.split("-").map(Number);
  return new Date(Date.UTC(year, m - 1, 1)).toLocaleDateString("en-GB", { ...opts, timeZone: "UTC" });
};
const fmtJoined = (date) =>
  new Date(`${date.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

// Only active students are billed, so only they add to the money figures.
function moneyTotals(students) {
  const active = students.filter((s) => s.status === "Active");
  const onInstallments = active.filter((s) => s.installments);
  return {
    monthly: active.reduce((sum, s) => sum + (s.monthlyFee || 0), 0),
    installmentCount: onInstallments.length,
    installmentTotal: onInstallments.reduce((sum, s) => sum + s.installments.total, 0),
  };
}

function StudentMoney({ student }) {
  const amount = { fontWeight: 700, fontSize: 14, whiteSpace: "nowrap" };
  const note = { fontSize: 12, color: BRAND.grey };
  if (student.status !== "Active") return <div style={note}>Not billed</div>;
  if (student.installments) {
    const { count, total } = student.installments;
    return (
      <>
        <div style={amount}>{fmtMMK(total)}</div>
        <div style={note}>{count === 1 ? "one payment" : `in ${count} installments`}</div>
      </>
    );
  }
  return (
    <>
      <div style={amount}>{fmtMMK(student.monthlyFee)}</div>
      <div style={note}>per month</div>
    </>
  );
}

function NewStudentBatch({ name, students, showMoney }) {
  const { monthly } = moneyTotals(students);
  return (
    <div style={{ ...S.card, padding: 0, overflow: "hidden" }}>
      <div style={{ ...S.flexBetween, gap: 12, flexWrap: "wrap", padding: "14px 20px", background: BRAND.cream, borderBottom: `1px solid ${BRAND.border}` }}>
        <div style={{ fontWeight: 700, fontSize: 15, minWidth: 0 }}>{name}</div>
        <div style={{ fontSize: 13, color: BRAND.grey }}>
          {students.length} joined{showMoney && monthly > 0 && <> · <strong style={{ color: BRAND.green }}>{fmtMMK(monthly)}</strong>/month</>}
        </div>
      </div>
      {students.map((s, i) => (
        <div key={s.id} style={{ ...S.flexBetween, gap: 16, padding: "12px 20px", borderTop: i ? `1px solid ${BRAND.border}` : "none", opacity: s.status === "Active" ? 1 : 0.75 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 15 }}>{s.name}</div>
            <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8, marginTop: 2, fontSize: 12, color: BRAND.grey }}>
              {s.nameBurmese && s.nameBurmese !== s.name && <span>{s.nameBurmese}</span>}
              <span>Joined {fmtJoined(s.enrolledDate)}</span>
              {s.existing && <span style={S.tag}>Already a student</span>}
              {s.status !== "Active" && <Badge stage={s.status} />}
            </div>
          </div>
          {showMoney && <div style={{ textAlign: "right", flexShrink: 0 }}><StudentMoney student={s} /></div>}
        </div>
      ))}
    </div>
  );
}

// New people that month — an existing student adding a batch is listed but not counted.
const newPeople = (entries) => new Set(entries.filter((s) => !s.existing).map((s) => s.studentId)).size;

export function NewStudentsPage({ showMoney = false }) {
  const [months, setMonths] = useState(null);
  const [error, setError] = useState(null);
  // Null follows the newest month, which is the current one.
  const [picked, setPicked] = useState(null);

  useEffect(() => {
    getNewStudentsPerMonth().then(setMonths).catch((err) => setError(err.message));
  }, []);

  const header = (
    <>
      <div style={S.pageTitle} className="page-title">New Students</div>
      <div style={S.pageDesc}>Who joined each month and which batch they are in</div>
    </>
  );

  if (error) return <div>{header}<div style={S.card} className="card"><div style={{ color: BRAND.red, fontSize: 14 }}>{error}</div></div></div>;
  if (!months) return <div>{header}<div style={{ color: BRAND.grey, fontSize: 14 }}>Loading…</div></div>;
  if (months.length === 0) return <div>{header}<div style={S.card} className="card"><EmptyState icon="🎓" message="No students enrolled yet" /></div></div>;

  const index = Math.max(0, months.findIndex((m) => m.month === picked));
  const { month, students } = months[index];
  const previous = months[index + 1];
  const latestWithStudents = months.find((m) => m.students.length > 0);

  // Biggest intake first; students without a batch always go last.
  const groups = Object.values(
    students.reduce((acc, s) => {
      const key = s.batchId || "__none";
      (acc[key] = acc[key] || { key, name: s.batchName || "No batch assigned", students: [] }).students.push(s);
      return acc;
    }, {})
  ).sort((a, b) => (a.key === "__none") - (b.key === "__none") || b.students.length - a.students.length || a.name.localeCompare(b.name));

  const totals = moneyTotals(students);

  return (
    <div>
      {header}

      {/* Month picker: newest first, each with its count, so the trend reads without opening any */}
      <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 8, marginBottom: 16 }}>
        {months.map((m) => {
          const active = m.month === month;
          return (
            <button
              key={m.month}
              onClick={() => setPicked(m.month)}
              aria-pressed={active}
              style={{
                flexShrink: 0, minWidth: 76, padding: "8px 12px", borderRadius: 8, cursor: "pointer", fontFamily: "inherit", textAlign: "center",
                background: active ? BRAND.crimson : BRAND.white,
                color: active ? BRAND.white : BRAND.charcoal,
                border: `1px solid ${active ? BRAND.crimson : BRAND.border}`,
              }}
            >
              <div style={{ fontSize: 12, whiteSpace: "nowrap", opacity: active ? 0.9 : 0.7 }}>{fmtMonth(m.month, { month: "short", year: "numeric" })}</div>
              <div style={{ fontSize: 20, fontWeight: 700, lineHeight: 1.2 }}>{newPeople(m.students)}</div>
            </button>
          );
        })}
      </div>

      {students.length > 0 && (
        <div style={S.statsRow}>
          <div style={S.statCard(BRAND.crimson)}>
            <div style={S.statNum}>{newPeople(students)}</div>
            <div style={S.statLabel}>New in {fmtMonth(month)}</div>
            {previous && <div style={{ fontSize: 12, color: BRAND.grey, marginTop: 6 }}>{newPeople(previous.students)} in {fmtMonth(previous.month, { month: "long" })}</div>}
            {students.some((s) => s.existing) && (
              <div style={{ fontSize: 12, color: BRAND.grey, marginTop: 2 }}>
                + {students.filter((s) => s.existing).length} existing student{students.filter((s) => s.existing).length === 1 ? "" : "s"} joined another batch
              </div>
            )}
          </div>
          {showMoney && (
            <div style={S.statCard(BRAND.green)}>
              <div style={S.statNum}>{fmtMMK(totals.monthly)}</div>
              <div style={S.statLabel}>Per month from these students</div>
              {totals.installmentCount > 0 && (
                <div style={{ fontSize: 12, color: BRAND.grey, marginTop: 6 }}>
                  Plus {fmtMMK(totals.installmentTotal)} from {totals.installmentCount} on installments
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {students.length === 0 ? (
        <div style={S.card} className="card">
          <EmptyState
            icon="🌱"
            message={`No new students in ${fmtMonth(month)} yet`}
            action={latestWithStudents && (
              <button style={S.btn("secondary")} onClick={() => setPicked(latestWithStudents.month)}>
                See {fmtMonth(latestWithStudents.month)} ({newPeople(latestWithStudents.students)})
              </button>
            )}
          />
        </div>
      ) : (
        groups.map((g) => <NewStudentBatch key={g.key} name={g.name} students={g.students} showMoney={showMoney} />)
      )}
    </div>
  );
}

// ─── SEARCH RESULTS ──────────────────────────────────────────────
// While the search box has text the batch grid gives way to the matching students, each once,
// with every batch they attend — so finding a student never means guessing their batch first.
// A batch chip opens that batch's window; Edit opens the student.
function SearchResults({ entries, batchName, readOnly, onEdit, onDelete, onOpenBatch }) {
  const byStudent = new Map();
  for (const x of entries) {
    if (!byStudent.has(x.student.id)) byStudent.set(x.student.id, x.student);
  }
  const results = [...byStudent.values()];

  if (results.length === 0) {
    return (
      <div style={S.card} className="card">
        <EmptyState icon="🔍" message="No students match that search" />
      </div>
    );
  }

  return (
    <div style={S.card} className="card">
      <div style={{ fontSize: 12, color: BRAND.grey, marginBottom: 8 }}>
        {results.length} student{results.length === 1 ? "" : "s"} found
      </div>
      {results.map((s, i) => (
        <div
          key={s.id}
          style={{ ...S.flexBetween, gap: 12, flexWrap: "wrap", padding: "12px 0", borderTop: i ? `1px solid ${BRAND.border}` : "none" }}
        >
          <div style={{ minWidth: 0, flex: "1 1 260px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontWeight: 700, fontSize: 15 }}>{s.name}</span>
              {s.nameBurmese && s.nameBurmese !== s.name && <span style={{ fontSize: 12, color: BRAND.grey }}>{s.nameBurmese}</span>}
              {s.status !== "Active" && <Badge stage={s.status} />}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
              {(s.enrollments || []).map((e) => (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => onOpenBatch(e.batchId || "__none")}
                  title="Open this batch"
                  style={{ ...S.btn("small"), padding: "3px 10px", opacity: e.status === "Inactive" ? 0.55 : 1 }}
                >
                  {batchName(e.batchId)}{e.status === "Inactive" ? " (left)" : ""}
                </button>
              ))}
            </div>
            <div style={{ fontSize: 12, color: BRAND.grey, marginTop: 6, display: "flex", gap: 14, flexWrap: "wrap" }}>
              {s.telegram && <span>Telegram {s.telegram}</span>}
              {!readOnly && s.invoiceContact && <span>Guardian {s.invoiceContact}</span>}
              {s.parentPhone && <span>Parent phone {s.parentPhone}</span>}
            </div>
          </div>
          {!readOnly && (
            <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
              <button style={S.btn("small")} onClick={() => onEdit(s)}>✏️ Edit</button>
              <button style={{ ...S.btn("small"), color: BRAND.red }} onClick={() => onDelete(s.id)}>🗑️</button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── THE PAGE ────────────────────────────────────────────────────
export function StudentsPage({
  students, batches, teachers = [],
  onSaveStudent, onDeleteStudent, onAddStrike, onRemoveStrike,
  onSaveBatch, onDeleteBatch,
  receiptRenderer,
  revenueByBatch,
  readOnly = false,
}) {
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("Active");
  // Which batch's student window is open (batch id, or "__none" for the unassigned group).
  const [openBatchKey, setOpenBatchKey] = useState(null);
  // Which batch a new student is being added to. null = not adding. Students are only
  // ever created from inside a batch window, so the batch is implied and never picked.
  const [addingToBatchKey, setAddingToBatchKey] = useState(null);
  const [editingStudent, setEditingStudent] = useState(null);
  // A batch to add when the form was switched from "new student" to an existing one.
  const [addBatchId, setAddBatchId] = useState(undefined);
  const [showAddBatch, setShowAddBatch] = useState(false);
  const [editingBatch, setEditingBatch] = useState(null);

  // A student appears in every batch they attend. In a batch they have left they count as
  // inactive there, whatever they are elsewhere.
  const statusIn = (s, e) => (s.status === "Active" && e.status === "Inactive" ? "Inactive" : s.status);
  const matches = ({ student: s, enrollment: e }) => {
    if (filterStatus !== "all" && statusIn(s, e) !== filterStatus) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      s.name.toLowerCase().includes(q) ||
      (s.nameBurmese || "").toLowerCase().includes(q) ||
      (s.parentPhone || "").toLowerCase().includes(q) ||
      (s.telegram || "").toLowerCase().includes(q) ||
      (s.invoiceContact || "").toLowerCase().includes(q)
    );
  };
  const batchName = (id) => batches.find((b) => b.id === id)?.name || "No batch";

  // Every batch, plus a trailing bucket for students who aren't in one. Each entry is one
  // student in one batch: { key, student, enrollment, status }.
  const groups = useMemo(() => {
    const entries = students
      .flatMap((s) => (s.enrollments || []).map((e) => ({ key: `${s.id}:${e.id}`, student: s, enrollment: e, status: statusIn(s, e) })))
      .filter(matches)
      .sort((a, b) => a.student.name.localeCompare(b.student.name));
    const byBatch = batches.map((b) => ({ batch: b, students: entries.filter((x) => x.enrollment.batchId === b.id) }));
    const batchIds = new Set(batches.map((b) => b.id));
    const orphans = entries.filter((x) => !x.enrollment.batchId || !batchIds.has(x.enrollment.batchId));
    if (orphans.length) byBatch.push({ batch: null, students: orphans });
    return byBatch;
  }, [students, batches, search, filterStatus]);

  // Resolved live so the open window follows edits, searches and filter changes.
  const openGroup = openBatchKey
    ? groups.find((g) => (g.batch ? g.batch.id : "__none") === openBatchKey)
    : null;

  // Closing is left to the form: a newly registered student shows its receipt in the same
  // window, and unmounting here would take that receipt with it.
  async function saveStudent(form, mode) {
    return onSaveStudent(form, mode);
  }

  // "Add the batch to this student": the new-student form becomes an edit of the existing
  // student, with the batch already added.
  function switchToExisting(student, batchId) {
    setAddingToBatchKey(null);
    setAddBatchId(batchId || "");
    setEditingStudent(student);
  }

  function closeForm() {
    setAddingToBatchKey(null);
    setEditingStudent(null);
    setAddBatchId(undefined);
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
    if (students.some((s) => (s.enrollments || []).some((e) => e.batchId === id))) {
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
        {!readOnly && <button style={S.btn("gold")} onClick={() => setShowAddBatch(true)}>➕ Add Batch</button>}
      </div>

      {search.trim() ? (
        <SearchResults
          entries={groups.flatMap((g) => g.students)}
          batchName={batchName}
          readOnly={readOnly}
          onEdit={setEditingStudent}
          onDelete={deleteStudent}
          onOpenBatch={setOpenBatchKey}
        />
      ) : groups.length === 0 ? (
        <div style={S.card} className="card">
          <EmptyState
            icon="🎓"
            message={readOnly ? "No batches yet" : "No batches yet — create one to start placing students"}
            action={!readOnly && <button style={S.btn("gold")} onClick={() => setShowAddBatch(true)}>Add First Batch</button>}
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
                  {batch && !readOnly && (
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
                    {!readOnly && (
                      <div style={{ fontSize: 13, color: BRAND.grey }}>
                        Fee: <strong style={{ color: BRAND.charcoal }}>{fmtMMK(batch.fee)}</strong>/month
                      </div>
                    )}
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
                    // Read-only chips have nowhere to jump, so they open the window instead.
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }} onClick={readOnly ? undefined : (e) => e.stopPropagation()}>
                      {batchStudents.map((s) => (
                        <button
                          key={s.key}
                          onClick={readOnly ? undefined : () => setEditingStudent(s.student)}
                          title={readOnly ? s.student.name : `Edit ${s.student.name}`}
                          style={{ ...S.btn("small"), gap: 6, padding: "4px 10px", opacity: s.status === "Active" ? 1 : 0.6 }}
                        >
                          {s.student.name}
                          {s.student.strikes > 0 && <Strikes count={s.student.strikes} />}
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
                    readOnly ? null : `${fmtMMK(openGroup.batch.fee)}/month`,
                    openGroup.batch.examDate ? `Exam ${fmtDate(openGroup.batch.examDate)}` : null,
                  ].filter(Boolean).join("  •  ")
                : "These students are not in a batch yet"}
            </div>
            {!readOnly && (
              <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                <button style={S.btn("primary")} onClick={() => setAddingToBatchKey(openBatchKey)}>
                  ➕ Add Student
                </button>
                {openGroup.batch && (
                  <button style={S.btn("small")} onClick={() => setEditingBatch(openGroup.batch)}>Edit batch</button>
                )}
              </div>
            )}
          </div>

          {openGroup.students.length === 0 ? (
            <EmptyState
              icon="🎓"
              message={search || filterStatus !== "all"
                ? "No students in this batch match the current filter"
                : "No students in this batch yet"}
              action={
                !readOnly && (
                  <button style={S.btn("primary")} onClick={() => setAddingToBatchKey(openBatchKey)}>
                    ➕ Add Student
                  </button>
                )
              }
            />
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 16 }}>
              {openGroup.students.map((s) => (
                <StudentDetailCard
                  key={s.key}
                  student={s.student}
                  enrollment={s.enrollment}
                  otherBatches={(s.student.enrollments || [])
                    .filter((e) => e.id !== s.enrollment.id && e.status !== "Inactive")
                    .map((e) => batchName(e.batchId))}
                  batch={openGroup.batch}
                  readOnly={readOnly}
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
          key={editingStudent ? `edit-${editingStudent.id}` : "new"}
          student={editingStudent}
          batches={batches}
          allStudents={students}
          // A new student starts in the batch whose window they were added from.
          initialBatchId={editingStudent ? undefined : addingToBatchKey === "__none" ? "" : addingToBatchKey}
          addBatchId={addBatchId}
          receiptRenderer={receiptRenderer}
          onSave={saveStudent}
          onClose={closeForm}
          onSwitchToExisting={switchToExisting}
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
