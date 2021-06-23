const _ = require("lodash");
const moment = require("moment-timezone");

const outputs = require("./outputs");

/**
 * Syncs if live positions available, then delete all local/saved
 *
 * @param {(Alpaca|TradingProvider)} tradingProvider
 * @param {Object} stockData
 * @param {Object} positions
 *
 * @returns {Object} stockData
 */
const syncPortfolioPostions = (tradingProvider, stockData, positions) => {
  // if live synced positions available, then delete all local/saved
  if (positions && positions.length > 0) {
    stockData.portfolio.positions = [];

    // loop through synced positions and update local/saved portfolio positions
    _.forOwn(positions, (position, index) => {
      let profit = position.market_value - position.cost_basis;

      let addPosition = {
        symbol: position.symbol,
        side: "buy",
        qty: position.qty,
        price: position.lastday_price,
        amount: position.qty * position.lastday_price,
        balanceBefore: stockData.portfolio.cash,
        balanceAfter: stockData.portfolio.cash,
        profit: !isNaN(parseFloat(profit)) ? profit : 0.0
      };

      stockData.portfolio.positions.push(addPosition);
    });

    // write socket to frontend trading terminal
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
  }

  return stockData;
};

module.exports = {
  syncPortfolioPostions
};
