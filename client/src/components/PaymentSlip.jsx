// Shared payment-slip UI — one implementation used by every role's shell (TitanSMS.jsx and
// OwnerSMS.jsx), the same arrangement as StudentsBatches.jsx.
//
// MarkPaidModal stands between "Mark Paid" and the API call. Recording money needs two
// things and refuses without either: the KBZPay screenshot for the transfer, and the paid
// date typed in from that screenshot. Nothing is dated from the clock — the date field
// starts empty on purpose, so it is entered deliberately every time.
//
// SlipViewer shows a screenshot already on file. Images are left out of the payment-history
// list response, so they are fetched per record when someone opens one.

import { useState, useRef, useEffect } from "react";

const BRAND = {
  crimson: "#8B1A1A",
  gold: "#C9A961",
  cream: "#FAF6F0",
  charcoal: "#1A1A1A",
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
  overlay: {
    position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.5)",
    display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16,
  },
  panel: {
    background: BRAND.white, borderRadius: 12, padding: 28, maxWidth: 560, width: "100%",
    maxHeight: "88vh", overflow: "auto",
    fontFamily: "'Crimson Pro', 'Georgia', serif", color: BRAND.charcoal,
  },
  title: { fontSize: 20, fontWeight: 700, color: BRAND.crimson },
  head: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  btn: (variant = "primary") => ({
    padding: "8px 16px", borderRadius: 6, border: "none", cursor: "pointer", fontSize: 13,
    fontWeight: 600, fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: 6,
    ...(variant === "primary" ? { background: BRAND.crimson, color: BRAND.white } : {}),
    ...(variant === "secondary" ? { background: BRAND.cream, color: BRAND.charcoal, border: `1px solid ${BRAND.border}` } : {}),
    ...(variant === "success" ? { background: BRAND.green, color: BRAND.white } : {}),
    ...(variant === "ghost" ? { background: "transparent", color: BRAND.crimson, padding: "8px 12px" } : {}),
  }),
  summary: {
    background: BRAND.cream, border: `1px solid ${BRAND.border}`, borderRadius: 8,
    padding: "12px 16px", marginBottom: 16, fontSize: 13,
  },
  label: {
    display: "block", fontSize: 12, fontWeight: 600, color: BRAND.grey, marginBottom: 6,
    textTransform: "uppercase", letterSpacing: "0.5px",
  },
  input: {
    width: "100%", padding: "9px 12px", borderRadius: 6, border: `1px solid ${BRAND.border}`,
    fontSize: 14, fontFamily: "inherit", background: BRAND.white, boxSizing: "border-box",
  },
  dropZone: (active) => ({
    border: `2px dashed ${active ? BRAND.crimson : BRAND.border}`, borderRadius: 10,
    background: active ? BRAND.redLight : BRAND.greyLight, padding: "26px 20px",
    textAlign: "center", cursor: "pointer", transition: "all 0.15s",
  }),
  row: { display: "flex", justifyContent: "space-between", gap: 16, padding: "7px 0", fontSize: 13, borderBottom: `1px solid ${BRAND.border}` },
  rowLabel: { color: BRAND.grey, whiteSpace: "nowrap" },
  rowValue: { fontWeight: 600, textAlign: "right", wordBreak: "break-word" },
  note: (tone) => ({
    display: "flex", gap: 8, alignItems: "flex-start", fontSize: 12.5, borderRadius: 8,
    padding: "10px 12px", marginTop: 12, lineHeight: 1.45,
    ...(tone === "error" ? { background: BRAND.redLight, color: BRAND.red } : {}),
    ...(tone === "warn" ? { background: BRAND.orangeLight, color: BRAND.orange } : {}),
    ...(tone === "info" ? { background: BRAND.blueLight, color: BRAND.blue } : {}),
  }),
  actions: { display: "flex", gap: 12, justifyContent: "flex-end", marginTop: 20, flexWrap: "wrap" },
};

const fmtMMK = (n) => new Intl.NumberFormat("en-US").format(n) + " MMK";
export const fmtSlipDate = (d) =>
  d ? new Date(d + "T12:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—";
const today = () => new Date().toISOString().split("T")[0];

// ─── Attaching an image ──────────────────────────────────────────
const MAX_FILE_BYTES = 12 * 1024 * 1024;
// Big enough to stay legible as evidence, small enough that a few hundred of them are not a
// burden on the database — a phone screenshot lands around 60-150 KB once re-encoded.
const STORED_MAX_EDGE = 1400;
const STORED_QUALITY = 0.85;

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("That file could not be opened as an image.")); };
    img.src = url;
  });
}

