const getUuid = require("uuid-by-string");
const mongoose = require("mongoose");

const { SignalSchema } = require("./signal");

const PositionSchema = mongoose.Schema({
  symbol: { type: String, index: true },
  side: String,
  qty: Number,
  price: Number,
  amount: Number,
  roi: Number,
  balanceAtBuy: { type: Number, default: 0 },
  balanceAtSell: { type: Number, default: 0 },
  profit: { type: Number, default: 0.0 },
  created: { type: Date, default: Date.now }
});

const Position = mongoose.model("Position", PositionSchema);

module.exports = {
  PositionSchema,
  Position
};
