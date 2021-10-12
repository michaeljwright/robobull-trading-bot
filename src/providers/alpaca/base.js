const _ = require("lodash");
const moment = require("moment-timezone");

const Alpaca = require("@alpacahq/alpaca-trade-api");

const { syncPortfolioPostions } = require("../../services/portfolio");

const {
  addOrderToQueue,
  checkOrderedTooRecently,
  getOrderRoi
} = require("../../services/orders");

const tradingStocks = require("../../services/stocks");
const outputs = require("../../services/outputs");
const database = require("../../services/database");
const errors = require("../../services/errors");

/**
 * Initializes Alpaca trading provider
 *
 * @returns {(Alpaca|TradingProvider)} tradingProvider
 */
const initializeAlpaca = () => {
  return new Alpaca({
    keyId: process.env.API_KEY,
    secretKey: process.env.SECRET_API_KEY,
    paper: true,
    usePolygon: false
  });
};

/**
 * Updates today's orders (and average prices) based on Alpaca Orders API
 *
 * @param {(Alpaca|TradingProvider)} tradingProvider
 * @param {Object} stockData
 *
 * @returns {Object} stockData
 */
const updateOrders = async (tradingProvider, stockData) => {
  // set order settings for API call
  let orderSettings = {
    status: "closed",
    after: moment()
      .subtract(1, "days")
      .endOf("day")
      .toISOString(),
    until: moment().toISOString(),
    direction: "desc"
  };

  // get orders
  await tradingProvider
    .getOrders(orderSettings)
    .then(async orders => {
      _.forOwn(orders, async order => {
        // order details (if order filled)
        if (order.filled_avg_price) {
          // find order in memory
          let orderIndex = _.findLastIndex(stockData.orders, {
            symbol: order.symbol,
            side: order.side
          });

          if (orderIndex > 0) {
            let roi = getOrderRoi(
              stockData,
              order.symbol,
              order.side,
              order.filled_qty,
              order.filled_avg_price
            );

            let filledOrder = {
              symbol: order.symbol,
              processed: true,
              updatedAt: order.updated_at
                ? moment.tz(order.updated_at, process.env.TIMEZONE).valueOf()
                : moment()
                    .tz(process.env.TIMEZONE)
                    .valueOf(),
              qty: order.filled_qty,
              price: order.filled_avg_price,
              amount: order.filled_qty * order.filled_avg_price,
              roi: !isNaN(parseFloat(roi))
                ? roi
                : stockData.orders[orderIndex].roi
            };

            // update mongodb
            await database.mongodbUpdateOrder(
              {
                clientOrderId: order.client_order_id
              },
              filledOrder
            );

            // update data in memory
            stockData.orders[orderIndex].processed = filledOrder.processed;
            stockData.orders[orderIndex].qty = filledOrder.qty;
            stockData.orders[orderIndex].price = filledOrder.price;
            stockData.orders[orderIndex].amount = filledOrder.amount;
            stockData.orders[orderIndex].roi =
              filledOrder.roi !== 0
                ? filledOrder.roi
                : stockData.orders[orderIndex].roi;
          }
        }
      });

      // update view
      outputs.writeOutput(
        stockData.orders,
        "receive_orders",
        stockData.io,
        false
      );
      outputs.writeOutput(null, "receive_clock", stockData.io, false);
    })
    .catch(err => {
      errors.log("ERROR: ALPACA GET ORDERS", "info", true);
      errors.log(err, "error");
    });

  return stockData;
};

/**
 * Syncs today's orders from mongo based on session (only if processed)
 *
 * @param {Object} session
 * @param {Object} io
 *
 * @returns {Object[]} orders
 */
