const _ = require("lodash");
const moment = require("moment-timezone");

const { initializeProvider } = require("../providers/trading-provider");
const database = require("../services/database");

/* initialize session */
const initializeSession = async (req, res) => {
  let userId = req.params.userId ? req.params.userId : null;

  if (!userId) {
    res.redirect("/");
  } else {
    let session = await initializeProvider(
      {
        startDate: req.query.startDate,
        endDate: req.query.endDate,
        isBacktest: req.query.isBacktest
      },
      userId,
      req.io
    );

    if (!session) {
      res.redirect("/");
    } else {
      res.render("session", {
        session: session,
        port: process.env.PORT ? process.env.PORT : 3000
      });
    }
  }
};

const killSession = async (req, res) => {
  let sessionId = req.params.sessionId ? req.params.sessionId : null;

  if (!sessionId) {
    res.send("No session id provided.");
  } else {
    try {
      let session = await database.mongodbKillSession({
        _id: sessionId
      });

      res.send("See killed sesson in console.");
    } catch (err) {
      console.log(err);
      res.send("An error occurred.");
    }
  }
};

module.exports = {
  initializeSession,
  killSession
};
