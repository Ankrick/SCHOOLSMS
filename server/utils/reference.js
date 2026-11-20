const Settings = require("../models/Settings");

// The next receipt reference, e.g. "TLC-1755". One atomic increment, so two payments recorded
// at the same moment — or several in one registration — never share a number.
async function nextReference() {
  const before = await Settings.findOneAndUpdate({}, { $inc: { nextInvoiceNum: 1 } }, { new: false });
  return before ? `${before.invoicePrefix}-${before.nextInvoiceNum}` : "";
}

module.exports = { nextReference };
