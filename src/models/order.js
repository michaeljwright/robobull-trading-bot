const getUuid = require("uuid-by-string");
const mongoose = require("mongoose");

const { SignalSchema } = require("./signal");

const OrderSchema = mongoose.Schema({
  symbol: { type: String, index: true },
  side: String,
  qty: Number,
  price: Number,
  amount: Number,
  signals: [SignalSchema],
  session: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Session"
  },
  balanceAtBuy: { type: Number, default: 0 },
  balanceAtSell: { type: Number, default: 0 },
  roi: { type: Number, default: 0 },
  processed: { type: Boolean, default: false },
  cancelled: { type: Boolean, default: false },
  dateTime: Date,
  created: { type: Date, default: Date.now }
});

const Order = mongoose.model("Order", OrderSchema);

module.exports = {
  OrderSchema,
  Order
};
