const baseProvider = require("./base");
const backtestProvider = require("./backtest");

const tradingStocks = require("../../services/stocks");
const tradingAlgos = require("../../services/algos");
const outputs = require("../../services/outputs");
const database = require("../../services/database");

/**
 * Initializes Alpaca trading provider (and if live / paper trading or back testing enabled)
 *
 * @param {Object} settings
 * @param {Object} session
 * @param {Object} io
 *
 * @returns {(Alpaca|TradingProvider)} tradingProvider
 */
const initialize = (settings, session, io) => {
  return !settings.isBacktest
    ? alpacaLive(settings, session, io)
    : backtestProvider.alpacaBacktest(settings, session, io);
};

/**
 * Runs the live Alpaca trading provider
 *
 * @param {Object} settings
 * @param {Object} session
 * @param {Object} io
 */
const alpacaLive = async (settings, session, io) => {
  const trading = baseProvider.initializeAlpaca();

  /* get array of stocks */
  const stocks = await tradingStocks.getStocks(settings);

  await trading
    .getClock()
    .then(async (res) => {
      // const start = moment().format("YYYY-MM-DD") + "T00:00:00.000Z";
      // const until = moment
      //   .tz(moment(), "America/New_York")
      //   .subtract(16, "minutes")
      //   .format();
      // const bars = trading.getMultiBarsAsyncV2(["AFL", "SPGI"], {
      //   start: start,
      //   end: until,
      //   timeframe: "1Min",
      // });
      // const got = [];
      // for await (let b of bars) {
      //   got.push(b);
      // }
      // console.log("bars: ", got);

      // Check market is open first (or crypto setting is enabled)
      if (res.is_open || settings.enableCrypto) {
        if (settings.enableCrypto) {
          outputs.writeOutput(
            "Crypto enabled",
            "receive_market_closed",
            io,
            true
          );
        }

        trading.getAccount().then((account) => {
          if (account.pattern_day_trader) {
            console.log(
              "Is this trading account flagged as PDT? " +
                account.pattern_day_trader
            );
          }

          settings.startingCapital = account.cash
            ? account.cash
            : settings.startingCapital;

          trading
            .getPositions()
            .then(async (positions) => {
              // get orders from today (in case of previous failure)
              let orders = await baseProvider.syncOrders(session, io);

              // initial stock data and then start analysis (based on provider)
              await tradingStocks
                .initializeStockData(
                  trading,
                  stocks,
                  settings,
                  positions,
                  orders,
                  session,
                  io
                )
                .then((stockData) => {
                  // write socket to frontend trading terminal
                  outputs.writeOutput(
                    {
                      startValue: stockData.portfolio.startingCapital,
                      endValue: stockData.portfolio.cash,
                      roi: 0,
                    },
                    "receive_result",
                    stockData.io,
                    false
                  );
                  outputs.writeOutput(
                    { dateTime: null },
                    "receive_clock",
                    stockData.io,
                    false
                  );

                  // loop through algos to create initial setup for each stock
                  stockData = tradingAlgos.initializeAlgos(stockData);

                  const client = !settings.enableCrypto
                    ? trading.data_stream_v2
                    : trading.crypto_stream_v2;

                  client.onConnect(async () => {
                    tradingStocks.subscribeToStocks(client, stocks, settings);

                    outputs.writeOutput(
                      stockData.stocks,
                      "receive_stocks",
                      stockData.io,
                      false
                    );

                    if (!settings.isBacktest) {
                      setInterval(
                        async () =>
                          (stockData = await baseProvider.checkAccountRoi(
                            trading,
                            stockData,
                            client
                          )),
                        30000 // check ROI and current positions every 30 secs
                      );

                      setInterval(
                        async () =>
                          (stockData = await baseProvider.updateOrders(
                            trading,
                            stockData
                          )),
                        60000 // update orders every 60 secs
                      );

                      setInterval(
                        async () =>
                          (stockData = await baseProvider.updateSubcribedStocks(
                            trading,
                            stockData,
                            client
                          )),
                        1000 * 900 // update subscribed stocks every 15 mins
                      );

                      setInterval(
                        async () =>
                          (stockData =
                            await baseProvider.checkOrdersToBeProcessed(
                              trading,
                              stockData
                            )),
                        5000 // check for new orders to process every 5 secs
                      );
                    }
                  });

                  client.onError((err) => {
                    console.log("Trading client data error: ", err);
                  });

                  // loop through algos for calculations
                  if (!settings.enableCrypto) {
                    client.onStockBar(async (data) => {
                      // console.log("Real-time market data: ", data);
                      if (stockData.haltTrading !== true) {
                        stockData = tradingAlgos.calculateAlgos(
                          trading,
                          stockData,
                          data
                        );
                      }
                    });
                  } else {
                    client.onCryptoBar(async (data) => {
                      // console.log("Real-time market data: ", data);
                      if (stockData.haltTrading !== true) {
                        stockData = tradingAlgos.calculateAlgos(
                          trading,
                          stockData,
                          data
                        );
                      }
                    });
                  }

                  client.onDisconnect(async () => {
                    console.log("Disconnected");
                    await database.mongodbClose();
                  });

                  client.connect();
                });
            })
            .catch(async (err) => {
              console.log("ERROR: ALPACA POSITIONS");
              console.log(err);
              await database.mongodbClose();
            });
        });
      } else {
        outputs.writeOutput(
          "Market is closed",
          "receive_market_closed",
          io,
          true
        );
        await database.mongodbClose();
      }
    })
    .catch(async (err) => {
      outputs.writeOutput(
        "ERROR: ALPACA CLOCK",
        "receive_market_closed",
        io,
        true
      );
      console.log(err.error);
      await database.mongodbClose();
    });
};

module.exports = {
  initialize,
  alpacaLive,
};
