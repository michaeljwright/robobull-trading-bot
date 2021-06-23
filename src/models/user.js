const getUuid = require("uuid-by-string");
const mongoose = require("mongoose");

const UserSchema = mongoose.Schema({
  name: String,
  email: String,
  sessions: [{ type: mongoose.Schema.Types.ObjectId, ref: "Session" }],
  created: { type: Date, default: Date.now },
  updated: { type: Date, default: Date.now },
});

const User = mongoose.model("User", UserSchema);

module.exports = {
  UserSchema,
  User,
};
