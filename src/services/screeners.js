const _ = require("lodash");
const moment = require("moment-timezone");
const axios = require("axios");

const database = require("./database");

/**
 * Gets stocks from StocksByRoboBull API
 *
 * @returns {Promise} stocks
 */
const getStocksByRoboBull = async () => {
  return new Promise(function(resolve, reject) {
    let robobullApiHost = process.env.ROBOBULL_API_HOST;
    let robobullApiKey = process.env.ROBOBULL_API_KEY;
    let stocks = [];

    if (robobullApiHost) {
      axios
        .get(robobullApiHost + robobullApiKey)
        .then(response => {
          if (!_.isEmpty(response.data.data)) {
            stocks = response.data.data;
          }

          resolve(stocks);
        })
        .catch(function(err) {
          console.log("ERROR: StocksByRoboBull");
          console.error(err.response.status + " - " + err.response.statusText);
          if (!_.isEmpty(err.response.data)) {
            console.log(err.response.data.message);
          }
          resolve(stocks);
        });
    } else {
      reject("No RoboBull API Key");
    }
  });
};

/**
 * Gets stocks from StocksByRoboBull API or fallback datastore for today in specified order
 *
 * @param {Object[]} orderBy
 * @param {Object[]} orderByDirection
 *
 * @returns {Object[]} stocks
 */
const getStocks = async (
  orderBy = ["ratingScore", "change", "updated", "sentiment"],
  orderByDirection = ["desc", "desc", "desc", "desc"]
) => {
  let stocks = await getStocksByRoboBull();

  if (_.isEmpty(stocks)) {
    stocks = await database.mongodbGetStocks({
      updated: { $gte: moment().startOf("day"), $lt: moment().endOf("day") }
    });

    stocks = _.orderBy(stocks, orderBy, orderByDirection);
    stocks = _.take(_.uniq(_.map(stocks, "ticker")), 150);
  } else {
    // TODO: add to stocks collection in local db
  }

  return stocks;
};

module.exports = { getStocks, getStocksByRoboBull };
