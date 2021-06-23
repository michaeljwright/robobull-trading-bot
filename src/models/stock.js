const getUuid = require("uuid-by-string");
const mongoose = require("mongoose");

const { SignalSchema } = require("./signal");

const StockSchema = mongoose.Schema(
  {
    ticker: { type: String, index: true },
    symbol: { type: String, index: true },
    subject: { type: String, index: true },
    price: Number,
    change: Number,
    ratingScore: Number,
    ratingRecommendation: String,
    sentiment: Number,
    lastOrder: { type: String, default: null },
    // closeValues: [Array],
    // signals: [SignalSchema],
    created: { type: Date, default: Date.now },
    updated: { type: Date, default: Date.now }
  },
  { timestamps: true }
);

StockSchema.pre("save", next => {
  this.symbol = this.get("ticker");
  this.subject = "AM." + this.get("ticker");
  stock.updated = Date.now();
  next();
});

StockSchema.pre("updateOne", next => {
  this.symbol = this.get("ticker");
  this.subject = "AM." + this.get("ticker");
  stock.updated = Date.now();
  next();
});

const Stock = mongoose.model("Stock", StockSchema);

module.exports = {
  StockSchema,
  Stock
};