const syncOrders = async (session, io) => {
  let orders = [];

  try {
    let previousSessions = await database.mongodbGetSessions(
      {
        userId: session.userId,
        isBacktest: false,
        created: {
          $gte: moment().startOf("day"),
          $lt: moment().endOf("day")
        }
      },
      { sort: { created: -1 } }
    );

    if (!_.isEmpty(previousSessions)) {
      // take only session ids found for user today
      previousSessions = _.uniq(_.map(previousSessions, "_id"));

      try {
        orders = await database.mongodbGetOrders({
          processed: true,
          session: { $in: previousSessions },
          created: {
            $gte: moment().startOf("day"),
            $lt: moment().endOf("day")
          }
        });

        // TODO: update memory with today's previous processed orders

        // update view with today's previously processed orders
        outputs.writeOutput(orders, "receive_orders", io, false);
      } catch (err) {
        errors.log(err, "error");
      }
    }
  } catch (err) {
    errors.log(err, "error");
  }

  return orders;
};

/**
 * Processes orders that have been added to queue within mongo
 *
 * @param {(Alpaca|TradingProvider)} tradingProvider
 * @param {Object} stockData
 *
 * @returns {Object} stockData
 */
const checkOrdersToBeProcessed = async (tradingProvider, stockData) => {
  let orders = [];

  // check if trading halted and exit() process
  try {
    let session = await database.mongodbGetSessions({
      _id: stockData.session._id,
      haltTrading: true,
      created: {
        $gte: moment().startOf("day"),
        $lt: moment().endOf("day")
      }
    });

    // send kill process via socket to update view
    if (!_.isEmpty(session)) {
      outputs.writeOutput(
        session[0],
        "receive_halt_trading",
        stockData.io,
        false
      );
      console.log("Trading halted. You must restart the process to continue.");

      // kill process by exiting
      process.exit();
    } else {
      outputs.writeOutput(
        stockData.session,
        "receive_halt_trading",
        stockData.io,
        false
      );
    }
  } catch (err) {
    errors.log(err, "error");
  }

  try {
    // get unprocessed orders from datasource
    orders = await database.mongodbGetOrders({
      processed: false,
      session: stockData.session._id,
      created: { $gte: moment().startOf("day"), $lt: moment().endOf("day") }
    });

    if (!_.isEmpty(orders)) {
      // loop through orders not yet processed and create live orders
      _.forOwn(orders, async (order, orderIndex) => {
        let processOrder = true;

        // check if buy order stock has a change percentage above X%, if so reject order
        if (stockData.settings.useStockQuotePercentage) {
          let stock = await tradingStocks.getStockQuote(
            order.symbol,
            stockData.settings
          );

          if (!_.isEmpty(stock)) {
            if (
              stock.changesPercentage >
              stockData.settings.stockQuotePercentageChangeRangeTo
            ) {
              console.log(
                stock.symbol +
                  " percentage change is higher than " +
                  stockData.settings.stockQuotePercentageChangeRangeTo
              );
              processOrder = false;
            }
          }
        }

        if (processOrder) {
          await tradingProvider
            .createOrder({
              symbol: order.symbol,
              qty: order.qty,
              side: order.side,
              type: "market", // TODO: change to limit order rather than market order
              time_in_force: "day"
            })
            .then(async res => {
              // update orders if order successful
              if (res.status == "accepted") {
                // update order properties
                order.processed = true;
                order.dateTime = moment
                  .tz(res.created_at, process.env.TIMEZONE)
                  .valueOf();
                order.clientOrderId = res.client_order_id;

                // update mongodb
                try {
                  let orderUpdated = await database.mongodbUpdateOrder(
                    { _id: order._id },
                    order
                  );
                  if (!_.isEmpty(orderUpdated)) {
                    // update data in memory
                    stockData.orders[orderIndex].processed = order.processed;
                    stockData.orders[orderIndex].dateTime = order.dateTime;
                    stockData.orders[orderIndex].clientOrderId =
                      order.clientOrderId;

                    // output to console
                    console.log(
                      `ORDER: ${order.side} / ${moment(order.dateTime).format(
                        "DD/MM/YYYY h:mm:ss a"
                      )} >>>>>>> ${order.symbol} (Price: ${
                        order.price
                      } / Amount: ${order.qty * order.price} / ROI: ${
                        order.roi
                      })`
                    );
                  }
                } catch (err) {
                  console.log("ERROR: MONGO ORDER UPDATE");
                  errors.log(err, "error");
                }
              } else {
                processOrder = false;
                errors.log(
                  "ERROR: ALPACA ORDER NOT PROCESSED (API RESPONSE) FOR " +
                    order.symbol,
                  "info",
                  true
                );
              }
            })
            .catch(err => {
              processOrder = false;
              errors.log(
                "ERROR: ALPACA ORDER NOT PROCESSED (API CALL) FOR " +
                  order.symbol,
                "info",
                true
              );
            });
        }

        if (!order.processed) {
          // If we aren't processing the order based on stock percentage range then we need to cancel it
          // TODO: Delete order from view via socket
          order.processed = true;
          order.cancelled = true;
          try {
            let orderUpdated = await database.mongodbUpdateOrder(
              { _id: order._id },
              order
            );
            if (!_.isEmpty(orderUpdated)) {
              stockData.orders[orderIndex].processed = order.processed;
              stockData.orders[orderIndex].cancelled = order.cancelled;
            }
          } catch (err) {
            errors.log(
              "ERROR: MONGODB ORDER UPDATE FOR " + order.symbol,
              "info",
              true
            );
            errors.log(err, "error");
          }
        }
      });
    }
  } catch (err) {
    errors.log(err, "error");
  }

  return stockData;
};

