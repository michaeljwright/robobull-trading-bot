const _ = require("lodash");
const moment = require("moment-timezone");
const mongoose = require("mongoose");

const { Order } = require("../models/order");
const { Position } = require("../models/position");
const { Result } = require("../models/result");
const { Session } = require("../models/session");
const { Setting } = require("../models/Setting");
const { Stock } = require("../models/stock");
const { User } = require("../models/user");

const errors = require("./errors");

/**
 * Opens mongoose connection
 */
const mongodbOpen = () => {
  if (mongoose.connection.readyState == 0) {
    mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      useCreateIndex: true,
      useFindAndModify: false
    });
  }
};

/**
 * Closes mongoose connection
 */
const mongodbClose = async () => {
  await mongoose.connection.close();
};

/**
 * Finds one user based on query / filter
 *
 * @param {Object} data
 *
 * @returns {Object} User
 */
const mongodbQueryUser = async data => {
  let user = await User.findOne(data);

  return user;
};

/**
 * Finds user based on userId
 *
 * @param {number} userId
 *
 * @returns {Object} User
 */
const mongodbFindUserById = async userId => {
  let user = null;

  if (userId.length == 12 || userId.length == 24) {
    try {
      user = await User.findById(userId);
    } catch (err) {
      errors.log(err, "error");
    }
  }

  return user ? user : null;
};

/**
 * Creates a user
 *
 * @param {Object} user
 */
const mongodbCreateUser = async data => {
  mongodbOpen();

  let user = new User(data);

  await user.save((err, result) => {
    if (err) {
      errors.log(err, "error");
    }
  });

  return user;
};

/**
 * Creates a session
 *
 * @param {Object} data
 *
 * @returns {Object} Session
 */
const mongodbCreateSession = async data => {
  let session = new Session(data);

  await session.save((err, result) => {
    if (err) {
      errors.log(err, "error");
    }
  });

  return session;
};

/**
 * Upserts (updates or creates) stocks based on array of stock objects
 *
 * @param {Object} stocks
 *
 * @returns {Object} success
 */
const mongodbUpdateStocks = async stocks => {
  let bulkUpdate = Stock.collection.initializeUnorderedBulkOp();

  _.forEach(stocks, stock => {
    if (stock !== null) {
      stock.symbol = stock.ticker;
      stock.subject = "AM." + stock.ticker;
      stock.updated = Date.now();
      let newStock = new Stock(stock);

      bulkUpdate
        .find({
          ticker: stock.ticker,
          updated: {
            $gte: moment().startOf("day"),
            $lt: moment().endOf("day")
          }
        })
        .upsert()
        .updateOne({ $setOnInsert: newStock });
    }
  });

  let success = await bulkUpdate.execute();

  return success;
};

/**
 * Gets stocks based on query / filter
 *
 * @param {Object} query
 *
 * @returns {Promise}
 */
const mongodbGetStocks = async (query = {}) => {
  return new Promise(async (resolve, reject) => {
    let stocks = {};

    try {
      stocks = await Stock.find(query);
    } catch (err) {
      errors.log(err, "error");
      resolve([]);
    }

    resolve(stocks);
  });
};

/**
 * Gets orders based on query / filter
 *
 * @param {Object} query
 *
 * @returns {Promise}
 */
const mongodbGetOrders = async (query = {}) => {
  return new Promise(async (resolve, reject) => {
    let orders = {};

    try {
      orders = await Order.find(query);
    } catch (err) {
      errors.log(err, "error");
      resolve([]);
    }

    resolve(orders);
  });
};

/**
 * Gets sessions based on query / filter
 *
 * @param {Object} query
 *
 * @returns {Promise}
 */
const mongodbGetSessions = async (query = {}, order = {}) => {
  return new Promise(async (resolve, reject) => {
    let sessions = {};

    try {
      sessions = await Session.find(query, {}, order);
    } catch (err) {
      errors.log(err, "error");
      resolve([]);
    }

    resolve(sessions);
  });
};

/**
 * Creates user session (finds user data first)
 *
 * @param {number} userId
 * @param {boolean} isBacktest
 *
 * @returns {Object} session
 */
const mongodbCreateUserSession = async (userId, isBacktest) => {
  let session = null;

  // get user based on environment userId
  let user = await mongodbFindUserById(userId);

  // find last session and kill it (either live or back test) only if user found
  if (user) {
    try {
      await mongodbKillLastSession(user._id, isBacktest);
    } catch (err) {
      errors.log(err, "error");
    }

    // Always create new session for each user
    session = await mongodbCreateSession({
      userId: user._id,
      isBacktest: isBacktest
    });
  }

  return session;
};

