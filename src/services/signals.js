const fs = require("fs");
const path = require("path");
const _ = require("lodash");

const { createOrder } = require("./orders");
const outputs = require("./outputs");

const algosFile = path.join(
  path.dirname(process.mainModule.filename),
  "config",
  "algos.json"
);
const algos = JSON.parse(fs.readFileSync(algosFile));

/**
 * Gets count for amount signals from all stocks
 *
 * @param {Object} stockData
 *
 * @returns {number} stocksWithSignals
 */
const getCountForAllSignals = stockData => {
  let stocksWithSignals = 0;

  _.forOwn(stockData.stocks, (stock, index) => {
    stocksWithSignals += stock.signals.length;
  });

  return stocksWithSignals;
};

/**
 * Counts signals for specific signal type and returns true if count is greater or equal to threshold
 *
 * @param {Object[]} signals
 * @param {Object} signalRestrictions
 *
 * @returns {boolean} surpassedThreshold
 */
const countSignalsForType = (signals, signalRestrictions) => {
  let surpassedThreshold = false;

  if (signalRestrictions.type && signalRestrictions.side) {
    let countSignals = _.sumBy(
      signals,
      ({ type, side }) =>
        type == signalRestrictions.type && side == signalRestrictions.side
    );

    surpassedThreshold =
      countSignals >= signalRestrictions.threshold ? true : false;
  }

  return surpassedThreshold;
};

/**
 * Gets overall weightings threshold to make orders if over it
 *
 * @param {string} side
 *
 * @returns {number}
 */
const getWeightingsThreshold = side => {
  return side == "buy" ? algos.thresholdToBuy : algos.thresholdToSell;
};

/**
 * Gets algo any required signal restrictions and returns them (if available)
 *
 * @returns {Object[]}
 */
const getSignalRestrictions = () => {
  let restrictions = {
    type: "",
    side: "",
    threshold: 0
  };

  if (!_.isEmpty(algos.restrictons)) {
    restrictions.type = algos.restrictons[0].type;
    restrictions.side = algos.restrictons[0].side;
    restrictions.threshold = algos.restrictons[0].threshold;
  }

  return restrictions;
};

/**
 * Checks signals for specific stock and makes order if over weightings threshold
 *
 * @param {(Alpaca|TradingProvider)} tradingProvider
 * @param {number} stockIndex
 * @param {Object} stockData
 * @param {string} side
 * @param {number} price
 * @param {number} dateTime
 *
 * @returns {Object} stockData
 */
const checkSignalsForOrder = (
  tradingProvider,
  stockIndex,
  stockData,
  side,
  price,
  dateTime
) => {
  let weightingThreshold = getWeightingsThreshold(side);
  let signalRestrictions = getSignalRestrictions();
  let signals = stockData.stocks[stockIndex].signals;

  // count weightings of signals based on side (buy/sell) of stock
  let weightingCount = _.sumBy(signals, signal => {
    if (signal.side == side) {
      return signal.weighting;
    }
  });

  // send stock signals to socket
  outputs.writeOutput(
    {
      symbol: stockData.stocks[stockIndex].symbol,
      side: side,
      weighting: weightingCount
    },
    "receive_stocks",
    stockData.io,
    false
  );

  // check amount of signal types (e.g. moving averages) against signal restrictions and reject order
  let signalRestrictionsBeyondLimit = countSignalsForType(
    signals,
    signalRestrictions
  );

  // if all algo weightings more than weighting threshold (and not too many moving averages on buy signals) then create order
  if (weightingCount >= weightingThreshold && !signalRestrictionsBeyondLimit) {
    stockData = createOrder(
      tradingProvider,
      stockIndex,
      stockData,
      stockData.stocks[stockIndex].symbol,
      side,
      price,
      dateTime
    );
  }

  return stockData;
};

/**
 * Adds a signal with side (buy/sell) and weighting based on algo calcuation
 *
 * @param {string} signal
 * @param {string} type
 * @param {(Alpaca|TradingProvider)} tradingProvider
 * @param {number} stockIndex
 * @param {Object} stockData
 * @param {string} side
 * @param {number} price
 * @param {number} weighting
 * @param {number} dateTime
 *
 * @returns {Object} stockData
 */
const addSignal = (
  signal,
  type,
  tradingProvider,
  stockIndex,
  stockData,
  side,
  price,
  weighting,
  dateTime
) => {
  // update stock price
  stockData.stocks[stockIndex].price = price;

  // add signal to stock
  stockData.stocks[stockIndex].signals.push({
    signal: signal,
    type: type,
    weighting: weighting,
    side: side
  });

  // check signals for if over weightings threshold to make order
  stockData = checkSignalsForOrder(
    tradingProvider,
    stockIndex,
    stockData,
    side,
    price,
    dateTime
  );

  return stockData;
};

module.exports = {
  getCountForAllSignals,
  countSignalsForType,
  getWeightingsThreshold,
  getSignalRestrictions,
  checkSignalsForOrder,
  addSignal
};
