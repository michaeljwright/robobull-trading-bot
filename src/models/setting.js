const getUuid = require("uuid-by-string");
const mongoose = require("mongoose");

const SettingSchema = mongoose.Schema({
  startDate: Date,
  endDate: Date,
  provider: String,
  isPaper: { type: Boolean, default: true },
  isBacktest: { type: Boolean, default: true },
  resetSignals: { type: Boolean, default: true },
  startingCapital: { type: Number, default: 0 },
  thresholdCapitalAllowance: Number,
  thresholdRiskAllocation: Number,
  thresholdCapitalRetention: Number,
  thresholdBuyCap: Number,
  thresholdBuyTimeRestriction: Number,
  thresholdStockCap: Number,
  orderStopLoss: Number,
  orderTakeProfit: Number,
  orderHoldUntilProfit: { type: Boolean, default: false },
  roiToClosePositions: Number,
  roiToResetPositions: Number,
  thresholdToBuy: Number,
  thresholdToSell: Number,
  thresholdAlgos: Object,
  useClosePositionsBeforeMarketClose: { type: Boolean, default: true },
  usePreviousUserSession: { type: Boolean, default: false },
  useDefaultStocks: { type: Boolean, default: true },
  useStockScreener: { type: Boolean, default: false },
  useStockQuotePercentage: { type: Boolean, default: false },
  stockQuotePercentageChangeRangeTo: { type: Number, default: 15 },
  stockQuotePercentageChangeRangeFrom: { type: Number, default: 1 },
  // stockCount: { type: Number, default: 0 },
  // stocks: Array,
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  sessionId: { type: mongoose.Schema.Types.ObjectId, ref: "Session" },
  created: { type: Date, default: Date.now }
});

const Setting = mongoose.model("Setting", SettingSchema);

module.exports = {
  SettingSchema,
  Setting
};