/**
 * Gets latest screener stocks & update subscribers for market data
 *
 * @param {(Alpaca|TradingProvider)} tradingProvider
 * @param {Object} stockData
 *
 * @returns {Object} stockData
 */
const updateSubcribedStocks = async (tradingProvider, stockData, client) => {
  // get current positions
  await tradingProvider
    .getPositions()
    .then(async positions => {
      // positions
      // [{ "avg_entry_price": "is the price paid", "current_price": "is the price now"}]

      // get latest stocks from screener
      let stocks = await tradingStocks.getStocks(stockData.settings);

      // add current positions to stocks to be subscribed to
      if (positions.length > 0) {
        stocks = _.union(stocks, _.map(positions, "symbol"));
      }

      if (stocks.length > 0) {
        // update stockData to keep current positions
        await tradingStocks
          .updateStockData(tradingProvider, stocks, stockData)
          .then(updatedStockData => {
            stockData = updatedStockData;
            tradingStocks.subscribeToStocks(client, stocks, stockData.settings);

            // sync position, calculate profit and write socket to frontend trading terminal
            stockData = syncPortfolioPostions(
              tradingProvider,
              stockData,
              positions
            );
          })
          .catch(err => {
            errors.log(
              "ERROR: ALPACA POSITIONS ON STOCKDATA UPDATE",
              "info",
              true
            );
            errors.log(err, "error");
          });
      } else {
        errors.log("ERROR: NO NEW STOCKS TO SUBCRIBE TO", "info", true);
      }
    })
    .catch(err => {
      errors.log("ERROR: ALPACA POSITIONS SUBSCRIBED STOCKS", "info", true);
      errors.log(err, "error");
    });

  return stockData;
};

/**
 * Checks ROI of current positions against stop loss and take profit thresholds then sells accordingly
 *
 * @param {(Alpaca|TradingProvider)} tradingProvider
 * @param {Object} stockData
 *
 * @returns {Object} stockData
 */
