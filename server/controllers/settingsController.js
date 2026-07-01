const Settings = require("../models/Settings");

exports.getSettings = async (req, res, next) => {
  try {
    let settings = await Settings.findOne();
    if (!settings) {
      settings = await Settings.create({
        defaultFee: 180000,
        currency: "MMK",
        autoInvoiceDay: 1,
        invoicePrefix: "TLC",
        nextInvoiceNum: 1001,
      });
    }
    res.json(settings);
  } catch (err) {
    next(err);
  }
};

exports.updateSettings = async (req, res, next) => {
  try {
    const { defaultFee, currency, autoInvoiceDay, invoicePrefix, nextInvoiceNum } = req.body;
    const update = {};
    if (defaultFee !== undefined) update.defaultFee = defaultFee;
    if (currency !== undefined) update.currency = currency;
    if (autoInvoiceDay !== undefined) update.autoInvoiceDay = autoInvoiceDay;
    if (invoicePrefix !== undefined) update.invoicePrefix = invoicePrefix;
    if (nextInvoiceNum !== undefined) update.nextInvoiceNum = nextInvoiceNum;

    const settings = await Settings.findOneAndUpdate({}, update, {
      new: true,
      upsert: true,
      runValidators: true,
    });
    res.json(settings);
  } catch (err) {
    next(err);
  }
};
