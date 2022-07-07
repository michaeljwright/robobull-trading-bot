const fs = require("fs");
const path = require("path");
const _ = require("lodash");
const axios = require("axios");
const fetch = require("cross-fetch");
const moment = require("moment-timezone");

const tradingPortfolio = require("./portfolio");
const tradingAlgos = require("./algos");
const outputs = require("./outputs");
const screeners = require("./screeners");

const stocksFile = path.join(
  path.dirname(process.mainModule.filename),
  "config",
  "stocks.json"
);

const cryptoFile = path.join(
  path.dirname(process.mainModule.filename),
  "config",
  "crypto.json"
);

/**
 * Subscribes to market data on supplied stocks (via socket)
 *
 * @param {Object)} client
 * @param {Object[]} stocks
 * @param {Object} settings
 */
const subscribeToStocks = (client, stocks, settings) => {
  client.subscribeForBars(stocks);

  if (settings.isBacktest === false) {
    outputs.consoleOutputStockData(stocks, settings);
  }
};

/**
 * Gets stocks from screener + defaults (depending on settings)
 *
 * @param {Object} settings
 *
 * @returns {Object[]} stocks
 */
const getStocks = async (settings) => {
  let defaultStocks = JSON.parse(fs.readFileSync(stocksFile));
  let cryptoSymbols = JSON.parse(fs.readFileSync(cryptoFile));
  let stocks = [];

  if (settings.enableCrypto) {
    stocks = cryptoSymbols;
  } else {
    if (!settings.isBacktest) {
      if (settings.useStockScreener) {
        stocks = await screeners.getStocks();

        if (
          _.uniq(_.union(defaultStocks, stocks)).length <= 150 &&
          settings.useDefaultStocks
        ) {
          stocks = _.uniq(_.union(defaultStocks, stocks));
        }
      } else {
        stocks = defaultStocks;
      }
    } else {
      stocks = defaultStocks;
    }
  }

  return _.take(_.uniq(stocks), settings.stockDataLimit);
};

/**
 * Gets a stock quote for a specific stock symbol / ticker
 *
 * @param {Object} stocks
 * @param {Object} settings
 *
 * @returns {Promise} stock
 */
const getStockQuote = async (stock, settings) => {
  return new Promise(function (resolve, reject) {
    let financialModelingPrepApiKey =
      process.env.FINANCIAL_MODELING_PREP_API_KEY;

    if (stock && financialModelingPrepApiKey) {
      axios
        .get(
          "https://financialmodelingprep.com/api/v3/quote/" +
            stock +
            "?apikey=" +
            financialModelingPrepApiKey
        )
        .then((response) => {
          if (!_.isEmpty(response.data)) {
            stock = response.data[0];
            resolve(stock);
          } else {
            console.log("ERROR: StockQuote data empty");
            resolve([]);
          }
        })
        .catch(function (err) {
          console.log("ERROR: StockQuote api error");
          console.error(err);
          resolve([]);
        });
    } else {
      console.log("ERROR: StockQuote no stock provided");
      resolve([]);
    }
  });
};

/**
 * Gets market data for US securities based on given parameters such as stock symbols + start/end date
 *
 * @param {(Alpaca|TradingProvider)} tradingProvider
 * @param {Object[]} stocks
 * @param {Date} start
 * @param {Date} end
 * @param {number} limit
 *
 * @returns {Object[]} cryptoBars
 */
const getMarketData = async (
  tradingProvider,
  stocks,
  start,
  end,
  limit = 10000
) => {
  let marketBars = null;

  barsData = tradingProvider.getMultiBarsAsyncV2(stocks, {
    start: start,
    end: end,
    timeframe: "1Min",
  });

  const bars = [];
  for await (let b of barsData) {
    bars.push(b);
  }

  if (bars) {
    marketBars = bars;
  }

  return marketBars;
};

