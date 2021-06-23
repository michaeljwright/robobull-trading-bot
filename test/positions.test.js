const assert = require("chai").assert;

const tradingPositions = require("../src/services/positions");

// need to implement Factories / Faker for mocking data dynamically etc

let stockSymbol = "AAPL";

let stockData = {
  portfolio: {
    positions: [
      {
        symbol: stockSymbol,
        side: "buy",
        qty: 100,
        price: 126.2,
        amount: 100 * 126.2,
        balanceBefore: 100000,
        balanceAfter: 87380,
        profit: 0
      }
    ]
  }
};

describe("-- testing of Positions --", () => {
  describe("getPositions funtion", () => {
    it("data should be returned as an object with specific nested properties", () => {
      let result = tradingPositions.getPositions(stockData, stockSymbol);
      assert.typeOf(result, "object");
      assert.typeOf(result.name, "string");
      assert.typeOf(result.current, "number");
      assert.typeOf(result.total, "number");
    });
  });
});
