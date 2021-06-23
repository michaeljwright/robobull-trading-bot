const getUuid = require("uuid-by-string");
const mongoose = require("mongoose");

const SignalSchema = mongoose.Schema({
  signal: String,
  type: String,
  weighting: Number,
  side: String,
  created: { type: Date, default: Date.now },
});

const Signal = mongoose.model("Signal", SignalSchema);

module.exports = {
  SignalSchema,
  Signal,
};