/**
 * Gets market data for Crypto based on given parameters such as symbols + start/end date
 *
 * @param {(Alpaca|TradingProvider)} tradingProvider
 * @param {Object[]} cryptoSymbols
 * @param {Date} start
 * @param {Date} end
 * @param {number} limit
 *
 * @returns {Object[]} cryptoBars
 */
const getCryptoData = async (cryptoSymbols, start, end, limit = 10000) => {
  let cryptoBars = null;

  await fetch(
    "https://data.alpaca.markets/v1beta1/crypto/bars?symbols=" +
      cryptoSymbols.toString() +
      "&start=" +
      start +
      "&end=" +
      end +
      "&limit=" +
      limit +
      "&timeframe=1Min",
    {
      method: "GET",
      headers: {
        "Apca-Api-Key-Id": process.env.API_KEY,
        "Apca-Api-Secret-Key": process.env.SECRET_API_KEY,
      },
    }
  )
    .then((response) => {
      if (response.status >= 400) {
        console.log("ERROR: AlpacaCryptoBars", response);
      }
      return response.json();
    })
    .then(async (response) => {
      if (response.bars) {
        cryptoBars = response.bars;
      }
    })
    .catch((err) => {
      console.log("ERROR: AlpacaCryptoBars");
      console.error(err);
    });

  return cryptoBars;
};

/**
 * Gets stock data and initialize array of stock objects
 *
 * @param {(Alpaca|TradingProvider)} tradingProvider
 * @param {Object[]} stocks
 * @param {Object} settings
 * @param {Object[]} positions
 * @param {Object[]} orders
 * @param {(Object|null)} session
 * @param {(Object|null)} io
 * @param {number} limit
 * @param {Date} until
 * @param {string} lastOrder
 *
 * @returns {Object} stockData
 */
const initializeStockData = async (
  tradingProvider,
  stocks,
  settings,
  positions = [],
  orders = [],
  session = null,
  io = null,
  limit = 150,
  until = moment
    .tz(moment(), "America/New_York")
    .subtract(16, "minutes")
    .format(), // 16 minutes time delay for Alpaca market data (East coast timezone)
  lastOrder = "SELL"
) => {
  let stockData = {
    session: session,
    settings: settings,
    algos: [],
    io: io,
    haltTrading: false,
    marketClosing: false,
    lastRoi: 0,
    portfolio: {
      startingCapital: settings.startingCapital,
      cash: settings.startingCapital,
      positions: [], // list of current portfolio positions
      tmp: [],
    },
    orders: orders, // list of orders (buy/sell) based on signals
    stocks: [], // list of subscribed stocks
  };

  if (!settings.isBacktest) {
    // add current positions to stocks to be subscribed to
    if (positions.length > 0) {
      stocks = _.union(stocks, _.map(positions, "symbol"));
    }

    // retrieve historical market data for specified stocks
    const start = moment().format("YYYY-MM-DD") + "T00:00:00.000Z";
    try {
      let bars = null;

      if (!settings.enableCrypto) {
        bars = await getMarketData(tradingProvider, stocks, start, until);
      } else {
        bars = await getCryptoData(stocks, start, until);
      }

      if (bars) {
        console.log("Data: ", bars);
        // create stockData for new stocks
        stockData.stocks = createStockData(
          bars,
          stocks,
          settings.isBacktest,
          lastOrder,
          settings.enableCrypto ? true : false
        );

        // sync portfolio positions
        stockData = await tradingPortfolio.syncPortfolioPostions(
          tradingProvider,
          stockData,
          positions
        );
      } else {
        stockData.stocks = createStockData(
          [],
          stocks,
          settings.isBacktest,
          lastOrder
        );
      }
    } catch (e) {
      console.log("ERROR: AlpacaMarketDataV2", e.message);
      stockData.stocks = createStockData(
        [],
        stocks,
        settings.isBacktest,
        lastOrder
      );
    }
  } else {
    stockData.stocks = createStockData(
      [],
      stocks,
      settings.isBacktest,
      lastOrder
    );

    return stockData;
  }

  return stockData;
};

