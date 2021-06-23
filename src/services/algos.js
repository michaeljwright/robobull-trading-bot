const fs = require("fs");
const path = require("path");
const _ = require("lodash");
const moment = require("moment-timezone");
const technicalIndicators = require("technicalindicators");

const { addSignal } = require("./signals");

const algosFile = path.join(
  path.dirname(process.mainModule.filename),
  "config",
  "algos.json"
);
const algos = JSON.parse(fs.readFileSync(algosFile));

/**
 * Gets all algos json object with thresholds, weightings etc
 *
 * @returns {Object} algos
 */
const getAlgos = () => {
  return algos;
};

/**
 * Gets algo thresholds for buy or sell (side) for specified algo
 *
 * @param {Object} algos
 * @param {string} algo
 *
 * @returns {(Object|null)}
 */
const getAlgoThresholds = (algos, algo) => {
  return algos.thresholds.hasOwnProperty(algo) ? algos.thresholds[algo] : null;
};

/**
 * Adds algo weighting for signal (0.10 equals 10%)
 *
 * @param {Object} algos
 * @param {string} algo
 *
 * @returns {number}
 */
const addAlgoWeighting = (algos, algo) => {
  return algos.thresholds.hasOwnProperty(algo)
    ? algos.thresholds[algo].weighting
    : 0;
};

/**
 * Checks that all items in array and/or object are defined (and have a value)
 *
 * @param {Object[]} nextValues
 *
 * @returns {boolean}
 */
const validateThresholdConditionAttribute = nextValues => {
  let valid = true;

  _.forOwn(nextValues, (valueObject, valueIndex) => {
    if (
      !valueObject ||
      typeof nextValues[valueIndex] === "undefined" ||
      typeof valueObject === "undefined"
    ) {
      valid = false;
    } else if (typeof valueObject === "object") {
      // array contains items that are objects
      _.forOwn(valueObject, (property, index) => {
        if (!property || typeof property === "undefined") {
          valid = false;
        }
      });
    }
  });

  return valid;
};

/**
 * Gets algo threshold condition attribute value based on object name, array position or custom/specific value
 *
 * @param {string} type
 * @param {Object[]} nextValues
 * @param {Object} conditionAttributeValue
 *
 * @returns {(number|null)}
 */
const getAlgoThresholdConditionAttribute = (type, nextValues, condition) => {
  let conditionAttributeValue = null;

  if (condition[type + "Type"] == "custom") {
    conditionAttributeValue = condition[type + "Attribute"];
  } else if (condition[type + "Type"] == "object") {
    conditionAttributeValue = nextValues[0][condition[type + "Attribute"]];
  } else {
    conditionAttributeValue = nextValues[condition[type + "Attribute"]];
  }

  return conditionAttributeValue;
};

/**
 * Compares attributes with operator for dynamic algo threshold calculation
 *
 * @param {number} compareAttribute
 * @param {string} operator
 * @param {number} againstAttribute
 *
 * @returns {boolean}
 */
const algoThresholdsOperator = (
  compareAttribute,
  operator,
  againstAttribute
) => {
  switch (operator) {
    case ">":
      return compareAttribute > againstAttribute ? true : false;
    case "<":
      return compareAttribute < againstAttribute ? true : false;
    case ">=":
      return compareAttribute >= againstAttribute ? true : false;
    case "<=":
      return compareAttribute <= againstAttribute ? true : false;
    case "==":
      return compareAttribute == againstAttribute ? true : false;
    case "!=":
      return compareAttribute != againstAttribute ? true : false;
    case "===":
      return compareAttribute === againstAttribute ? true : false;
    case "!==":
      return compareAttribute !== againstAttribute ? true : false;
  }
};

/**
 * Runs initialization for each algo
 *
 * @param {Object} stockData
 *
 * @returns {Object} stockData
 */
const initializeAlgos = stockData => {
  _.forOwn(getAlgos().thresholds, (algoObject, algoName) => {
    if (
      algoObject.enabled &&
      algoObject.type !== "standard" &&
      algoObject.type !== "candleStick"
    ) {
      stockData = initializeAlgo(algoName, stockData);
    }
  });

  return stockData;
};

/**
 * Gets live stock data and initialize for all stocks based on algo
 *
 * @param {Object} algo
 * @param {Object} stockData
 *
 * @returns {Object} stockData
 */
