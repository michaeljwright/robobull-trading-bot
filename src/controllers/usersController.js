const _ = require("lodash");

const {
  mongodbCreateUser,
  mongodbFindLastUser
} = require("../services/database");

const createUser = async (req, res) => {
  let { name = "Demo", email = "demo@example.com" } = req.query;
  let user = {};

  try {
    user = await mongodbCreateUser({
      name: name,
      email: email
    });

    if (!_.isEmpty(user)) {
      res.redirect("/session/" + user._id);
    } else {
      res.send("An error occurred.");
    }
  } catch (err) {
    console.log(err);
    res.send("An error occurred.");
  }
};

const runByUser = async (req, res) => {
  let user = {};

  try {
    user = await mongodbFindLastUser();

    if (!_.isEmpty(user)) {
      res.redirect("/session/" + user._id);
      // res.json(user);
    } else {
      res.redirect("/create-user/");
    }
  } catch (err) {
    console.log(err);
    res.send("An error occurred.");
  }
};

module.exports = {
  createUser,
  runByUser
};
