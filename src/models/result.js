const getUuid = require("uuid-by-string");
const mongoose = require("mongoose");

const { OrderSchema } = require("./order");
const { StockSchema } = require("./stock");

const ResultSchema = mongoose.Schema({
  startValue: Number,
  endValue: Number,
  roi: Number,
  startDate: Date,
  endDate: Date,
  isBacktest: { type: Boolean, default: true },
  thresholdCapitalAllowance: Number,
  thresholdRiskAllocation: Number,
  thresholdToBuy: Number,
  thresholdToSell: Number,
  thresholdAlgos: Object,
  orderCount: Number,
  orders: [OrderSchema],
  stockCount: Number,
  stocks: Array,
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  sessionId: { type: mongoose.Schema.Types.ObjectId, ref: "Session" },
  created: { type: Date, default: Date.now },
});

const Result = mongoose.model("Result", ResultSchema);

module.exports = {
  ResultSchema,
  Result,
};