const initializeAlgo = (algo, stockData) => {
  let algoThresholds = getAlgoThresholds(getAlgos(), algo);

  _.forOwn(stockData.stocks, (stock, index) => {
    _.forOwn(algoThresholds.periods, period => {
      let input = {};

      if (period.hasOpen) {
        input.open = stockData.stocks[index].openValues;
      }

      if (period.hasClose) {
        input.close = stockData.stocks[index].closeValues;
      }

      if (period.hasHigh) {
        input.high = stockData.stocks[index].highValues;
      }

      if (period.hasLow) {
        input.low = stockData.stocks[index].lowValues;
      }

      if (period.hasVolume) {
        input.volume = stockData.stocks[index].volumeValues;
      }

      if (
        !period.hasOpen &&
        !period.hasClose &&
        !period.hasHigh &&
        !period.hasLow
      ) {
        input.values = stockData.stocks[index].closeValues;
      }

      if (period.hasOwnProperty("period")) {
        input.period = period.period;
      }
      if (period.hasOwnProperty("standardDeviation")) {
        input.stdDev = period.standardDeviation;
      }
      if (period.hasOwnProperty("fastPeriod")) {
        input.fastPeriod = period.fastPeriod;
      }
      if (period.hasOwnProperty("slowPeriod")) {
        input.slowPeriod = period.slowPeriod;
      }
      if (period.hasOwnProperty("signalPeriod")) {
        input.signalPeriod = period.signalPeriod;
      }

      stockData.stocks[index][period.name] = new technicalIndicators[algo](
        input
      );
    });
  });

  return stockData;
};

/**
 * Runs through calculations for each technical indicator / algo
 *
 * @param {(Alpaca|TradingProvider)} tradingProvider
 * @param {Object} stockData
 * @param {Object} data
 *
 * @returns {Object} stockData
 */
const calculateAlgos = (tradingProvider, stockData, data) => {
  let algos = getAlgos();
  let subject = data.Symbol;

  // run through algo calculations (from algo preference settings)
  _.forOwn(algos.thresholds, (algoObject, algoName) => {
    if (
      algoObject.enabled &&
      algoObject.type !== "standard" &&
      algoObject.type !== "candleStick"
    ) {
      stockData = calculateAlgo(
        algoName,
        tradingProvider,
        stockData,
        subject,
        data
      );
    }
  });

  // update stock data arrays
  stockData = updateStockDataAfterCalculation(stockData, subject, data);

  // calculate standard pattern signals e.g. trending up / down etc (if enabled)
  if (algos.useStandardAlgos) {
    stockData = calculateStandardAlgos(
      tradingProvider,
      stockData,
      subject,
      data
    );
  }

  // removes all signals if not enough to hit threshold
  let stockIndex = _.findIndex(stockData.stocks, { subject: subject });
  if (stockData.stocks[stockIndex].signals.length > 0) {
    stockData = resetSignalByStock(
      stockData,
      stockData.stocks[stockIndex].symbol
    );
  }

  return stockData;
};

/**
 * Calculates signals based on technical indicator / algo
 *
 * @param {string} algo
 * @param {(Alpaca|TradingProvider)} tradingProvider
 * @param {Object} stockData
 * @param {string} subject
 * @param {Object} data
 *
 * @returns {Object} stockData
 */
const calculateAlgo = (algo, tradingProvider, stockData, subject, data) => {
  let algos = getAlgos();
  let algoThresholds = getAlgoThresholds(algos, algo);
  let dateTime = data.Timestamp
    ? moment.tz(data.Timestamp, process.env.TIMEZONE).valueOf()
    : moment()
        .tz(process.env.TIMEZONE)
        .valueOf();
  let stockIndex = _.findIndex(stockData.stocks, { subject: subject });

  // get next values
  let closePrice = data.ClosePrice;
  let nextValue;

  if (
    !algoThresholds.periods[0].hasOpen &&
    !algoThresholds.periods[0].hasClose &&
    !algoThresholds.periods[0].hasHigh &&
    !algoThresholds.periods[0].hasLow
  ) {
    nextValue = closePrice;
  } else {
    nextValue = {};

    if (algoThresholds.periods[0].hasOpen) {
      nextValue.open = data.OpenPrice;
    }

    if (algoThresholds.periods[0].hasClose) {
      nextValue.close = data.ClosePrice;
    }

    if (algoThresholds.periods[0].hasHigh) {
      nextValue.high = data.HighPrice;
    }

    if (algoThresholds.periods[0].hasLow) {
      nextValue.low = data.LowPrice;
    }

    if (algoThresholds.periods[0].hasVolume) {
      nextValue.volume = data.Volume;
    }
  }

  // loop through periods for algo calculation and get next value
  let nextValues = [];
  _.forOwn(algoThresholds.periods, period => {
    nextValues.push(
      stockData.stocks[stockIndex][period.name].nextValue(nextValue)
    );
  });

  // loop through signal conditions for comparison calculations
  _.forOwn(algoThresholds.conditions, condition => {
    if (
      validateThresholdConditionAttribute(nextValues) &&
      algoThresholdsOperator(
        getAlgoThresholdConditionAttribute("compare", nextValues, condition),
        condition.operator,
        getAlgoThresholdConditionAttribute("against", nextValues, condition)
      ) && // if custom then compare actual againstAttribute value, else compare 2nd item in nextValues[] (and if lastOrder is the same as current signal buy/sell)
      stockData.stocks[stockIndex].lastOrder !== condition.signal.toUpperCase()
    ) {
      stockData = addSignal(
        algo,
        algoThresholds.type,
        tradingProvider,
        stockIndex,
        stockData,
        condition.signal,
        closePrice,
        addAlgoWeighting(algos, algo),
        dateTime
      );
    }
  });

  return stockData;
};

