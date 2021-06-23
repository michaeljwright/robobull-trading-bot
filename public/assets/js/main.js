let host = location.origin;

// let port = "<%= port %>";
// let socket = io(host,
//   {
//     withCredentials: true
//   }
// );

let socket = io(host);

// autoConnect: 10000
// transports: ["websocket"],

function stockSignalWeighting(signals) {
  let weightingsBuy = 0;
  let weightingsSell = 0;
  signals.forEach((signal, index) => {
    if (signal.side == "buy") {
      weightingsBuy = weightingsBuy + signal.weighting;
    } else {
      weightingsSell = weightingsSell + signal.weighting;
    }
  });

  return { buy: weightingsBuy, sell: weightingsSell };
}

document.getElementById("clock").innerHTML = moment().format(
  "DD/MM/YYYY h:mm:ss a"
);

document.getElementById("halt-trading").onclick = function() {
  let url = location.protocol + "//" + location.host + "/session-kill/";
  let sessionId = this.getAttribute("data-id");
  if (sessionId) {
    console.log("Halt trading executed.");
    let request = new XMLHttpRequest();
    request.open("GET", url + sessionId);
    request.send();
  }
};

let stocksList = document.querySelector("#stocks-list");
let positionsList = document.querySelector("#positions-list");
let ordersList = document.querySelector("#orders-list");

socket.on("receive_positions", data => {
  if (data instanceof Array) {
    while (positionsList.lastElementChild) {
      positionsList.removeChild(positionsList.lastElementChild);
    }

    data.forEach((position, index) => {
      let row = document.createElement("tr");
      row.setAttribute("id", "position-" + position.symbol);

      let symbol = document.createElement("td");
      symbol.textContent = position.symbol;
      row.appendChild(symbol);

      let qty = document.createElement("td");
      qty.textContent = position.qty;
      row.appendChild(qty);

      let price = document.createElement("td");
      price.textContent = parseFloat(position.price).toFixed(2);
      row.appendChild(price);

      let amount = document.createElement("td");
      amount.textContent = parseFloat(position.amount).toFixed(2);
      row.appendChild(amount);

      let profit = document.createElement("td");
      let profitValue = parseFloat(position.profit).toFixed(2);

      if (profitValue > 0) {
        profit.classList.remove("loss-bg");
        profit.classList.add("profit-bg");
        profit.innerHTML = " &#9650; " + profitValue;
      } else if (profitValue < 0) {
        profit.classList.remove("profit-bg");
        profit.classList.add("loss-bg");
        profit.innerHTML = " &#9660; " + profitValue;
      } else {
        profit.innerHTML = profitValue;
      }

      row.appendChild(profit);

      positionsList.prepend(row);
    });
  } else {
    if (data.side == "sell") {
      document.getElementById("position-" + data.symbol).remove();
    } else {
      let row = document.createElement("tr");
      row.setAttribute("id", "position-" + data.symbol);

      let symbol = document.createElement("td");
      symbol.textContent = data.symbol;
      row.appendChild(symbol);

      let qty = document.createElement("td");
      qty.textContent = data.qty;
      row.appendChild(qty);

      let price = document.createElement("td");
      price.textContent = parseFloat(data.price).toFixed(2);
      row.appendChild(price);

      let amount = document.createElement("td");
      amount.textContent = parseFloat(data.amount).toFixed(2);
      row.appendChild(amount);

      let profit = document.createElement("td");
      let profitValue = parseFloat(data.profit).toFixed(2);

      if (profitValue > 0) {
        profit.classList.remove("loss-bg");
        profit.classList.add("profit-bg");
        profit.innerHTML = " &#9650; " + profitValue;
      } else if (profitValue < 0) {
        profit.classList.remove("profit-bg");
        profit.classList.add("loss-bg");
        profit.innerHTML = " &#9660; " + profitValue;
      } else {
        profit.innerHTML = profitValue;
      }

      row.appendChild(profit);

      positionsList.prepend(row);
    }
  }

  document.getElementById(
    "positions-current"
  ).innerHTML = document.querySelectorAll("#positions-list > tr").length;
});

