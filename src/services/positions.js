const _ = require("lodash");
const moment = require("moment-timezone");

const outputs = require("./outputs");

/**
 * Get current portfolio positions quantity (from local memory)
 *
 * @param {Object} stockData
 * @param {string} symbol
 *
 * @returns {Object} positions
 */
const getPositions = (stockData, symbol) => {
  let positions = {
    name: symbol,
    current: 0,
    total: stockData.portfolio.positions.length
  };

  _.forOwn(stockData.portfolio.positions, (position, index) => {
    if (position.symbol == symbol) {
      positions.current = positions.current + position.qty;
    }
  });

  return positions;
};

/**
 * Gets a specific portfolio position (from local memory)
 *
 * @param {Object} stockData
 * @param {string} symbol
 *
 * @returns {Object} position
 */
const getPosition = (stockData, symbol) => {
  let positionIndex = _.findLastIndex(stockData.portfolio.positions, {
    symbol: symbol
  });

  return stockData.portfolio.positions[positionIndex];
};

/**
 * Updates portfolio cash/balance
 *
 * @param {Object} stockData
 * @param {string} side
 * @param {number} qty
 * @param {number} price
 *
 * @returns {Object} stockData
 */
const updateBalance = (stockData, side, qty, price) => {
  stockData.portfolio.cash =
    side == "sell"
      ? stockData.portfolio.cash + qty * price
      : stockData.portfolio.cash - qty * price;

  return stockData;
};

/**
 * Updates portfolio positions
 *
 * @param {(Alpaca|TradingProvider)} tradingProvider
 * @param {Object} stockData
 * @param {number} stockIndex
 * @param {string} side
 * @param {number} qty
 * @param {number} price
 * @param {number} balanceBefore
 *
 * @returns {Object} stockData
 */
const updatePositions = (
  tradingProvider,
  stockData,
  stockIndex,
  side,
  qty,
  price,
  balanceBefore
) => {
  if (side == "buy") {
    // add order to positions
    let addPosition = {
      symbol: stockData.stocks[stockIndex].symbol,
      side: side,
      qty: qty,
      price: price,
      amount: qty * price,
      balanceBefore: balanceBefore,
      balanceAfter: stockData.portfolio.cash,
      profit: 0
    };

    stockData.portfolio.positions.push(addPosition);
  } else {
    // remove order from positions
    stockData.portfolio.positions = _.filter(
      stockData.portfolio.positions,
      position => position.symbol !== stockData.stocks[stockIndex].symbol
    );
  }

  // write socket to frontend trading terminal
  outputs.writeOutput(
    stockData.portfolio.positions,
    "receive_positions",
    stockData.io,
    false
  );
  outputs.writeOutput({ dateTime: null }, "receive_clock", stockData.io, false);

  // update the stock's last order
  stockData.stocks[stockIndex].lastOrder = side.toUpperCase();

  // reset all signals for specific stock
  stockData.stocks[stockIndex].signals = [];

  return stockData;
};

/**
 * Resets signals for all stocks
 *
 * @param {Object} stockData
 *
 * @returns {Object} stockData
 */
const resetPositionsSignals = stockData => {
  if (stockData.settings.resetSignals) {
    _.forOwn(stockData.stocks, (stock, index) => {
      stockData.stocks[index].signals = [];
    });
  }

  return stockData;
};

module.exports = {
  getPositions,
  getPosition,
  updatePositions,
  updateBalance,
  resetPositionsSignals
};