// Re-encodes the screenshot as a JPEG small enough to travel in the mark-paid request body.
async function toStoredImage(file) {
  if (!file.type.startsWith("image/")) {
    throw new Error("Attach the KBZPay slip as an image — a screenshot or a saved receipt.");
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new Error("That image is too large. A phone screenshot of the receipt is all that is needed.");
  }
  const img = await loadImage(file);
  const longest = Math.max(img.naturalWidth, img.naturalHeight);
  const scale = longest > STORED_MAX_EDGE ? STORED_MAX_EDGE / longest : 1;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.naturalWidth * scale);
  canvas.height = Math.round(img.naturalHeight * scale);
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingQuality = "high";
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", STORED_QUALITY);
}

function Field({ label, value }) {
  if (!value && value !== 0) return null;
  return (
    <div style={S.row}>
      <span style={S.rowLabel}>{label}</span>
      <span style={S.rowValue}>{value}</span>
    </div>
  );
}

// ─── THE TWO THINGS A PAYMENT NEEDS ──────────────────────────────
// The paid date and the KBZPay screenshot, as a pair of fields. Used both by the mark-paid
// dialog and by the student registration form, so the two ask for evidence identically.
//
// `value`    — { paidDate, image, filename }; start from emptySlipPayment().
// `onChange` — given the next value. The parent owns the state and gates its own submit
//              with isSlipComplete(value); attachment errors are reported here.
export const emptySlipPayment = () => ({ paidDate: "", image: null, filename: "" });
export const isSlipComplete = (v) => !!(v && v.paidDate && v.image);

export function SlipFields({ value, onChange, disabled, dateHint, dropHint }) {
  const [error, setError] = useState(null);
  const [reading, setReading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef(null);

  async function attach(file) {
    setError(null);
    setReading(true);
    try {
      const image = await toStoredImage(file);
      onChange({ ...value, image, filename: file.name || "slip.jpg" });
    } catch (err) {
      onChange({ ...value, image: null, filename: "" });
      setError(err.message);
    } finally {
      setReading(false);
    }
  }

  return (
    <div>
      <label style={S.label} htmlFor="slip-paid-date">Paid date *</label>
      <input
        id="slip-paid-date"
        type="date"
        style={S.input}
        value={value.paidDate}
        max={today()}
        disabled={disabled}
        onChange={(e) => onChange({ ...value, paidDate: e.target.value })}
      />
      <div style={{ fontSize: 12, color: BRAND.grey, marginTop: 6, marginBottom: 18 }}>
        {dateHint || "Enter the transaction date shown on the KBZPay slip."}
      </div>

      <label style={S.label}>KBZPay slip *</label>
      {value.image ? (
        <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
          <img
            src={value.image}
            alt="Attached KBZPay slip"
            style={{ width: 110, borderRadius: 6, border: `1px solid ${BRAND.border}`, display: "block" }}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, wordBreak: "break-all" }}>{value.filename}</div>
            <div style={{ fontSize: 12, color: BRAND.grey, marginTop: 4 }}>
              Attached · {Math.round(value.image.length / 1024)} KB
            </div>
            <button
              style={{ ...S.btn("secondary"), marginTop: 10 }}
              onClick={() => fileRef.current && fileRef.current.click()}
              disabled={disabled}
            >
              Replace
            </button>
          </div>
        </div>
      ) : (
        <div
          style={S.dropZone(dragging)}
          onClick={() => !reading && !disabled && fileRef.current && fileRef.current.click()}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            const file = e.dataTransfer.files && e.dataTransfer.files[0];
            if (file && !disabled) attach(file);
          }}
        >
          {reading ? (
            <div style={{ fontSize: 13, fontWeight: 600 }}>Attaching…</div>
          ) : (
            <>
              <div style={{ fontSize: 30, marginBottom: 6 }}>🧾</div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>Drop the KBZPay screenshot here, or click to choose</div>
              <div style={{ fontSize: 12, color: BRAND.grey, marginTop: 6 }}>
                {dropHint || "Kept with the payment and viewable later under Transactions."}
              </div>
            </>
          )}
        </div>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={(e) => {
          const file = e.target.files && e.target.files[0];
          e.target.value = "";
          if (file) attach(file);
        }}
      />

      {error && <div style={S.note("error")}><span>⚠️</span><div>{error}</div></div>}
    </div>
  );
}

// What is still missing, said plainly — the same prompt wherever a payment is recorded.
export function SlipMissingNote({ value }) {
  if (isSlipComplete(value)) return null;
  return (
    <div style={S.note("info")}>
      <span>ℹ️</span>
      <div>
        {!value.image && !value.paidDate
          ? "Enter the paid date and attach the KBZPay slip to continue."
          : !value.image
          ? "Attach the KBZPay slip to continue."
          : "Enter the paid date from the slip to continue."}
      </div>
    </div>
  );
}