socket.on("receive_orders", data => {
  if (data instanceof Array) {
    data.forEach((order, index) => {
      let row = document.createElement("tr");
      row.setAttribute("id", "order-" + order.symbol);

      let dateTime = document.createElement("td");
      dateTime.textContent = "-";
      row.appendChild(dateTime);

      let symbol = document.createElement("td");
      symbol.textContent = order.symbol;
      row.appendChild(symbol);

      let side = document.createElement("td");
      side.textContent = order.side;
      row.appendChild(side);

      let qty = document.createElement("td");
      qty.textContent = order.qty;
      row.appendChild(qty);

      let price = document.createElement("td");
      price.textContent = parseFloat(order.price).toFixed(2);
      row.appendChild(price);

      let roiData = parseFloat(order.roi).toFixed(6);

      let amount = document.createElement("td");
      amount.textContent = parseFloat(order.amount).toFixed(2);
      row.appendChild(amount);

      let roi = document.createElement("td");
      roi.textContent = roiData + "%";
      if (order.side == "sell") {
        if (Math.sign(roiData) > 0) {
          roi.classList.add("profit-bg");
        } else if (roiData < 0) {
          roi.classList.add("loss-bg");
        }
      }
      row.appendChild(roi);

      ordersList.prepend(row);
    });
  } else {
    console.log(data.roi);

    let row = document.createElement("tr");
    row.setAttribute("id", "order-" + data.symbol);

    let dateTime = document.createElement("td");
    dateTime.textContent = moment(data.dateTime).format("DD/MM/YYYY h:mm:ss a");
    row.appendChild(dateTime);

    let symbol = document.createElement("td");
    symbol.textContent = data.symbol;
    row.appendChild(symbol);

    let side = document.createElement("td");
    side.textContent = data.side;
    row.appendChild(side);

    let qty = document.createElement("td");
    qty.textContent = data.qty;
    row.appendChild(qty);

    let price = document.createElement("td");
    price.textContent = parseFloat(data.price).toFixed(2);
    row.appendChild(price);

    let roiData = parseFloat(data.roi).toFixed(6);

    let amount = document.createElement("td");
    amount.textContent = parseFloat(data.amount).toFixed(2);
    row.appendChild(amount);

    let roi = document.createElement("td");
    roi.textContent = roiData + "%";
    if (data.side == "sell") {
      if (Math.sign(roiData) > 0) {
        roi.classList.add("profit-bg");
      } else if (roiData < 0) {
        roi.classList.add("loss-bg");
      }
    }
    row.appendChild(roi);

    ordersList.prepend(row);
  }

  document.getElementById(
    "orders-current"
  ).innerHTML = document.querySelectorAll("#orders-list > tr").length;
});

socket.on("receive_stocks", data => {
  if (data instanceof Array) {
    data.forEach((stock, index) => {
      if (document.getElementById("stock-" + stock.symbol)) {
        document.getElementById("stock-" + stock.symbol).remove();
      }

      let button = document.createElement("button");

      button.setAttribute("id", "stock-" + stock.symbol);
      button.classList.add("btn");
      button.classList.add("btn-primary");
      button.classList.add("btn-ghost");
      button.classList.add("border-grey");

      let signalWeightings = stockSignalWeighting(stock.signals);

      if (signalWeightings.buy > signalWeightings.sell) {
        button.classList.remove("border-grey");
        button.classList.add("profit-bg");
        button.innerHTML = stock.symbol + " &#9650; " + signalWeightings.buy;
      } else if (signalWeightings.sell > signalWeightings.buy) {
        button.classList.remove("border-grey");
        button.classList.add("loss-bg");
        button.innerHTML = stock.symbol + " &#9660; " + signalWeightings.sell;
      } else {
        button.innerHTML = stock.symbol + " - 0";
      }

      stocksList.prepend(button);
    });
  } else {
    if (document.getElementById("stock-" + data.symbol)) {
      document.getElementById("stock-" + data.symbol).remove();
    }

    let button = document.createElement("button");

    button.setAttribute("id", "stock-" + data.symbol);
    button.classList.add("btn");
    button.classList.add("btn-primary");
    button.classList.add("btn-ghost");
    button.classList.add("border-grey");

    if (data.side == "buy") {
      button.classList.remove("border-grey");
      button.classList.add("profit-bg");
      button.innerHTML = data.symbol + " &#9650; " + data.weighting;
    } else if (data.side == "sell") {
      button.classList.remove("border-grey");
      button.classList.add("loss-bg");
      button.innerHTML = data.symbol + " &#9660; " + data.weighting;
    } else {
      button.innerHTML = data.symbol + " - 0";
    }

    stocksList.prepend(button);
  }

  document.getElementById(
    "stocks-current"
  ).innerHTML = document.querySelectorAll("#stocks-list > button").length;
});

socket.on("receive_clock", data => {
  document.getElementById("clock").innerHTML = moment().format(
    "DD/MM/YYYY h:mm:ss a"
  );
});

socket.on("receive_result", data => {
  document.getElementById("startingCapital").innerHTML = parseFloat(
    data.startValue
  ).toFixed(2);
  document.getElementById("balance").innerHTML = parseFloat(
    data.endValue
  ).toFixed(2);
  document.getElementById("roi").innerHTML =
    parseFloat(data.roi).toFixed(4) + "%";
});

socket.on("receive_halt_trading", data => {
  if (data) {
    if (data.haltTrading) {
      document.getElementById("halt-trading-msg").innerHTML =
        "Trading has been successfully halted.";
      if (
        window.getComputedStyle(document.getElementById("modal-halt-trading"))
          .visibility !== "visibile"
      ) {
        document.getElementById("halt-trading").click();
      }
    }
  }
});

socket.on("receive_market_closed", data => {
  if (data) {
    document.getElementById("halt-trading").innerHTML = data;
  }
});
