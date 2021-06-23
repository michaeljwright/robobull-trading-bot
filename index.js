const dotenv = require("dotenv");
dotenv.config();
const express = require("express");
const session = require("express-session")({
  secret: "my-secret",
  resave: true,
  saveUninitialized: true
});
const sharedsession = require("express-socket.io-session");
const socketio = require("socket.io");
const bodyParser = require("body-parser");
const moment = require("moment-timezone");
moment.tz.setDefault(process.env.TIMEZONE);

const routes = require("./src/routes/routes");

const app = express();

app.set("view engine", "ejs");
app.set("views", "./src/views");

app.use(session);

app.use(bodyParser.urlencoded({ extended: false }));

app.use(express.static("public"));

app.use(function(req, res, next) {
  req.io = io;
  next();
});

app.use(routes);

let host = process.env.HOST_ORIGIN;
let hostPort = process.env.PORT || 3000;

let server = app.listen(hostPort, () => {
  console.log("server is running on port " + hostPort);
});

const io = socketio(server, {
  cors: {
    origin: host,
    methods: ["GET", "POST"],
    credentials: true
  }
  // reconnection: true,
  // reconnectionAttempts: Infinity,
});

io.use(
  sharedsession(session, {
    autoSave: true
  })
);

const socketHandle = io => {
  io.on("connection", socket => {
    console.log(socket.handshake.session.id);
  });
};

socketHandle(io);
