const getUuid = require("uuid-by-string");
const mongoose = require("mongoose");

const SessionSchema = mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },
  uuid: {
    type: String,
    default: getUuid("" + Date.now() + ""),
    index: { unique: true }
  },
  isBacktest: { type: Boolean, default: true },
  haltTrading: { type: Boolean, default: false },
  pauseTrading: { type: Boolean, default: false },
  created: { type: Date, default: Date.now },
  updated: { type: Date, default: Date.now }
});
// SessionSchema.index({ uuid: 1, userId: 1 }, { unique: true });

const Session = mongoose.model("Session", SessionSchema);

module.exports = {
  SessionSchema,
  Session
};
