# RoboBull - Trading Bot

![robobull-trading-bot](https://repository-images.githubusercontent.com/379045296/1e44ca00-d457-11eb-894d-f7e017767b97)

### An open source, low-code way to test technical indicators with market trading data

## Disclaimer

_Please note:_ This repo and project is in no way affiliated with or endorsed by Alpaca. We also strongly advise that you thoroughly test this project, its settings and algorithms with a paper trading account. we accept no liability whatsoever in the usage of this project in accordance with the provided license.

### About this project

The **RoboBull Trading Bot** is a fully automated trading bot which analyses stock market data with a variety of technical indicators. Technical indicators are mapped to specified weightings which determine whether a signal (BUY/SELL) is generated. If an overall weightings threshold is met, based on generated signals, an order is created.

The bot currently supports both live trading (paper account recommended) and historical back testing via [Alpaca's API](https://github.com/alpacahq/alpaca-trade-api-js) as an integrated trading provider and plan to support others in the future.

### Stock Screener - Get up-to-date, ranked stocks every 15mins!

We've integrated our Stock Screener into this project which provides market analyses and top performing stocks. We aim to provide this data for FREE as long as we can. Donations welcome for upkeep!

_Tip:_ If you don't want to use our stock screener you can simply disabled it by setting **useStockScreener** to false.

### Installation

_Tip:_ If the US markets are closed then you can use back testing instead.

- Install using Docker Compose which requires you to install [Docker](https://docs.docker.com/get-docker/):

- Go to [Alpaca](https://alpaca.markets/) and sign up for a free account. We recommend paper trading only for using this project. You don't need to spend real dollars to test this project. Once you have a paper trading account you can create your API key and secret which will be needed in the next step.

- Copy .env-example and rename to .env and then add your Alpaca key (API_KEY) and secret (SECRET_API_KEY).
  **Important:** keep your key/secret locally, don't commit it or share with anyone.

- Ensure you have edited your settings.json for live/paper trading or back testing

- Run `docker-compose up`

- Create a new user by going here: (http://localhost:3001/create-user). You'll then be redirected to the trading terminal. You only need to create a new user once.

- Once you've created a new user, you can re-run the trading bot in the future by visiting (http://localhost:3001/run).

- You can also visit (http://localhost:8081) to view and manage MongoDb data

### Basic Settings

It's worth familiarizing yourself with the basic settings before you run `docker-compose up` during the installation. You can find all settings and their explanations later in this readme.

_Tip:_ You need to restart your Docker container each time you make a change to your settings or code. Just Control-C out of the current process and then `docker-compose up` again.

#### settings.json

- **provider** alpaca - trading provider to use (currently only Alpaca is available)
- **isPaper** true/false - to use paper trading account (default: true)
- **isBacktest** true/false - to use back testing functionality (default: false)

_Tip:_ All positions will automatically close (sell) 15mins before end of the market closing. It may be beneficial to keep your positions, especially if you're at a loss, but its completely up to you. If you wish to do so, set **useClosePositionsBeforeMarketClose** to false (then restart the docker process).

#### stocks.json

Edit your stock symbols/tickers in this file. The stocks will be used as your default stocks for live trading as well as the stocks used for back testing (if enabled).

#### algos.json

The algorithms / technical indicators are massively customizable and have been tested for optimal performance. It may be better to retain the current setup and use the basic properties below until you have spent time analysing your trading ROI (both live/paper and back testing).

- **thresholdToBuy** 35 - overall weightings threshold from signals to trigger a BUY order
- **thresholdToSell** 25 - overall weightings threshold from signals to trigger a SELL order
- **useStandardAlgos** true/false - to use standard technical indicators like bullish/bearish patterns (default: false)

Feel free to tweak the settings in algo.json file as much as you like. A more detailed explanation of algo settings is coming soon. _Tip:_ You may want to increase the thresholdToBuy setting to 40 which will tell the bot to be stricter when buying stocks.

### Run in "Console Only" mode

This feature allows you to run both live/paper trading and back testing without the need of a web browser. In order to do this open a terminal tab:

- Run `docker-compose up`

Then open another terminal tab:

- Run `docker exec -it $(docker ps -aqf "ancestor=trading-bot_app") npm run console`

### Back Testing

Change the following in settings.json, then re-run `docker-compose up` and go to http://localhost:3001/run

- **provider** make sure this is set to `alpaca`
- **isPaper** make sure this is set to `true`
- **isBacktest** make sure this is set to `true`
- **startingCapital** set this to the amount you wish to start back testing with (currency is always set to USD)
- **startDate** set your start date for back testing
- **endDate** set your end date for back testing

### Settings / Configuration

- **provider** alpaca - trading provider to use (currently only Alpaca is available)
- **isPaper** true/false - to use paper trading account (default: true)
- **isBacktest** true/false - to use back testing functionality (default: false)
- **resetSignals** true/false - to reset signals after calculating signals (default: true)
- **startingCapital** 100000 - starting capital (used during back testing)
- **thresholdCapitalAllowance** 10 - how much capital allowance usage to calculate portfolio percentage (reduces percentage)
- **thresholdRiskAllocation** 2 - how much risk allocation to apply to portfolio percentage (multiplies percentage)
- **thresholdCapitalRetention** 10000 - how much capital to retain during trading
- **thresholdBuyCap** 0.12 - how much capital any given trade can amount to
- **thresholdBuyTimeRestriction** -60 - how long in minutes a position must be held before being sold
- **thresholdStockCap** 15 - how many positions can be held at once
- **orderStopLoss** -0.006 - how much a position can lose in return on investment before selling
- **orderTakeProfit** 0.008 - how much a positions can gain in return on investment before selling
- **orderHoldUntilProfit** false - whether to stop selling a position at a loss (holding until profit)
- **roiToClosePositions** 0.3 - how much the overall ROI must be over to close all current positions and end trading
- **roiToResetPositions** -0.5 - how much the overall ROI must be below to gradually close poor performing positions (currently disabled / needs refactoring)
- **startDate** "2021-02-01 00:00:00" - start date used for back testing
- **endDate** "2021-02-01 00:00:00" - end date used for back testing
- **useClosePositionsBeforeMarketClose** true/false - closes/sells all open positions before market is closed (default: true)
- **usePreviousUserSession** true/false - to use previous user's session (no longer exists, default: false)
- **useDefaultStocks** true/false - to use a list of stocks by default and also required for back testing (default: true)
- **useStockScreener** true/false - to use a list of high performing stocks from RoboBull Stock Screener every 15mins to ensure that best stocks are used during live/paper trading (default: true, fallback if empty is to use default stocks)
- **useStockQuotePercentage** true/false - to use Financial Modeling Prep API for latest stock percentage change before ordering. Requires third-party API key. (default: false)
- **stockQuotePercentageChangeRangeTo** 15 - how much of a percentage that a stock's change can be increased up to when processing order. This is to help against volatile stocks along with pump and dumps (only used during live/paper trading)
- **stockQuotePercentageChangeRangeFrom** 1 - currently not used

### Code Structure

The code follows mostly the standard structure used within [Express Framework](https://expressjs.com/) related projects.

#### Dependencies

We love these dependencies to speed up development!

- Big shout out to Kendel Chopp for [Alpaca JS Backtesting](https://github.com/KendelChopp/alpaca-js-backtesting) and Anand Aravindan for [Technical Indicators](https://www.npmjs.com/package/technicalindicators).

- [Lodash](https://lodash.com/)
- [Moment](https://momentjs.com/) (worth replacing with DayJs)
- [Mongoose](https://mongoosejs.com/)
- [Socket.io](https://socket.io/)
- [EJS](https://ejs.co/)
- [Dirty JSON](https://www.npmjs.com/package/dirty-json)
- [extract-numbers](https://www.npmjs.com/package/extract-numbers)
- [Axios](https://www.npmjs.com/package/axios)
- [Winston](https://www.npmjs.com/package/winston)

#### Files

```
├── config
│ ├── algos.json # structured data for your algorithms / technical indicators along with weighting thresholds
│ ├── settings.json #
│ └── stocks.json #
├── data # files used for persistent mongo data storage (git ignored)
├── docker # files required to run project in self contained docker environment
├── public # files required for frontend views such as css styling and javascript
├── src
│ ├── controllers # controller files which are called via routes / endpoints
│ ├── models # mongoose database schema models for reading / writing data to MongoDb
│ ├── providers # files / methods related to specific trading providers (currently only Alpaca)
│ ├── routes # contains the routes e.g. url structure
│ ├── services # contains services such as stocks, orders, portfolio
│ └── views # templates for frontend views such as HTML structure etc
├── .env # you'll need to create/edit this file copied from .env-example
├── .env-example # example for your .env variables
├── index.js # entry point to run trading via Express framework (via web browser)
├── console-only.js # entry point to run trading via console only
├── docker-compose.yml # settings file for running docker containers
├── package.json # dependencies used within this project
├── LICENSE # license for usage of this project
└── README.md # this file
```

### Unit Tests

We are currently working on more Unit tests but the setup for robust tests are in place.

- First you'll need to install Node v12. We recommend using Brew to install NVM which will allow you to switch between different Node versions locally. Go to your console / terminal: `brew install nvm`
- Make sure you're currently running Node v12 using `node --version`
- Install dependencies using this command: `npm install`
- To run unit tests (with code coverage), use this command: `npm test`

### To Do / Coming soon

- Progressive Stop Losses.
- Make all methods asynchronous with Try/Catch.
- Tidy views inc. frontend Javascript (potentially split out frontend as a separate service)
- Add more algos / technical indicators (Extrema would be great!).
- Optimized Mongodb methods.
- Unit tests
