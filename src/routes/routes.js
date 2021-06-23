const express = require("express");
const path = require("path");

const {
  initializeSession,
  killSession
} = require("../controllers/sessionsController");

const { createUser, runByUser } = require("../controllers/usersController");

const router = express.Router();

router.get("/", (req, res) => {
  res.send("This page is protected.");
});

router.get("/run", runByUser);

router.get("/create-user", createUser);

router.get("/session/:userId?", initializeSession);

router.get("/session-kill/:sessionId?", killSession);

module.exports = router;
