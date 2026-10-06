// Client-side reading of a student's payment plan — the server (server/utils/billing.js)
// owns the schedule itself; this only answers the questions the screens ask of it.
//
// "monthly" bills the class fee (customFee, else the batch fee) every month, for `months`
// months when set and otherwise until the batch's exam — how every student was billed
// before plans existed. "installments" bills a fixed list of { amount, dueDate } payments.

const fmtMMK = (n) => new Intl.NumberFormat("en-US").format(n) + " MMK";

export const isInstallmentPlan = (student) =>
  student?.paymentPlan?.kind === "installments" && (student.paymentPlan.installments || []).length > 0;

// What a student adds to a month's recurring revenue. An installment plan has no monthly
// fee — its payments land on their own dates in their own amounts — so it adds nothing
// rather than being counted at the batch fee it is not paying.
export function monthlyFeeOf(student, batch) {
  if (isInstallmentPlan(student)) return 0;
  if (student.customFee != null) return student.customFee;
  return batch ? batch.fee : 0;
}

// One line describing the plan, for student cards.
export function planSummary(student, batch) {
  if (isInstallmentPlan(student)) {
    const list = student.paymentPlan.installments;
    const total = list.reduce((sum, i) => sum + (i.amount || 0), 0);
    return list.length === 1
      ? `${fmtMMK(total)} · one payment`
      : `${fmtMMK(total)} · ${list.length} installments`;
  }
  const fee = student.customFee != null ? student.customFee : batch ? batch.fee : null;
  if (fee == null) return null;
  const months = student.paymentPlan?.months;
  return months ? `${fmtMMK(fee)}/month × ${months}` : `${fmtMMK(fee)}/month`;
}
