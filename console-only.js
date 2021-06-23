const moment = require("moment-timezone");
moment.tz.setDefault(process.env.TIMEZONE);

const { initializeProvider } = require("./src/providers/trading-provider");

initializeProvider({}, process.env.USER_ID);