const checkPositionsRoi = (tradingProvider, stockData, positions) => {
  stockData.portfolio.tmp = positions;

  _.forOwn(positions, async (position, positionIndex) => {
    let roi =
      (position.current_price - position.avg_entry_price) /
      position.avg_entry_price;

    let amount = position.qty * position.avg_entry_price;

    let profitLoss = amount * roi;

    let positionThresholdPlaceOrder = null;

    let currentDateTime = moment()
      .tz(process.env.TIMEZONE)
      .valueOf();

    console.log(
      "Position: " +
        position.symbol +
        " | ROI: " +
        roi +
        " | Profit/Loss: " +
        profitLoss
    );

    // Check position ROI against order stop loss threshold in settings
    if (roi <= stockData.settings.orderStopLoss) {
      positionThresholdPlaceOrder = "sell";
      console.log(
        "^ Position below -0.006 threshold at " +
          moment(currentDateTime).format("DD/MM/YYYY h:mm:ss a")
      );
    }

    // Check if ordered too recently
    if (
      checkOrderedTooRecently(
        stockData.settings,
        stockData.orders,
        position.symbol,
        position.side,
        currentDateTime
      )
    ) {
      positionThresholdPlaceOrder = null;
    }

    // Check position ROI against order take profit threshold in settings (last to avoid ordered to recently check)
    if (roi > stockData.settings.orderTakeProfit) {
      positionThresholdPlaceOrder = "sell";
      console.log(
        "^ Position above 0.015 threshold at " +
          moment(currentDateTime).format("DD/MM/YYYY h:mm:ss a")
      );
    }

    // Update portfolio positions / balance / add to order queue (if threshold hit)
    if (positionThresholdPlaceOrder) {
      let stockIndex = _.findLastIndex(stockData.stocks, {
        symbol: position.symbol
      });
      stockData = addOrderToQueue(
        tradingProvider,
        stockData,
        stockIndex,
        positionThresholdPlaceOrder,
        position.qty,
        position.current_price,
        stockData.portfolio.cash,
        currentDateTime
      );

      // remove position from current positions and put positions in temp array
      stockData.portfolio.tmp = _.filter(
        stockData.portfolio.tmp,
        record => record.symbol !== position.symbol
      );
    }
  });

  return stockData;
};

/**
 * Updates (and display in console) ROI
 *
 * @param {Object} stockData
 * @param {number} roi
 * @param {number} balance
 * @param {boolean} display
 *
 * @returns {Object} stockData
 */
const updateAndDisplayAccountRoi = (
  stockData,
  roi,
  balance,
  display = true
) => {
  let changeRoi = 0;

  if (
    !isNaN(stockData.lastRoi) &&
    stockData.lastRoi !== 0 &&
    !isNaN(roi) &&
    roi !== 0
  ) {
    changeRoi = (roi - stockData.lastRoi) / roi;
  }

  if (display && !isNaN(roi)) {
    console.log(
      `>>> CURRENT ROI: ${roi.toFixed(2)}% (CHANGE: ${changeRoi.toFixed(2)}%)`
    );
  }

  stockData.lastRoi = roi;
  stockData.portfolio.cash = !isNaN(balance) ? balance : 0;

  // write socket to frontend trading terminal
  outputs.writeOutput(
    {
      startValue: stockData.portfolio.startingCapital,
      endValue: stockData.portfolio.cash,
      roi: roi
    },
    "receive_result",
    stockData.io,
    false
  );
  outputs.writeOutput({ dateTime: null }, "receive_clock", stockData.io, false);

  return stockData;
};

/**
 * Checks account ROI for automatically closing positions or if market about to close
 *
 * @param {(Alpaca|TradingProvider)} tradingProvider
 * @param {Object} stockData
 * @param {Object} client
 *
 * @returns {Object} stockData
 */