/**
 * Kills last user session but only for today
 *
 * @param {number} userId
 * @param {boolean} isBacktest
 *
 * @returns {Object} session
 */
const mongodbKillLastSession = async (userId, isBacktest) => {
  let updated = null;
  let filter = {
    userId: userId,
    isBacktest: isBacktest,
    created: { $gte: moment().startOf("day"), $lt: moment().endOf("day") }
  };

  updated = Session.findOneAndUpdate(filter, { haltTrading: true }, err => {
    if (err) {
      errors.log(err, "error");
    }
  });

  return updated;
};

/**
 * Finds last user session but only for today
 *
 * @param {number} userId
 * @param {boolean} isBacktest
 *
 * @returns {Object} session
 */
const mongodbFindLastSession = async (userId, isBacktest) => {
  let session = null;

  try {
    session = await Session.findOne(
      {
        userId: userId,
        isBacktest: isBacktest,
        created: { $gte: moment().startOf("day"), $lt: moment().endOf("day") }
      },
      {},
      { sort: { created: -1 } }
    );

    // update timestamp (and potentially settings) if reusing session
  } catch (err) {
    console.log("ERROR: Usually an issue with Mongodb Network IP range.");
    errors.log(err, "error");
  }

  return session;
};

/**
 * Finds the last user that was created
 *
 * @returns {Object} session
 */
const mongodbFindLastUser = async () => {
  let user = null;

  mongodbOpen();

  try {
    user = await User.findOne({}, {}, { sort: { created: -1 } });
  } catch (err) {
    errors.log(err, "error");
  }

  return user;
};

/**
 * Kills a specific session
 *
 * @param {Object} query
 *
 * @returns {Object} killed
 */
const mongodbKillSession = async query => {
  let killed = null;

  killed = Session.findOneAndUpdate(query, { haltTrading: true }, err => {
    if (err) {
      console.log(err);
      // errors.log(err, "error");
    }
  });

  return killed;
};

/**
 * Creates new setting
 *
 * @param {Object} setting
 *
 * @returns {Object} setting
 */
const mongodbCreateSetting = setting => {
  let created = Setting.create(setting, err => {
    if (err) {
      errors.log(err, "error");
    }
  });

  return created;
};

/**
 * Creates new order
 *
 * @param {Object} order
 *
 * @returns {Object} Order
 */
const mongodbCreateOrder = order => {
  let created = Order.create(order, err => {
    if (err) {
      errors.log(err, "error");
    }
  });

  return created;
};

/**
 * Updates order based on query / filter
 *
 * @param {Object} filter
 * @param {Object} order
 *
 * @returns {Object} Order
 */
const mongodbUpdateOrder = (filter, order) => {
  let updated = Order.findOneAndUpdate(filter, order, err => {
    if (err) {
      errors.log(err, "error");
    }
  });

  return updated;
};

/**
 * Creates new orders in bulk
 *
 * @param {Object[]} orders
 *
 * @returns {Promise}
 */
const mongodbCreateOrders = async orders => {
  return new Promise(async (resolve, reject) => {
    Order.insertMany(orders)
      .then(res => {
        resolve(res);
      })
      .catch(function(err) {
        errors.log(err, "error");
        reject(err);
      });
  });
};

/**
 * Creates new position
 *
 * @param {Object} data
 *
 * @returns {Promise}
 */
const mongodbCreatePosition = async data => {
  return new Promise(async (resolve, reject) => {
    let position = new Position(data);

    await position.save((err, result) => {
      if (err) {
        errors.log(err, "error");
      }
    });

    resolve(position);
  });
};

/**
 * Creates new result
 *
 * @param {Object} result
 *
 * @returns {Promise}
 */
const mongodbCreateResult = async result => {
  return new Promise(async (resolve, reject) => {
    await Result.create(result, err => {
      if (err) {
        errors.log(err, "error");
      } else {
        mongodbClose();
      }
    });
    resolve(true);
  });
};

mongodbOpen();

module.exports = {
  mongodbOpen,
  mongodbClose,
  mongodbQueryUser,
  mongodbFindUserById,
  mongodbCreateUser,
  mongodbCreateSession,
  mongodbUpdateStocks,
  mongodbGetStocks,
  mongodbGetOrders,
  mongodbGetSessions,
  mongodbCreateUserSession,
  mongodbKillLastSession,
  mongodbFindLastSession,
  mongodbFindLastUser,
  mongodbKillSession,
  mongodbCreateSetting,
  mongodbCreateOrder,
  mongodbUpdateOrder,
  mongodbCreateOrders,
  mongodbCreatePosition,
  mongodbCreateResult
};