// ─── MARK PAID ───────────────────────────────────────────────────
// `charges`   — the fees this one payment settles (one row, or a bulk selection).
// `onConfirm` — receives { paidDate, slip } and does the recording; may reject with a message.
export function MarkPaidModal({ charges, onCancel, onConfirm }) {
  const [payment, setPayment] = useState(emptySlipPayment);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const total = charges.reduce((sum, c) => sum + c.amount, 0);
  const ready = isSlipComplete(payment) && !submitting;

  async function confirm() {
    if (!ready) return;
    setSubmitting(true);
    try {
      await onConfirm({
        paidDate: payment.paidDate,
        slip: { image: payment.image, filename: payment.filename },
      });
    } catch (err) {
      setError(err.message);
      setSubmitting(false);
    }
  }

  return (
    <div style={S.overlay} onClick={submitting ? undefined : onCancel}>
      <div style={S.panel} onClick={(e) => e.stopPropagation()}>
        <div style={S.head}>
          <div style={S.title}>Record payment</div>
          <button style={S.btn("ghost")} onClick={onCancel} disabled={submitting}>✕</button>
        </div>

        <div style={S.summary}>
          {charges.length === 1 ? (
            <>
              <div style={{ fontWeight: 700 }}>{charges[0].studentName}</div>
              <div style={{ color: BRAND.grey }}>
                {charges[0].periodStart
                  ? charges[0].periodEnd
                    ? `Month from ${fmtSlipDate(charges[0].periodStart)}${charges[0].label ? ` · ${charges[0].label}` : ""}`
                    : `${charges[0].label || "Payment"} · due ${fmtSlipDate(charges[0].periodStart)}`
                  : charges[0].invoiceNumber}
                {" · "}
                {fmtMMK(charges[0].amount)}
              </div>
            </>
          ) : (
            <>
              <div style={{ fontWeight: 700 }}>{charges.length} fees · {fmtMMK(total)}</div>
              <div style={{ color: BRAND.grey }}>
                {[...new Set(charges.map((c) => c.studentName))].join(", ")}
              </div>
            </>
          )}
        </div>

        <SlipFields
          value={payment}
          onChange={(next) => { setError(null); setPayment(next); }}
          disabled={submitting}
        />

        {error && <div style={S.note("error")}><span>⚠️</span><div>{error}</div></div>}
        {!error && <SlipMissingNote value={payment} />}

        <div style={S.actions}>
          <button style={S.btn("secondary")} onClick={onCancel} disabled={submitting}>Cancel</button>
          <button
            style={{ ...S.btn("success"), opacity: ready ? 1 : 0.5, cursor: ready ? "pointer" : "not-allowed" }}
            onClick={confirm}
            disabled={!ready}
          >
            {submitting
              ? "Recording…"
              : payment.paidDate
              ? `Mark paid · ${fmtSlipDate(payment.paidDate)}`
              : "Mark paid"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── VIEW A FILED SLIP ───────────────────────────────────────────
// `slip` shows one already in hand; otherwise `loadSlip` fetches it for the payment's id.
export function SlipViewer({ payment, slip: given, loadSlip, onClose }) {
  const [slip, setSlip] = useState(given || null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (given || !loadSlip) return undefined;
    let live = true;
    loadSlip(payment.id)
      .then((s) => live && setSlip(s))
      .catch((err) => live && setError(err.message));
    return () => { live = false; };
  }, [payment.id, loadSlip, given]);

  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={S.panel} onClick={(e) => e.stopPropagation()}>
        <div style={S.head}>
          <div style={S.title}>Payment slip</div>
          <button style={S.btn("ghost")} onClick={onClose}>✕</button>
        </div>

        <div style={S.summary}>
          <div style={{ fontWeight: 700 }}>{payment.studentName}</div>
          <div style={{ color: BRAND.grey }}>
            {payment.invoiceNumber} · {fmtMMK(payment.amount)} · paid {fmtSlipDate(payment.paidDate)}
          </div>
        </div>

        {error && <div style={S.note("error")}><span>⚠️</span><div>{error}</div></div>}
        {!slip && !error && <div style={{ fontSize: 13, color: BRAND.grey }}>Loading the slip…</div>}

        {slip && (
          <>
            <Field label="File" value={slip.filename} />
            <Field
              label="Attached"
              value={slip.attachedAt ? new Date(slip.attachedAt).toLocaleString("en-GB") : ""}
            />
            <img
              src={slip.image}
              alt={`KBZPay slip for ${payment.invoiceNumber}`}
              style={{ width: "100%", marginTop: 16, borderRadius: 8, border: `1px solid ${BRAND.border}` }}
            />
          </>
        )}

        <div style={S.actions}>
          <button style={S.btn("secondary")} onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