/**
 * Updates stock data and initialize any new stock objects
 *
 * @param {(Alpaca|TradingProvider)} tradingProvider
 * @param {Object[]} stocks
 * @param {Object} stockData
 * @param {number} limit
 * @param {Date} until
 * @param {string} lastOrder
 *
 * @returns {Object} stockData
 */
const updateStockData = async (
  tradingProvider,
  stocks,
  stockData,
  limit = 150,
  until = moment
    .tz(moment(), "America/New_York")
    .subtract(16, "minutes")
    .format(), // 16 minutes time delay for Alpaca market data (East coast timezone)
  lastOrder = "SELL"
) => {
  if (!stockData.settings.isBacktest) {
    // sync stocks for market data
    const start = moment().format("YYYY-MM-DD") + "T00:00:00.000Z";

    try {
      let bars = null;

      if (!stockData.settings.enableCrypto) {
        bars = await getMarketData(tradingProvider, stocks, start, until);
      } else {
        bars = await getCryptoData(stocks, start, until);
      }

      if (bars) {
        // save old stockData
        let oldStockData = stockData.stocks;

        // create stockData for new stocks
        stockData.stocks = createStockData(
          response.bars,
          stocks,
          stockData.settings.isBacktest,
          lastOrder,
          stockData.settings.enableCrypto ? true : false
        );

        // loop through algos to create initial setup for each stock
        stockData = tradingAlgos.initializeAlgos(stockData);

        // merge new and old stockData together
        stockData.stocks = _.union(stockData.stocks, oldStockData);
      } else {
        stockData.stocks = createStockData(
          [],
          stocks,
          stockData.settings.isBacktest,
          lastOrder
        );
      }
    } catch (e) {
      console.log("ERROR: Update StockData AlpacaMarketDataV2", e.message);
      stockData.stocks = createStockData(
        [],
        stocks,
        stockData.settings.isBacktest,
        lastOrder
      );
    }
  }

  return stockData;
};

/**
 * Creates initial stock data from retrieved bar data
 *
 * @param {Object} data
 * @param {Object[]} stocks
 * @param {boolean} isBacktest
 * @param {string} lastOrder
 * @param {boolean} restApiDataBars
 *
 * @returns {Object} stockData
 */
const createStockData = (
  data,
  stocks,
  isBacktest,
  lastOrder,
  restApiDataBars = false
) => {
  let stockData = [];
  let openValues = [];
  let closeValues = [];
  let highValues = [];
  let lowValues = [];
  let volumeValues = [];

  _.forOwn(stocks, (stock) => {
    if (!isBacktest && data) {
      if (restApiDataBars) {
        openValues = _.map(data[stock], (bar) => bar.o);
        closeValues = _.map(data[stock], (bar) => bar.c);
        highValues = _.map(data[stock], (bar) => bar.h);
        lowValues = _.map(data[stock], (bar) => bar.l);
        volumeValues = _.map(data[stock], (bar) => bar.v);
      } else {
        const stockMap = _.filter(data, (record) =>
          record.Symbol.includes(stock)
        );
        openValues = _.map(stockMap, (bar) => bar.OpenPrice);
        closeValues = _.map(stockMap, (bar) => bar.ClosePrice);
        highValues = _.map(stockMap, (bar) => bar.HighPrice);
        lowValues = _.map(stockMap, (bar) => bar.LowPrice);
        volumeValues = _.map(stockMap, (bar) => bar.Volume);
      }
    }

    stockData.push({
      symbol: stock,
      subject: stock,
      lastOrder: lastOrder,
      signals: [], // list of signals (buy/sell) based on algos
      closeValues: closeValues,
      openValues: openValues,
      highValues: highValues,
      lowValues: lowValues,
      volumeValues: volumeValues,
      price: 0,
    });
  });

  return stockData;
};

module.exports = {
  subscribeToStocks,
  getStocks,
  getStockQuote,
  initializeStockData,
  updateStockData,
  createStockData,
  getMarketData,
  getCryptoData,
};