/**
 * Checks if stock has enough market data to run standard algo calculations
 *
 * @param {Object} stockData
 * @param {number} stockIndex
 * @param {number} dataCount
 *
 * @returns {boolean}
 */
const hasEnoughStockDataValues = (stockData, stockIndex, dataCount = 10) => {
  if (
    stockData.stocks[stockIndex].openValues.length > dataCount &&
    stockData.stocks[stockIndex].closeValues.length > dataCount &&
    stockData.stocks[stockIndex].highValues.length > dataCount &&
    stockData.stocks[stockIndex].lowValues.length > dataCount
  ) {
    return true;
  } else {
    return false;
  }
};

/**
 * Calculates signals based on standard or default technical indicators / algos
 *
 * @param {(Alpaca|TradingProvider)} tradingProvider
 * @param {Object} stockData
 * @param {string} subject
 * @param {Object} data
 *
 * @returns {Object} stockData
 */
const calculateStandardAlgos = (tradingProvider, stockData, subject, data) => {
  let stockIndex = _.findIndex(stockData.stocks, { subject: subject });
  let closePrice = data.ClosePrice;
  let dateTime = data.Timestamp
    ? moment(data.Timestamp)
        .unix()
        .valueOf()
    : moment().unix();

  if (
    typeof stockData.stocks[stockIndex] === "object" &&
    stockData.stocks[stockIndex] !== null &&
    hasEnoughStockDataValues(stockData, stockIndex)
  ) {
    // is Bullih pattern
    if (
      technicalIndicators["bullish"]({
        open: stockData.stocks[stockIndex].openValues,
        close: stockData.stocks[stockIndex].closeValues,
        high: stockData.stocks[stockIndex].highValues,
        low: stockData.stocks[stockIndex].lowValues
      })
    ) {
      stockData = addSignal(
        "bullish",
        "bullish",
        tradingProvider,
        stockIndex,
        stockData,
        "buy",
        closePrice,
        5,
        dateTime
      );
    }

    // is bearish pattern
    if (
      technicalIndicators["bearish"]({
        open: stockData.stocks[stockIndex].openValues,
        close: stockData.stocks[stockIndex].closeValues,
        high: stockData.stocks[stockIndex].highValues,
        low: stockData.stocks[stockIndex].lowValues
      })
    ) {
      stockData = addSignal(
        "bearish",
        "bearish",
        tradingProvider,
        stockIndex,
        stockData,
        "sell",
        closePrice,
        10,
        dateTime
      );
    }
  }

  return stockData;
};

/**
 * Ensures stockData is updated with market data for specific stock after calculation
 *
 * @param {Object} stockData
 * @param {string} subject
 * @param {Object} data
 *
 * @returns {Object} stockData
 */
const updateStockDataAfterCalculation = (stockData, subject, data) => {
  let stockIndex = _.findIndex(stockData.stocks, { subject: subject });

  if (
    typeof stockData.stocks[stockIndex] === "object" &&
    stockData.stocks[stockIndex] !== null
  ) {
    stockData.stocks[stockIndex].closeValues.push(data.ClosePrice);
    stockData.stocks[stockIndex].openValues.push(data.OpenPrice);
    stockData.stocks[stockIndex].highValues.push(data.HighPrice);
    stockData.stocks[stockIndex].lowValues.push(data.LowPrice);
    stockData.stocks[stockIndex].volumeValues.push(data.Volume);
    stockData.stocks[stockIndex].price = data.ClosePrice;
  }

  // if no algo thresholds saved yet then add now
  if (_.isEmpty(stockData.algos)) {
    stockData.algos = getAlgos();
  }

  return stockData;
};

/**
 * Resets signals for specific stock
 *
 * @param {Object} stockData
 * @param {string} symbol
 *
 * @returns {Object} stockData
 */
const resetSignalByStock = (stockData, symbol) => {
  if (stockData.settings.resetSignals) {
    let stockIndex = _.findIndex(stockData.stocks, {
      symbol: symbol
    });

    stockData.stocks[stockIndex].signals = [];
  }

  return stockData;
};

module.exports = {
  getAlgos,
  getAlgoThresholds,
  addAlgoWeighting,
  validateThresholdConditionAttribute,
  getAlgoThresholdConditionAttribute,
  algoThresholdsOperator,
  initializeAlgos,
  initializeAlgo,
  calculateAlgos,
  calculateAlgo,
  hasEnoughStockDataValues,
  calculateStandardAlgos,
  updateStockDataAfterCalculation,
  resetSignalByStock
};
