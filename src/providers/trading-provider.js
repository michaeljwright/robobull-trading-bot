const tradingSettings = require("../services/settings");

const defaultSettings = tradingSettings.getSettings();

const selectedProvider = require("./" + defaultSettings.provider + "/index");
const database = require("../services/database");

/**
 * Initializes the trading provider
 *
 * @param {Object} settings
 * @param {(number|null)} userId
 * @param {(Object|null)} io
 *
 * @returns {(Object|null)} session
 */
const initializeProvider = async (settings = {}, userId = null, io = null) => {
  // set requested specific settings
  settings.isBacktest = settings.hasOwnProperty("isBacktest")
    ? settings.isBacktest
      ? settings.isBacktest
      : defaultSettings.isBacktest
    : defaultSettings.isBacktest;
  settings.startDate = settings.hasOwnProperty("startDate")
    ? settings.startDate
      ? settings.startDate
      : defaultSettings.startDate
    : defaultSettings.startDate;
  settings.endDate = settings.hasOwnProperty("endDate")
    ? settings.endDate
      ? settings.endDate
      : defaultSettings.endDate
    : defaultSettings.endDate;

  // get session if one exists today, else create a new one (if user exists)
  if (userId) {
    let session = await database.mongodbCreateUserSession(
      userId,
      settings.isBacktest
    );

    if (session) {
      // set remaining settings from mongo or default settings
      settings = tradingSettings.setSettings(settings, session);

      // add settings to mongo db (linked to session)
      database.mongodbCreateSetting(settings);

      selectedProvider.initialize(settings, session, io);

      return session;
    } else {
      return null;
    }
  } else {
    return null;
  }
};

module.exports = { initializeProvider };
