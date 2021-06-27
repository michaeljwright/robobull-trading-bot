/**
Copyright 2021 Michael Wright

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file, or any other in this project,
except in compliance with the License. You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
**/

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
