// Validation for an attached KBZPay payment slip.
//
// Money only gets recorded against a slip: marking an invoice paid needs one, and so does
// registering a student (that first fee is a payment like any other). Both come with a paid
// date the operator reads off the slip and types in — it is never inferred from the clock,
// so a payment entered days late is still dated when the money actually moved.

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const DATA_URL_IMAGE = /^data:image\/(png|jpe?g|webp);base64,[A-Za-z0-9+/=\s]+$/;
// A client-compressed screenshot lands around 100–200 KB; this only stops a raw camera dump.
const MAX_SLIP_CHARS = 4 * 1024 * 1024;

const str = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");

// Reads { paidDate, slip } off a request body (or any nested object shaped like one).
// Returns { slip, paidDate } or { error } — never a partially trusted mix of the two.
// `subject` names what is being paid for, so the caller's error messages stay specific.
function readSlipPayload(body, subject = "an invoice can be marked paid") {
  const slip = body && body.slip;
  if (!slip || !str(slip.image, MAX_SLIP_CHARS + 1)) {
    return { error: `A KBZPay payment slip must be attached before ${subject}.` };
  }
  const image = slip.image.trim();
  if (image.length > MAX_SLIP_CHARS) {
    return { error: "That payment slip image is too large. Attach a screenshot rather than a full-resolution photo." };
  }
  if (!DATA_URL_IMAGE.test(image)) return { error: "The payment slip must be a PNG, JPEG or WebP image." };

  const paidDate = str(body.paidDate, 10);
  // Round-tripping catches the days that do not exist: Date.parse rolls 2026-02-31 forward
  // to 3 March rather than rejecting it, which would silently move a payment.
  const roundTrip = new Date(paidDate + "T00:00:00Z");
  if (!ISO_DATE.test(paidDate) || Number.isNaN(roundTrip.getTime()) || roundTrip.toISOString().slice(0, 10) !== paidDate) {
    return { error: "Enter the paid date from the payment slip." };
  }
  // A transfer cannot have happened tomorrow; one day of slack covers device/server clock skew.
  const limit = new Date(Date.now() + 86400000).toISOString().split("T")[0];
  if (paidDate > limit) {
    return { error: `The paid date (${paidDate}) is in the future. Enter the date shown on the slip.` };
  }

  return {
    paidDate,
    slip: { image, filename: str(slip.filename, 120), attachedAt: new Date().toISOString() },
  };
}

// A payment record echoed back to the client keeps every field except the slip image —
// that is ~100 KB the list views never render, and is fetched per record when opened.
function withoutSlipImage(payment) {
  const json = payment.toJSON();
  if (!json.slip) return json;
  // Rebuilt rather than deleted from, so the stored document is never touched on the way out.
  const { image, ...slip } = json.slip;
  return { ...json, slip };
}

module.exports = { readSlipPayload, withoutSlipImage };
