let winston = require("winston");
let { Loggly } = require("winston-loggly-bulk");

if (process.env.LOGGLY_TOKEN && process.env.LOGGLY_SUBDOMAIN) {
  winston.add(
    new Loggly({
      token: process.env.LOGGLY_TOKEN,
      subdomain: process.env.LOGGLY_SUBDOMAIN,
      tags: ["Trading-Bot"],
      defaultMeta: { service: "trading-bot" },
      json: true
    })
  );
}

const log = (message, level = "info", output = true) => {
  if (process.env.LOGGLY_TOKEN) {
    winston.log(level, message);
  }

  if (output) {
    console.log(message);
  }
};

module.exports = {
  log
};