const checkAccountRoi = async (tradingProvider, stockData, client) => {
  let roi;
  // check if market closes soon (rebalance positions / potenital sells based on ROI)
  if (!(await checkMarketOpen(tradingProvider, stockData))) {
    stockData.marketClosing = true;
  }

  // check current ROI for today
  await tradingProvider
    .getAccount()
    .then(async account => {
      roi =
        ((account.equity - account.last_equity) / account.last_equity) * 100;

      stockData = updateAndDisplayAccountRoi(stockData, roi, account.cash);
    })
    .catch(err => {
      console.log("ERROR: ALPACA ACCOUNT");
      errors.log(err, "error");
    });

  // get current positions
  await tradingProvider
    .getPositions()
    .then(async positions => {
      // check ROI on all positions
      stockData = checkPositionsRoi(tradingProvider, stockData, positions);

      positions = !_.isEmpty(stockData.portfolio.tmp)
        ? stockData.portfolio.tmp
        : positions;

      if (
        roi > stockData.settings.roiToClosePositions ||
        roi < stockData.settings.roiToResetPositions ||
        stockData.marketClosing
      ) {
        // set halt trading to true (no more buys allowed)
        stockData.haltTrading = true;
        let closePositions = true;

        if (
          positions.length > 0 &&
          stockData.settings.useClosePositionsBeforeMarketClose
        ) {
          // sell based on ROI of all positions (sorted by highest first)
          positions = _.orderBy(positions, ["unrealized_plpc"], ["desc"]);
          let position = _.first(positions); // get first position to close / sell

          // find this specific position in memory
          let stockIndex = _.findLastIndex(stockData.stocks, {
            symbol: position.symbol
          });

          // check in case orderHoldUntilProfit enabled and position has negative ROI
          if (
            stockData.settings.orderHoldUntilProfit &&
            parseFloat(position["unrealized_plpc"]) < 0
          ) {
            closePositions = false;
          }

          if (closePositions) {
            // Update portfolio positions / balance / add to order queue
            stockData = addOrderToQueue(
              tradingProvider,
              stockData,
              stockIndex,
              "sell",
              position.qty,
              position.current_price,
              stockData.portfolio.cash,
              moment()
                .tz(process.env.TIMEZONE)
                .valueOf()
            );
          }
        } else {
          if (
            roi > stockData.settings.roiToClosePositions ||
            stockData.marketClosing
          ) {
            // no more positions so OK to end trading today
            if (roi > stockData.settings.roiToClosePositions) {
              console.log(
                "End trading as ROI is greater than " +
                  stockData.settings.roiToClosePositions
              );
            }

            let result = {
              startValue: stockData.portfolio.startingCapital,
              endValue: stockData.portfolio.cash,
              roi: roi
            };
            await outputs.mongodbOutputResults(stockData, result);

            stockData.session.haltTrading = true;

            outputs.writeOutput(
              stockData.session,
              "receive_halt_trading",
              stockData.io,
              false
            );

            outputs.writeOutput(
              "Market is closed",
              "receive_market_closed",
              stockData.io,
              false
            );

            client.disconnect(); // disconnect to trading web socket after all positions have been closed
            process.exit(); // stops the service
          }
        }
      }
    })
    .catch(err => {
      console.log("ERROR: ALPACA POSITIONS ON ROI CHECK");
      errors.log(err, "error");
    });

  return stockData;
};

/**
 * Checks if market is open
 *
 * @param {(Alpaca|TradingProvider)} tradingProvider
 * @param {Object} stockData
 *
 * @returns {boolean} isMarketOpen
 */
const checkMarketOpen = async (tradingProvider, stockData) => {
  let isMarketOpen = true;
  let timeToClose;

  await tradingProvider
    .getClock()
    .then(async resp => {
      var closingTime = new Date(
        resp.next_close.substring(0, resp.next_close.length - 6)
      );
      var currTime = new Date(
        resp.timestamp.substring(0, resp.timestamp.length - 6)
      );
      timeToClose = Math.abs(closingTime - currTime);

      if (timeToClose < 60000 * 15 || resp.is_open === false) {
        isMarketOpen = false;

        // Close all positions when 15 minutes til market close.
        console.log("Market closing soon. Liquidating positions.");
      }
    })
    .catch(err => {
      errors.log(err, "error");
    });

  return isMarketOpen;
};

module.exports = {
  initializeAlpaca,
  updateOrders,
  syncOrders,
  checkOrdersToBeProcessed,
  updateSubcribedStocks,
  checkPositionsRoi,
  updateAndDisplayAccountRoi,
  checkAccountRoi,
  checkMarketOpen
};
