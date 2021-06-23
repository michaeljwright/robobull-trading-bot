const _ = require("lodash");
const moment = require("moment-timezone");

const Backtest = require("@michaeljwright/alpaca-js-backtesting");

const baseProvider = require("./base");

const tradingStocks = require("../../services/stocks");
const tradingAlgos = require("../../services/algos");
const outputs = require("../../services/outputs");

/**
 * Gets the start and end days as an array of objects between specified dates
 *
 * @param {string} startDate
 * @param {string} endDate
 *
 * @returns {Object[]} dates
 */
const getDaysBetweenDates = (startDate, endDate) => {
  let dates = [];

  let numberOfDays = moment.duration(moment(endDate).diff(startDate)).asDays();
  let currDate = moment(startDate);
  let lastDate = moment(endDate);

  dates.push({
    startDate: currDate
      .startOf("day")
      .clone()
      .toDate(),
    endDate: currDate
      .endOf("day")
      .clone()
      .toDate()
  });

  while (currDate.add(1, "days").diff(lastDate) < 0) {
    dates.push({
      startDate: currDate
        .startOf("day")
        .clone()
        .toDate(),
      endDate: currDate
        .endOf("day")
        .clone()
        .toDate()
    });
  }

  if (numberOfDays > 0) {
    dates.push({
      startDate: lastDate
        .startOf("day")
        .clone()
        .toDate(),
      endDate: lastDate
        .endOf("day")
        .clone()
        .toDate()
    });
  }

  return dates;
};

/**
 * Calculates and outputs final RIO for all back testing dates
 *
 * @param {number} startingCapital
 * @param {Object[]} results
 *
 * @returns {Object}
 */
const calculateAndOutputRoi = (startingCapital, results) => {
  let roi = _.sumBy(results, result => result.roi);
  let endValue = (startingCapital + roi * startingCapital).toFixed(2);

  console.log("-------");
  console.log("ROI: " + roi);
  console.log("Starting Capital: " + startingCapital.toFixed(2));
  console.log("Ending Capital: " + endValue);

  return {
    startValue: startingCapital.toFixed(2),
    endValue: endValue,
    roi: roi
  };
};

/**
 * Runs back testing for a specific date (1 day only)
 *
 * @param {string} backtestDate
 * @param {Object[]} stocks
 * @param {Object} settings
 * @param {(Object|null)} session
 * @param {(Object|null)} io
 * @param {number} startingCapital
 *
 * @returns {Promise}
 */
const runBacktest = async (
  backtestDate,
  stocks,
  settings,
  session,
  io,
  startingCapital
) => {
  return new Promise(async (resolve, reject) => {
    let trading = new Backtest({
      startValue: startingCapital,
      alpaca: baseProvider.initializeAlpaca(),
      startDate: moment(backtestDate.startDate).toDate(),
      endDate: moment(backtestDate.endDate).toDate()
    });

    await tradingStocks
      .initializeStockData(trading, stocks, settings, [], [], session, io)
      .then(async stockData => {
        // loop through algos to create initial setup for each stock
        stockData = tradingAlgos.initializeAlgos(stockData);

        const client = trading.data_stream_v2;

        client.onConnect(() => {
          tradingStocks.subscribeToStocks(client, stocks, settings);
        });

        client.onStockBar(async data => {
          // loop through algos for calculations
          stockData = tradingAlgos.calculateAlgos(trading, stockData, data);
        });

        client.onDisconnect(async () => {
          let result = await trading.getStats();

          // write socket to frontend trading terminal
          outputs.writeOutput(
            stockData.stocks,
            "receive_stocks",
            stockData.io,
            false
          );
          outputs.writeOutput(result, "receive_result", stockData.io, false);
          outputs.writeOutput(
            stockData.portfolio.positions,
            "receive_positions",
            stockData.io,
            false
          );
          outputs.writeOutput(
            { dateTime: null },
            "receive_clock",
            stockData.io,
            false
          );

          resolve(result);
        });

        client.connect();
      });
  });
};

/**
 * Starts the back testing process between specified dates
 *
 * @param {Object} settings
 * @param {(Object|null)} session
 * @param {(Object|null)} io
 * @param {number} startingCapital
 * @param {string} startDate
 * @param {string} endDate
 */
const alpacaBacktest = async (
  settings,
  session,
  io,
  startingCapital = 100000,
  startDate = settings.startDate
    ? moment(settings.startDate).toDate()
    : moment("2020-01-01 00:00:00").toDate(),
  endDate = settings.endDate
    ? moment(settings.endDate).toDate()
    : moment("2020-01-02 00:00:00").toDate()
) => {
  let backtestDates = getDaysBetweenDates(startDate, endDate);
  let backtestDatesIndex = 0;
  let results = [];
  let resultsRequestBuffer = [];

  /* get array of stocks */
  const stocks = await tradingStocks.getStocks(settings);

  if (stocks.length > 5) {
    console.log(
      "WARNING: The more stocks you back test at once the longer it takes to download the data."
    );
  }

  outputs.consoleOutputStockData(stocks, settings);

  outputs.writeOutput({ dateTime: null }, "receive_clock", io, false);

  // loop through backtest dates and put results into array
  for (let i = 0; i < backtestDates.length; i++) {
    for (let j = 0; j < 1; j++) {
      if (backtestDates[backtestDatesIndex]) {
        resultsRequestBuffer.push(
          await runBacktest(
            backtestDates[backtestDatesIndex],
            stocks,
            settings,
            session,
            io,
            startingCapital
          )
        );
      }
      backtestDatesIndex++;
    }

    // pause out loop for every 5 requests, when done clear buffer and repeat
    await Promise.all(resultsRequestBuffer).then(result => {
      results.push(...result);
    });

    resultsRequestBuffer.splice(0, resultsRequestBuffer.length);
  }

  let result = calculateAndOutputRoi(startingCapital, results);

  outputs.writeOutput(result, "receive_result", io, false);

  if (!io) {
    process.exit();
  }
};

module.exports = {
  getDaysBetweenDates,
  calculateAndOutputRoi,
  runBacktest,
  alpacaBacktest
};
