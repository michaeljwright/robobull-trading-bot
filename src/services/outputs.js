const fs = require("fs");
const path = require("path");
const _ = require("lodash");
const moment = require("moment-timezone");

const database = require("./database");

/**
 * Outputs data to socket (and also console if required)
 *
 * @param {mixed} output
 * @param {string} ioChannel
 * @param {Object} io
 * @param {boolean} isConsoleOutput
 */
const writeOutput = (
  output,
  ioChannel = null,
  io = null,
  isConsoleOutput = true
) => {
  if (isConsoleOutput) {
    console.log(output);
  }
  if (ioChannel && io) {
    io.emit(ioChannel, output);
    // io.on("connection", socket => {
    //   socket.emit(ioChannel, output);
    // });
  }
};

/**
 * Outputs initial stocks data and settings to console before trading
 *
 * @param {Object[]} stocks
 * @param {Object} settings
 */
const consoleOutputStockData = (stocks, settings) => {
  console.log(`Starting Capital: ${settings.startingCapital}`);
  console.log(`Back testing: ${settings.isBacktest}`);
  if (settings.isBacktest) {
    console.log(
      `Start date: ${moment(settings.startDate).format("DD/MM/YYYY h:mm:ss a")}`
    );
    console.log(
      `End date: ${moment(settings.endDate).format("DD/MM/YYYY h:mm:ss a")}`
    );
  }
  console.log(`Subscribed to these stocks (${stocks.length}): `);
  console.log(JSON.stringify(stocks));
};

/**
 * Outputs algo calculation for specific stock in console
 *
 * @param {Object} stockData
 * @param {number} stockIndex
 * @param {Object[]} calcs
 */
const consoleOutputCalc = (stockData, stockIndex, calcs) => {
  console.log("-------------------------");
  console.log(`Stock: ${stockData[stockIndex].symbol}`);
  console.log(`DateTime: ${moment().format("DD/MM/YYYY h:mm:ss a")}`);
  _.forOwn(calcs, function(value, calc) {
    console.log(`${calc}: ${value}`);
  });
};

/**
 * Outputs results to mongodb
 *
 * @param {Object} stockData
 * @param {Object} result
 * @param {Object} session
 * @param {Object} settings
 */
const mongodbOutputResults = async (stockData, result) => {
  let stocks = _.map(stockData.stocks, "symbol");

  result.startDate = stockData.settings.isBacktest
    ? moment(stockData.settings.startDate).valueOf()
    : Date.now();
  result.endDate = stockData.settings.isBacktest
    ? moment(stockData.settings.endDate).valueOf()
    : Date.now();
  result.isBacktest = stockData.settings.isBacktest;
  result.thresholdCapitalAllowance =
    stockData.settings.thresholdCapitalAllowance;
  result.thresholdRiskAllocation = stockData.settings.thresholdRiskAllocation;
  result.thresholdToBuy = stockData.algos.thresholdToBuy;
  result.thresholdToSell = stockData.algos.thresholdToSell;
  result.thresholdAlgos = stockData.algos.thresholds;
  result.orderCount = stockData.orders.length;
  result.stockCount = stocks.length;
  result.userId = stockData.session.userId;
  result.sessionId = stockData.session._id;

  await database.mongodbCreateResult(result);
};

/**
 * Outputs stock data to local debug json file
 *
 * @param {Object} stockData
 * @param {string} outputFile
 */
const fileOutputResults = (
  stockData,
  outputFile = moment().format("DDMMYYYY_hhmmss") + ".json"
) => {
  let jsonOutput = JSON.stringify(stockData.orders);

  // write json output to file
  fileOutput(outputFile, jsonOutput);
};

/**
 * Writes stringified json output to file
 *
 * @param {string} outputFile
 * @param {string} output
 */
const fileOutput = (outputFile, output) => {
  const outputDir = "output";
  const outputFileWithDir = path.join(
    path.dirname(process.mainModule.filename),
    outputDir,
    outputFile
  );

  if (!fs.existsSync("./" + outputDir)) {
    fs.mkdir("./" + outputDir, { recursive: true }, err => {
      if (err) throw err;
    });
  }

  fs.writeFile(outputFileWithDir, output, { flag: "wx" }, function(err) {
    if (err) throw err;
  });
};

module.exports = {
  writeOutput,
  consoleOutputStockData,
  consoleOutputCalc,
  mongodbOutputResults,
  fileOutputResults,
  fileOutput
};
