const _ = require("lodash");
const fs = require("fs");
const path = require("path");

const settingsFile = path.join(
  path.dirname(process.mainModule.filename),
  "config",
  "settings.json"
);
const defaultSettings = JSON.parse(fs.readFileSync(settingsFile));

/**
 * Gets defaults settings
 *
 * @returns {Object} defaultSettings
 */
const getSettings = () => {
  return defaultSettings;
};

/**
 * Sets settings (or use defaults)
 *
 * @param {Object} settings
 * @param {Object} session
 *
 * @returns {Object} defaultSettings
 */
const setSettings = (settings, session) => {
  let defaultSettings = getSettings();

  defaultSettings.startDate = settings.startDate
    ? settings.startDate
    : defaultSettings.startDate;

  defaultSettings.endDate = settings.endDate
    ? settings.endDate
    : defaultSettings.endDate;

  defaultSettings.isBacktest = settings.isBacktest
    ? settings.isBacktest
    : defaultSettings.isBacktest;

  // add settings to mongo (if session data)
  if (!_.isEmpty(session)) {
    defaultSettings.userId = session.userId;
    defaultSettings.sessionId = session._id;
  }

  return defaultSettings;
};

module.exports = { getSettings, setSettings };
