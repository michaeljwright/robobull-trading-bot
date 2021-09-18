const _ = require("lodash");
const moment = require("moment-timezone");

const {
  getPositions,
  updatePositions,
  updateBalance,
  resetPositionsSignals
} = require("./positions");

const database = require("./database");
const outputs = require("./outputs");

/**
 * Creates order and adds to portfolio in stockData
 *
 * @param {(Alpaca|TradingProvider)} tradingProvider
 * @param {number} stockIndex
 * @param {Object} stockData
 * @param {string} symbol
 * @param {string} side
 * @param {number} price
 * @param {number} dateTime
 *
 * @returns {Object} stockData
 */
const createOrder = (
  tradingProvider,
  stockIndex,
  stockData,
  symbol,
  side,
  price,
  dateTime
) => {
  let settings = stockData.settings;

  let thresholdCapitalAllowance = settings.thresholdCapitalAllowance
    ? settings.thresholdCapitalAllowance
    : 1; // 1 to 12 (the higher the more allowed)
  let thresholdRiskAllocation = settings.thresholdRiskAllocation
    ? settings.thresholdRiskAllocation
    : thresholdCapitalAllowance / 10; // 0.00 to 5.00 (the higher the more agressive, 6 is possible also)
  let thresholdBuyCap = settings.thresholdBuyCap
    ? settings.thresholdBuyCap
    : 0.1;
  let thresholdStockCap = settings.thresholdStockCap
    ? settings.thresholdStockCap
    : 15;
  let thresholdCapitalRetention = settings.thresholdCapitalRetention
    ? settings.thresholdCapitalRetention
    : 10000;
  let processOrder = true;

  // get current portfolio positions
  let qty = getPositions(stockData, symbol).current;

  let amountOfStocks = stockData.stocks.length;

  let amountOfPositions = stockData.portfolio.positions.length;

  thresholdRiskAllocation =
    amountOfPositions / thresholdRiskAllocation > thresholdRiskAllocation
      ? amountOfPositions / thresholdRiskAllocation
      : thresholdRiskAllocation;

  let portfolioPercentage =
    (thresholdCapitalAllowance / amountOfStocks) * thresholdRiskAllocation;

  // get starting capital for session
  let startingCapital = stockData.portfolio.startingCapital;

  // get current portfolio balance
  let balance = stockData.portfolio.cash;

  // is trading halted at present
  let haltTrading = stockData.haltTrading;

  // if order is a BUY and doesn't already have qty/positions exist in portfolio
  if (side == "buy" && qty == 0) {
    // calc qty based on percentage of portfolio balance divided by stock price
    qty = Math.floor((balance * portfolioPercentage) / price);

    // check if amount (qty * price) is over threshold for Buy Cap
    let amount = qty * price;
    let buyCap = startingCapital * thresholdBuyCap;

    if (amount > buyCap) {
      console.log(
        `ORDER: Purchase amount over buy cap ${symbol} (${amount}) (${portfolioPercentage})`
      );
      qty = Math.floor(buyCap / price);
    }

    // check if remaining balance from buy amount is higher than capital retention threshold (ignore for back testing)
    if (!settings.isBacktest && balance - amount < thresholdCapitalRetention) {
      console.log(
        `ORDER: Capital retention threshold limit reached at ${thresholdCapitalRetention}`
      );
      processOrder = false;
    }
  }

  // if trading halted (to sell off positions)
  if (haltTrading) {
    processOrder = false;
  }

  // if qty is less than 1 share of the security
  if (!qty || qty < 1) {
    processOrder = false;
  }

  // if more stock positions than cap
  if (side == "buy" && amountOfPositions >= thresholdStockCap) {
    processOrder = false;
    console.log(`ORDER: Too many current positions to purchase ${symbol}`);
  }

  // if already ordered stock then decline order buy
  if (
    !settings.isBacktest &&
    checkOrderedAlready(stockData.orders, symbol, side)
  ) {
    processOrder = false;
    console.log(`ORDER: Already purchased ${symbol}`);
  }

  if (
    !settings.isBacktest &&
    checkOrderedTooRecently(
      stockData.settings,
      stockData.orders,
      symbol,
      side,
      dateTime
    )
  ) {
    processOrder = false;
    console.log(
      `ORDER: Sell order for ${symbol} too close to recent buy order`
    );
  }

  // if cost is higher than balance then can't buy
  if (side == "buy" && qty * price > balance) {
    processOrder = false;
  }

  // if all good then add order to queue to be processed
  if (processOrder) {
    stockData = addOrderToQueue(
      tradingProvider,
      stockData,
      stockIndex,
      side,
      qty,
      price,
      balance,
      dateTime
    );
  }

  return stockData;
};

/**
 * Add order to queue (logs) to be processed (along with reset signals, portfolio sync + console output)
 *
 * @param {(Alpaca|TradingProvider)} tradingProvider
 * @param {number} stockIndex
 * @param {Object} stockData
 * @param {string} side
 * @param {number} qty
 * @param {number} price
 * @param {number} balance
 * @param {number} dateTime
 *
 * @returns {Object} stockData
 */
const addOrderToQueue = (
  tradingProvider,
  stockData,
  stockIndex,
  side,
  qty,
  price,
  balance,
  dateTime
) => {
  // if backtest then create order (live orders are processed via trading provider)
  if (stockData.settings.isBacktest) {
    tradingProvider.createOrder({
      symbol: stockData.stocks[stockIndex].symbol,
      qty: qty,
      side: side,
      type: "market",
      time_in_force: "day"
    });

    console.log(
      `ORDER: ${side} / ${moment(dateTime).format(
        "DD/MM/YYYY h:mm:ss a"
      )} >>>>>>> ${
        stockData.stocks[stockIndex].symbol
      } (Price: ${price} / Amount: ${qty * price})`
    );
  }

  // add order to order logs
  stockData = addToOrderLogs(
    stockData,
    stockIndex,
    side,
    qty,
    price,
    balance,
    dateTime
  );

  // update portfolio balance
  stockData = updateBalance(stockData, side, qty, price);

  // update portfolio
  stockData = updatePositions(
    tradingProvider,
    stockData,
    stockIndex,
    side,
    qty,
    price,
    balance
  );

  // reset signals for all stocks
  stockData = resetPositionsSignals(stockData);

  return stockData;
};

/**
 * Checks if ordered already today, if so don't buy.
 *
 * @param {Object[]} orders
 * @param {string} symbol
 * @param {string} side
 *
 * @returns {boolean}
 */
const checkOrderedAlready = (orders, symbol, side) => {
  return side === "buy" && !_.isEmpty(_.filter(orders, { symbol: symbol }))
    ? true
    : false;
};

/**
 * Checks if current sell order is too close to recent buy order for same stock
 *
 * @param {Object[]} orders
 * @param {string} symbol
 * @param {string} side
 * @param {number} dateTime
 *
 * @returns {boolean} blockOrder
 */
const checkOrderedTooRecently = (settings, orders, symbol, side, dateTime) => {
  let blockOrder = false;

  if (dateTime) {
    let blockedOrders = _.filter(
      orders,
      order =>
        order.symbol == symbol &&
        moment
          .duration(moment(order.dateTime).diff(moment(dateTime)))
          .asMinutes() > settings.thresholdBuyTimeRestriction
    );

    if (!_.isEmpty(blockedOrders)) {
      blockOrder = true;
    }
  }

  return blockOrder;
};

/**
 * Calculates ROI from last buy order and current sell order
 *
 * @param {Object} stockData
 * @param {string} symbol
 * @param {string} side
 * @param {number} qty
 * @param {number} price
 *
 * @returns {number} roi
 */
const getOrderRoi = (stockData, symbol, side, qty, price) => {
  let roi = 0;
  let amount = qty && price ? qty * price : 0;

  if (side == "sell" && amount > 0) {
    let orderIndex = _.findLastIndex(stockData.orders, {
      side: "buy",
      symbol: symbol
    });

    if (
      !_.isEmpty(stockData.orders) &&
      orderIndex &&
      typeof stockData.orders[orderIndex] !== "undefined"
    ) {
      if (stockData.orders[orderIndex].hasOwnProperty("amount")) {
        roi =
          (amount - stockData.orders[orderIndex].amount) /
          stockData.orders[orderIndex].amount;
      }
    }
  }

  return roi;
};

/**
 * Adds order to order logs
 *
 * @param {Object} stockData
 * @param {number} stockIndex
 * @param {string} symbol
 * @param {string} side
 * @param {number} price
 * @param {number} balance
 * @param {number} dateTime
 *
 * @returns {Object} stockData
 */
const addToOrderLogs = (
  stockData,
  stockIndex,
  side,
  qty,
  price,
  balance,
  dateTime
) => {
  let amount = qty * price;
  let roi = getOrderRoi(
    stockData,
    stockData.stocks[stockIndex].symbol,
    side,
    qty,
    price
  );

  let order = {
    symbol: stockData.stocks[stockIndex].symbol,
    side: side,
    qty: qty,
    price: price,
    amount: amount,
    balanceAtBuy: !isNaN(parseFloat(balance)) ? parseFloat(balance) : 0,
    balanceAtSell: !isNaN(parseFloat(stockData.portfolio.cash))
      ? parseFloat(stockData.portfolio.cash)
      : 0,
    signals: stockData.stocks[stockIndex].signals,
    session: stockData.session._id,
    roi: roi,
    clientOrderId: null,
    processed: stockData.settings.isBacktest ? true : false,
    cancelled: false,
    dateTime: dateTime
  };

  stockData.orders.push(order);

  // add order to mongo (but if backtest then add orders in bulk upon results)
  if (!stockData.settings.isBacktest) {
    database.mongodbCreateOrder(order);
  }

  // write socket to frontend trading terminal
  outputs.writeOutput(order, "receive_orders", stockData.io, false);
  outputs.writeOutput(
    { dateTime: dateTime },
    "receive_clock",
    stockData.io,
    false
  );

  return stockData;
};

module.exports = {
  createOrder,
  checkOrderedAlready,
  checkOrderedTooRecently,
  getOrderRoi,
  addToOrderLogs,
  addOrderToQueue
};
