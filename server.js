const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

app.use(express.static('public'));

function getInitialRoomConfig() {
  return {
    salary: 38000,
    leaderboardTitle: "🏆 學員資產排行榜",
    expenses: {
      rent: 9000,
      water: 250,
      electricity: 900,
      gas: 400,
      telecom: 699,
      supplies: 1500,
      food: 7500,
      transport: 1200,
      tuition: 3000
    },
    annualStocks: {
      "科技龍頭ETF": {
        desc: "追蹤前50大權值科技股，成長爆發力強，波動較劇烈",
        saleMonth: 1,
        dividendMonth8: 3.5,
        monthlyPrices: { 1: 50, 2: 52, 3: 55, 4: 51, 5: 58, 6: 62, 7: 65, 8: 60, 9: 68, 10: 72, 11: 70, 12: 75 }
      },
      "民生高股息": {
        desc: "電信、超商與民生必需品龍頭，抗跌穩定，配息大方",
        saleMonth: 3,
        dividendMonth8: 2.0,
        monthlyPrices: { 1: 30, 2: 30, 3: 30, 4: 31, 5: 31, 6: 32, 7: 32, 8: 31, 9: 33, 10: 33, 11: 34, 12: 35 }
      },
      "航運飆風股": {
        desc: "受國際航運運價影響極大，大起大落具投機投報性質",
        saleMonth: 5,
        dividendMonth8: 5.0,
        monthlyPrices: { 1: 40, 2: 40, 3: 40, 4: 45, 5: 60, 6: 80, 7: 55, 8: 40, 9: 35, 10: 30, 11: 28, 12: 32 }
      }
    },
    annualDeposits: [
      { name: "青年安心定存", saleMonth: 1, monthlyAmount: 5000, monthlyRate: 0.005 },
      { name: "半年衝刺高利定存", saleMonth: 6, monthlyAmount: 8000, monthlyRate: 0.008 }
    ],
    annualInsurances: [
      { name: "全方位安心醫療險", saleMonth: 1, monthlyFee: 1500, claimAmount: 15000 },
      { name: "重大傷病守護專案", saleMonth: 4, monthlyFee: 3000, claimAmount: 40000 }
    ],
    annualEvents: {
      1: { desc: "📱 手機電池膨脹故障，更換原廠電池", gain: 0, loss: 1800, claimInsuranceName: "" },
      2: { desc: "🧧 春節開工大吉，老闆發放開工紅包", gain: 2000, loss: 0, claimInsuranceName: "" },
      3: { desc: "🛵 機車煞車皮耗損，進廠大保養換胎", gain: 0, loss: 2500, claimInsuranceName: "" },
      4: { desc: "🦷 牙周突發急性發炎引流門診治療", gain: 0, loss: 3800, claimInsuranceName: "全方位安心醫療險" },
      5: { desc: "🎉 統一發票幸運中獎入帳", gain: 1000, loss: 0, claimInsuranceName: "" },
      6: { desc: "🤒 夏日突發嚴重熱衰竭急診就醫住院", gain: 0, loss: 5000, claimInsuranceName: "全方位安心醫療險" },
      7: { desc: "🎁 摯友步入禮堂，致贈結婚禮金祝賀", gain: 0, loss: 3600, claimInsuranceName: "" },
      8: { desc: "🌟 利用週末兼職外快教學津貼", gain: 4500, loss: 0, claimInsuranceName: "" },
      9: { desc: "💻 工作筆電電源變壓器燒壞更換", gain: 0, loss: 2200, claimInsuranceName: "" },
      10: { desc: "🏥 雨天意外摔傷韌帶斷裂手術治療", gain: 0, loss: 18000, claimInsuranceName: "重大傷病守護專案" },
      11: { desc: "☕ 冬季氣溫驟降添購防寒羽絨大衣", gain: 0, loss: 2800, claimInsuranceName: "" },
      12: { desc: "🏆 全年工作考核優等，發放年終獎金", gain: 15000, loss: 0, claimInsuranceName: "" }
    }
  };
}

function getInitialGameState() {
  return {
    month: 1,
    hasPaidSalaryThisMonth: false,
    hasDeductedExpensesThisMonth: false,
    hasPaidDepositInterestThisMonth: false,
    hasDeductedDepositThisMonth: false,
    hasDeductedInsuranceThisMonth: false,
    hasTriggeredEventThisMonth: false,
    hasClaimedInsuranceThisMonth: false,
    hasNotifiedStockThisMonth: false,
    hasNotifiedStockFluctuationThisMonth: false,
    hasNotifiedDepositThisMonth: false,
    hasNotifiedInsuranceThisMonth: false,
    hasPaidDividendMonth8: false
  };
}

const rooms = {};

function getOrCreateRoom(roomId) {
  const rid = (roomId || "ROOM-101").trim().toUpperCase();
  if (!rooms[rid]) {
    rooms[rid] = {
      id: rid,
      config: getInitialRoomConfig(),
      state: getInitialGameState(),
      marketStockPrices: {},
      listedStocks: [],
      players: {}
    };
  }
  return rooms[rid];
}

const EXPENSE_LABELS = {
  rent: "🏠 房租",
  water: "💧 水費",
  electricity: "⚡ 電費",
  gas: "🔥 瓦斯費",
  telecom: "📶 手機網路",
  supplies: "🧻 生活用品",
  food: "🍱 餐費伙食",
  transport: "🛵 交通油錢",
  tuition: "📚 進修學費"
};

function addPlayerLog(player, text) {
  const balanceText = `【結存：$${player.cash.toLocaleString()}】`;
  player.notifications.unshift(`${text} ${balanceText}`);
}

function getLeaderboardArray(room) {
  return Object.values(room.players).map(p => {
    let stockTotalVal = 0;
    let stockTotalCost = 0;
    let totalSharesCount = 0;

    if (p.stockOrders && p.stockOrders.length > 0) {
      p.stockOrders.forEach(o => {
        let currentPrice = room.marketStockPrices[o.name] !== undefined ? room.marketStockPrices[o.name] : o.buyPrice;
        stockTotalVal += (o.shares * currentPrice);
        stockTotalCost += (o.shares * o.buyPrice);
        totalSharesCount += o.shares;
      });
    }

    let stockProfitVal = stockTotalVal - stockTotalCost;
    let stockProfitRate = stockTotalCost > 0 ? ((stockProfitVal / stockTotalCost) * 100).toFixed(1) : 0;

    let depositTotalAmount = 0;
    for (let dName in p.deposits) {
      depositTotalAmount += (p.deposits[dName].accumulatedAmount || 0);
    }

    let totalAssets = p.cash + depositTotalAmount + stockTotalVal;

    return { 
      ...p, 
      stockTotalVal, 
      stockTotalCost, 
      stockProfitVal, 
      stockProfitRate, 
      depositTotalAmount,
      totalSharesCount, 
      totalAssets 
    };
  }).sort((a, b) => b.totalAssets - a.totalAssets);
}

function emitRoomSync(roomId) {
  const room = rooms[roomId];
  if (!room) return;
  const leaderboard = getLeaderboardArray(room);
  io.to(roomId).emit('state:sync', {
    roomId: roomId,
    gameState: room.state,
    gameConfig: room.config,
    marketStockPrices: room.marketStockPrices,
    listedStocks: room.listedStocks,
    leaderboard: leaderboard
  });
}

io.on('connection', (socket) => {
  let boundRoomId = null;

  socket.on('admin:join_room', (roomId) => {
    const rid = (roomId || "ROOM-101").trim().toUpperCase();
    if (boundRoomId) socket.leave(boundRoomId);
    boundRoomId = rid;
    socket.join(rid);
    getOrCreateRoom(rid);
    emitRoomSync(rid);
  });

  socket.on('player:join', ({ roomId, name }) => {
    const rid = (roomId || "ROOM-101").trim().toUpperCase();
    if (boundRoomId) socket.leave(boundRoomId);
    boundRoomId = rid;
    socket.join(rid);

    const room = getOrCreateRoom(rid);
    room.players[socket.id] = {
      id: socket.id,
      roomId: rid,
      name: name || `學員_${socket.id.substring(0,4)}`,
      cash: 0,
      stockOrders: [],
      deposits: {},
      insurances: {},
      notifications: ["👋 歡迎進入挑戰！目前帳戶現金為 $0 【結存：$0】，等待教師發放第一個月薪資。"]
    };
    emitRoomSync(rid);
  });

  socket.on('admin:update_config', ({ roomId, newCfg }) => {
    const rid = (roomId || boundRoomId || "ROOM-101").trim().toUpperCase();
    const room = getOrCreateRoom(rid);
    room.config.salary = newCfg.salary;
    room.config.expenses = newCfg.expenses;
    io.to(rid).emit('screen:alert', { title: "⚙️ 參數已更新", msg: "教師端已更新薪資與固定開銷設定！" });
    emitRoomSync(rid);
  });

  socket.on('admin:update_leaderboard_title', ({ roomId, title }) => {
    const rid = (roomId || boundRoomId || "ROOM-101").trim().toUpperCase();
    const room = getOrCreateRoom(rid);
    if (title && title.trim()) {
      room.config.leaderboardTitle = title.trim();
      io.to(rid).emit('screen:alert', { title: "🏆 排行榜名稱已更新", msg: `排行榜已同步更名為：${room.config.leaderboardTitle}` });
      emitRoomSync(rid);
    }
  });

  socket.on('admin:save_annual_stocks', ({ roomId, updatedStocks }) => {
    const rid = (roomId || boundRoomId || "ROOM-101").trim().toUpperCase();
    const room = getOrCreateRoom(rid);
    room.config.annualStocks = updatedStocks;
    io.to(rid).emit('screen:alert', { title: "📊 股票年度劇本已儲存", msg: "各月份股票排程與股價曲線已成功更新！" });
    emitRoomSync(rid);
  });

  socket.on('admin:save_annual_deposits', ({ roomId, updatedDeposits }) => {
    const rid = (roomId || boundRoomId || "ROOM-101").trim().toUpperCase();
    const room = getOrCreateRoom(rid);
    room.config.annualDeposits = updatedDeposits;
    io.to(rid).emit('screen:alert', { title: "🏦 定存年度劇本已儲存", msg: "定存方案排程與月利率已成功更新！" });
    emitRoomSync(rid);
  });

  socket.on('admin:save_annual_insurances', ({ roomId, updatedInsurances }) => {
    const rid = (roomId || boundRoomId || "ROOM-101").trim().toUpperCase();
    const room = getOrCreateRoom(rid);
    room.config.annualInsurances = updatedInsurances;
    io.to(rid).emit('screen:alert', { title: "🛡️ 保險年度劇本已儲存", msg: "保險專案排程與理賠額度已成功更新！" });
    emitRoomSync(rid);
  });

  socket.on('admin:save_annual_events', ({ roomId, updatedEvents }) => {
    const rid = (roomId || boundRoomId || "ROOM-101").trim().toUpperCase();
    const room = getOrCreateRoom(rid);
    room.config.annualEvents = updatedEvents;
    io.to(rid).emit('screen:alert', { title: "⚡ 突發事件年度劇本已儲存", msg: "1 ~ 12 月突發事件與理賠保單對應已成功更新！" });
    emitRoomSync(rid);
  });

  // 1. 發薪
  socket.on('admin:action_salary', (roomId) => {
    const rid = (roomId || boundRoomId || "ROOM-101").trim().toUpperCase();
    const room = getOrCreateRoom(rid);
    if (room.state.hasPaidSalaryThisMonth) {
      return socket.emit('admin:msg', { text: `⚠️ 房間 ${rid} 第 ${room.state.month} 個月的薪資已經發放過囉！` });
    }
    room.state.hasPaidSalaryThisMonth = true;
    const sal = Number(room.config.salary);
    for (let id in room.players) {
      let p = room.players[id];
      p.cash += sal;
      addPlayerLog(p, `💵 [第${room.state.month}月-固定薪資] 入帳 +$${sal.toLocaleString()}`);
    }
    io.to(rid).emit('screen:alert', { title: "💵 薪資入帳通知", msg: `第 ${room.state.month} 個月固定薪資 $${sal.toLocaleString()} 已全員發放入帳！` });
    emitRoomSync(rid);
  });

  // 2. 定存利息
  socket.on('admin:action_deposit_interest', (roomId) => {
    const rid = (roomId || boundRoomId || "ROOM-101").trim().toUpperCase();
    const room = getOrCreateRoom(rid);
    if (room.state.hasPaidDepositInterestThisMonth) {
      return socket.emit('admin:msg', { text: `⚠️ 房間 ${rid} 第 ${room.state.month} 個月的定存利息已經發放過囉！` });
    }

    room.state.hasPaidDepositInterestThisMonth = true;
    let count = 0;
    for (let id in room.players) {
      let p = room.players[id];
      let totalInterest = 0;
      for (let depName in p.deposits) {
        let dep = p.deposits[depName];
        if (room.state.month > dep.startMonth) {
          let interest = Math.round(dep.accumulatedAmount * dep.monthlyRate);
          totalInterest += interest;
          p.cash += interest;
          addPlayerLog(p, `🏦 [定存配息-${depName}] 依本金 $${dep.accumulatedAmount.toLocaleString()} 與月利率 ${(dep.monthlyRate * 100).toFixed(2)}%，獲得利息 +$${interest.toLocaleString()}`);
        }
      }
      if (totalInterest > 0) count++;
    }

    io.to(rid).emit('screen:alert', { 
      title: "🏦 定存月利息發放完成", 
      msg: `第 ${room.state.month} 個月定存利息已全額匯入！（共 ${count} 位學員符合次期配息資格）` 
    });
    emitRoomSync(rid);
  });

  // 3. 股票股利 (限8月)
  socket.on('admin:action_stock_dividend', (roomId) => {
    const rid = (roomId || boundRoomId || "ROOM-101").trim().toUpperCase();
    const room = getOrCreateRoom(rid);
    if (room.state.month !== 8) {
      return socket.emit('admin:msg', { text: `⚠️ 股票除息日設定在「第 8 個月」！目前是第 ${room.state.month} 個月。` });
    }
    if (room.state.hasPaidDividendMonth8) {
      return socket.emit('admin:msg', { text: "⚠️ 第 8 個月的股利已經發放過囉！" });
    }

    room.state.hasPaidDividendMonth8 = true;
    let count = 0;
    for (let id in room.players) {
      let p = room.players[id];
      if (!p.stockOrders || p.stockOrders.length === 0) continue;

      let studentTotalDiv = 0;
      p.stockOrders.forEach((order, idx) => {
        let div = Math.round(order.shares * order.dividendPerShare);
        studentTotalDiv += div;
        p.cash += div;
        addPlayerLog(p, `📈 [股利明細 #${idx + 1}] 第${order.month}月購入之 ${order.name}：${order.shares}股 × $${order.dividendPerShare} = +$${div.toLocaleString()}`);
      });

      if (studentTotalDiv > 0) {
        p.notifications.unshift(`════ 📈 第 8 個月股票除息總分紅 +$${studentTotalDiv.toLocaleString()} 【結存：$${p.cash.toLocaleString()}】 ════`);
        count++;
      }
    }

    io.to(rid).emit('screen:alert', { 
      title: "📈 8月除息日！現金股利已全體結算", 
      msg: `系統已依據每位學員各月份持股核算股利！（共 ${count} 位持股學員獲派股利）` 
    });
    emitRoomSync(rid);
  });

  // 4. 固定開銷扣款
  socket.on('admin:action_expenses', (roomId) => {
    const rid = (roomId || boundRoomId || "ROOM-101").trim().toUpperCase();
    const room = getOrCreateRoom(rid);
    if (room.state.hasDeductedExpensesThisMonth) {
      return socket.emit('admin:msg', { text: `⚠️ 房間 ${rid} 第 ${room.state.month} 個月的生活開銷已經扣繳過囉！` });
    }

    room.state.hasDeductedExpensesThisMonth = true;
    const totalExp = Object.values(room.config.expenses).reduce((a, b) => a + Number(b), 0);

    for (let id in room.players) {
      let p = room.players[id];
      for (let key in room.config.expenses) {
        let amount = Number(room.config.expenses[key]);
        let label = EXPENSE_LABELS[key] || key;
        p.cash -= amount;
        addPlayerLog(p, `  🔹 ${label}：扣繳 -$${amount.toLocaleString()}`);
      }
      p.notifications.unshift(`════ 🧾 第 ${room.state.month} 個月生活必要開銷（總計 -$${totalExp.toLocaleString()}） 【結存：$${p.cash.toLocaleString()}】 ════`);
    }

    io.to(rid).emit('screen:alert', { 
      title: "🧾 9大固定開銷扣款完成", 
      msg: `第 ${room.state.month} 個月生活必要開銷總計 $${totalExp.toLocaleString()} 扣除完畢！` 
    });
    emitRoomSync(rid);
  });

  // 5. 定存續期扣款
  socket.on('admin:action_deposit_deduct', (roomId) => {
    const rid = (roomId || boundRoomId || "ROOM-101").trim().toUpperCase();
    const room = getOrCreateRoom(rid);
    if (room.state.hasDeductedDepositThisMonth) {
      return socket.emit('admin:msg', { text: `⚠️ 房間 ${rid} 第 ${room.state.month} 個月的定存扣款已經執行過囉！` });
    }

    room.state.hasDeductedDepositThisMonth = true;
    let count = 0;
    for (let id in room.players) {
      let p = room.players[id];
      let deductTotal = 0;
      for (let depName in p.deposits) {
        let dep = p.deposits[depName];
        if (room.state.month > dep.startMonth) {
          deductTotal += dep.monthlyAmount;
          dep.accumulatedAmount += dep.monthlyAmount;
          p.cash -= dep.monthlyAmount;
          addPlayerLog(p, `🏦 [定存續期扣繳-${depName}] 第${room.state.month}期存入 -$${dep.monthlyAmount.toLocaleString()}（累計定存本金：$${dep.accumulatedAmount.toLocaleString()}）`);
        }
      }
      if (deductTotal > 0) count++;
    }

    io.to(rid).emit('screen:alert', { 
      title: "🏦 定存定期扣款完成", 
      msg: `第 ${room.state.month} 個月定存扣款完成！（共 ${count} 位學員執行續期儲蓄）` 
    });
    emitRoomSync(rid);
  });

  // 6. 保險續期扣款
  socket.on('admin:action_insurance_deduct', (roomId) => {
    const rid = (roomId || boundRoomId || "ROOM-101").trim().toUpperCase();
    const room = getOrCreateRoom(rid);
    if (room.state.hasDeductedInsuranceThisMonth) {
      return socket.emit('admin:msg', { text: `⚠️ 房間 ${rid} 第 ${room.state.month} 個月的保費扣款已經執行過囉！` });
    }

    room.state.hasDeductedInsuranceThisMonth = true;
    let count = 0;
    for (let id in room.players) {
      let p = room.players[id];
      let deductTotal = 0;
      for (let insName in p.insurances) {
        let ins = p.insurances[insName];
        if (room.state.month > (ins.startMonth || 1)) {
          deductTotal += ins.monthlyFee;
          ins.accumulatedFee = (ins.accumulatedFee || ins.monthlyFee) + ins.monthlyFee;
          p.cash -= ins.monthlyFee;
          addPlayerLog(p, `🛡️ [保費續期扣繳-${insName}] 第${room.state.month}期續保扣費 -$${ins.monthlyFee.toLocaleString()}（累計已繳保費：$${ins.accumulatedFee.toLocaleString()}）`);
        }
      }
      if (deductTotal > 0) count++;
    }

    io.to(rid).emit('screen:alert', { 
      title: "🛡️ 保費定期扣款完成", 
      msg: `第 ${room.state.month} 個月保險扣繳完成！（共 ${count} 位學員續保扣費）` 
    });
    emitRoomSync(rid);
  });

  // 7. 股票購買通知
  socket.on('admin:notify_stock', (roomId) => {
    const rid = (roomId || boundRoomId || "ROOM-101").trim().toUpperCase();
    const room = getOrCreateRoom(rid);
    let curMonth = room.state.month;
    let targetStockName = null;
    let targetStockData = null;

    for (let sName in room.config.annualStocks) {
      let s = room.config.annualStocks[sName];
      if (Number(s.saleMonth) === curMonth) {
        targetStockName = sName;
        targetStockData = s;
        break;
      }
    }

    if (!targetStockData) {
      return socket.emit('admin:msg', { text: `⚠️ 劇本中未設置「第 ${curMonth} 個月」要開賣的股票標的！` });
    }

    let currentPrice = (targetStockData.monthlyPrices && targetStockData.monthlyPrices[curMonth] !== undefined)
      ? targetStockData.monthlyPrices[curMonth]
      : 50;

    room.marketStockPrices[targetStockName] = currentPrice;
    if (!room.listedStocks.includes(targetStockName)) {
      room.listedStocks.push(targetStockName);
    }

    room.state.hasNotifiedStockThisMonth = true;

    io.to(rid).emit('screen:open_stock_modal', {
      name: targetStockName,
      desc: targetStockData.desc || "無說明",
      price: currentPrice,
      dividendMonth8: targetStockData.dividendMonth8,
      currentMonth: curMonth
    });

    emitRoomSync(rid);
  });

  // 8. 股票漲跌通知
  socket.on('admin:action_stock_fluctuation', (roomId) => {
    const rid = (roomId || boundRoomId || "ROOM-101").trim().toUpperCase();
    const room = getOrCreateRoom(rid);
    let curMonth = room.state.month;
    let updatedList = [];

    room.listedStocks.forEach(sName => {
      let sData = room.config.annualStocks[sName];
      if (sData && sData.monthlyPrices && sData.monthlyPrices[curMonth] !== undefined) {
        let oldPrice = room.marketStockPrices[sName] || Number(sData.monthlyPrices[1]) || 50;
        let newPrice = Number(sData.monthlyPrices[curMonth]);
        room.marketStockPrices[sName] = newPrice;
        let diff = newPrice - oldPrice;
        let diffStr = diff > 0 ? `漲 +$${diff}` : (diff < 0 ? `跌 -$${Math.abs(diff)}` : `持平`);
        updatedList.push(`【${sName}】市價 $${newPrice} (${diffStr})`);
      }
    });

    if (updatedList.length === 0) {
      return socket.emit('admin:msg', { text: `⚠️ 目前市場上尚無已發行上市的股票！` });
    }

    room.state.hasNotifiedStockFluctuationThisMonth = true;

    for (let id in room.players) {
      let p = room.players[id];
      if (p.stockOrders && p.stockOrders.length > 0) {
        addPlayerLog(p, `📊 [第${curMonth}月股票行情異動]：${updatedList.join('；')}。股票市值已同步重新估算！`);
      }
    }

    io.to(rid).emit('screen:alert', {
      title: `📊 第 ${curMonth} 個月股票行情異動！`,
      msg: `最新行情：\n${updatedList.join('\n')}`
    });

    emitRoomSync(rid);
  });

  // 9. 定存詢問通知
  socket.on('admin:notify_deposit', (roomId) => {
    const rid = (roomId || boundRoomId || "ROOM-101").trim().toUpperCase();
    const room = getOrCreateRoom(rid);
    let curMonth = room.state.month;
    if (room.state.hasNotifiedDepositThisMonth) {
      return socket.emit('admin:msg', { text: `⚠️ 第 ${curMonth} 個月的定存專案已經詢問過囉！` });
    }

    let target = room.config.annualDeposits.find(d => Number(d.saleMonth) === curMonth);
    if (!target) {
      return socket.emit('admin:msg', { text: `⚠️ 劇本中未設置「第 ${curMonth} 個月」要詢問的定存專案！` });
    }

    room.state.hasNotifiedDepositThisMonth = true;

    io.to(rid).emit('screen:open_deposit_modal', {
      name: target.name,
      monthlyAmount: Number(target.monthlyAmount),
      monthlyRate: Number(target.monthlyRate),
      currentMonth: curMonth
    });

    io.to(rid).emit('screen:alert', {
      title: `🏦 定存專案發布通知 (第 ${curMonth} 個月)`,
      msg: `本月定存專案【${target.name}】已開放簽署！`
    });

    emitRoomSync(rid);
  });

  // 10. 保險詢問通知
  socket.on('admin:notify_insurance', (roomId) => {
    const rid = (roomId || boundRoomId || "ROOM-101").trim().toUpperCase();
    const room = getOrCreateRoom(rid);
    let curMonth = room.state.month;
    if (room.state.hasNotifiedInsuranceThisMonth) {
      return socket.emit('admin:msg', { text: `⚠️ 第 ${curMonth} 個月的保險合約已經詢問過囉！` });
    }

    let target = room.config.annualInsurances.find(i => Number(i.saleMonth) === curMonth);
    if (!target) {
      return socket.emit('admin:msg', { text: `⚠️ 劇本中未設置「第 ${curMonth} 個月」要詢問的保險合約！` });
    }

    room.state.hasNotifiedInsuranceThisMonth = true;

    io.to(rid).emit('screen:open_insurance_modal', {
      name: target.name,
      monthlyFee: Number(target.monthlyFee),
      claimAmount: Number(target.claimAmount),
      currentMonth: curMonth
    });

    io.to(rid).emit('screen:alert', {
      title: `🛡️ 保險保障發布通知 (第 ${curMonth} 個月)`,
      msg: `本月保單合約【${target.name}】已開放投保！`
    });

    emitRoomSync(rid);
  });

  // 11. 突發事件
  socket.on('admin:action_event', (roomId) => {
    const rid = (roomId || boundRoomId || "ROOM-101").trim().toUpperCase();
    const room = getOrCreateRoom(rid);
    const curMonth = room.state.month;
    if (room.state.hasTriggeredEventThisMonth) {
      return socket.emit('admin:msg', { text: `⚠️ 第 ${curMonth} 個月的突發事件已經觸發過囉！` });
    }

    const evt = room.config.annualEvents[curMonth] || { desc: "生活平順無事故", gain: 0, loss: 0, claimInsuranceName: "" };
    const net = Number(evt.gain) - Number(evt.loss);

    room.state.hasTriggeredEventThisMonth = true;

    for (let id in room.players) {
      let p = room.players[id];
      p.cash += net;
      let tag = net > 0 ? `🎉 [突發好運 +$${net.toLocaleString()}]` : (net < 0 ? `🚨 [突發事故 -$${Math.abs(net).toLocaleString()}]` : `🌿 [生活平順 $0]`);
      addPlayerLog(p, `${tag}：${evt.desc}`);
    }

    io.to(rid).emit('screen:alert', {
      title: `⚡ 第 ${curMonth} 個月生活突發事件`,
      msg: `【事件內容】：${evt.desc}\n【現金異動】：${net >= 0 ? '+' : ''}$${net.toLocaleString()}`
    });

    emitRoomSync(rid);
  });

  // 12. 保險理賠通知
  socket.on('admin:notify_insurance_claim', (roomId) => {
    const rid = (roomId || boundRoomId || "ROOM-101").trim().toUpperCase();
    const room = getOrCreateRoom(rid);
    const curMonth = room.state.month;

    if (!room.state.hasTriggeredEventThisMonth) {
      return socket.emit('admin:msg', { text: `⚠️ 第 ${curMonth} 個月的突發事件尚未發生！請先點擊觸發事件。` });
    }

    const curEvt = room.config.annualEvents[curMonth];
    const targetInsName = curEvt ? (curEvt.claimInsuranceName || "").trim() : "";

    if (!targetInsName) {
      return socket.emit('admin:msg', { text: `ℹ️ 第 ${curMonth} 個月突發事件無約定理賠保單！` });
    }

    room.state.hasClaimedInsuranceThisMonth = true;
    let claimCount = 0;

    for (let id in room.players) {
      let p = room.players[id];
      if (p.insurances && p.insurances[targetInsName]) {
        let ins = p.insurances[targetInsName];
        p.cash += ins.claimAmount;
        addPlayerLog(p, `🩺 [保單理賠入帳-${targetInsName}] 保險金給付 +$${ins.claimAmount.toLocaleString()}`);
        claimCount++;
      }
    }

    io.to(rid).emit('screen:alert', { 
      title: "🩺 保險事故理賠給付通知", 
      msg: `已向符合「${targetInsName}」之學員發放理賠金（共 ${claimCount} 位學員受惠）。` 
    });
    emitRoomSync(rid);
  });

  // 學員操作
  socket.on('player:buy_stock', ({ shares, stockName }) => {
    if (!boundRoomId || !rooms[boundRoomId]) return;
    const room = rooms[boundRoomId];
    let p = room.players[socket.id];
    let spData = room.config.annualStocks[stockName];
    if (!p || !spData) return;

    let currentPrice = room.marketStockPrices[stockName] || Number(spData.monthlyPrices[room.state.month]) || 50;
    let cost = shares * currentPrice;
    if (cost > p.cash) return socket.emit('player:msg', { text: "❌ 活期現金不足！" });

    p.cash -= cost;
    p.stockOrders.push({
      orderId: Date.now() + Math.random().toString(36).substring(2, 6),
      month: room.state.month,
      name: stockName,
      buyPrice: currentPrice,
      shares: shares,
      dividendPerShare: Number(spData.dividendMonth8)
    });
    addPlayerLog(p, `🛒 [股票申購成功] 買入 ${shares} 股【${stockName}】，扣除 -$${cost.toLocaleString()}`);
    socket.emit('player:msg', { text: `✅ 申購成功！` });
    emitRoomSync(boundRoomId);
  });

  socket.on('player:accept_deposit', () => {
    if (!boundRoomId || !rooms[boundRoomId]) return;
    const room = rooms[boundRoomId];
    let p = room.players[socket.id];
    let dp = room.config.annualDeposits.find(d => Number(d.saleMonth) === room.state.month);
    if (!p || !dp) return;
    if (p.deposits[dp.name]) return socket.emit('player:msg', { text: "⚠️ 您已開立過此定存專案！" });

    const firstMonthDeduct = Number(dp.monthlyAmount);
    if (p.cash < firstMonthDeduct) return socket.emit('player:msg', { text: `❌ 活期現金不足！` });

    p.cash -= firstMonthDeduct;
    p.deposits[dp.name] = {
      monthlyAmount: firstMonthDeduct,
      monthlyRate: Number(dp.monthlyRate),
      startMonth: room.state.month,
      accumulatedAmount: firstMonthDeduct
    };
    addPlayerLog(p, `📝 [開立定存成功] 開立「${dp.name}」，首期扣除 -$${firstMonthDeduct.toLocaleString()}`);
    socket.emit('player:msg', { text: `✅ 定存簽署成功！` });
    emitRoomSync(boundRoomId);
  });

  socket.on('player:accept_insurance', () => {
    if (!boundRoomId || !rooms[boundRoomId]) return;
    const room = rooms[boundRoomId];
    let p = room.players[socket.id];
    let ip = room.config.annualInsurances.find(i => Number(i.saleMonth) === room.state.month);
    if (!p || !ip) return;
    if (p.insurances && p.insurances[ip.name]) return socket.emit('player:msg', { text: `⚠️ 您已經投保過「${ip.name}」！` });

    const firstMonthFee = Number(ip.monthlyFee);
    if (p.cash < firstMonthFee) return socket.emit('player:msg', { text: `❌ 活期現金不足！` });

    p.cash -= firstMonthFee;
    p.insurances[ip.name] = {
      monthlyFee: firstMonthFee,
      claimAmount: Number(ip.claimAmount),
      startMonth: room.state.month,
      accumulatedFee: firstMonthFee
    };
    addPlayerLog(p, `🛡️ [保單核保生效] 投保「${ip.name}」，首期扣繳 -$${firstMonthFee.toLocaleString()}`);
    socket.emit('player:msg', { text: `✅ 投保成功！` });
    emitRoomSync(boundRoomId);
  });

  // 推進下個月
  socket.on('admin:next_month', (roomId) => {
    const rid = (roomId || boundRoomId || "ROOM-101").trim().toUpperCase();
    const room = getOrCreateRoom(rid);
    let closedMonth = room.state.month;
    let currentLeaderboard = getLeaderboardArray(room);
    let topThree = currentLeaderboard.slice(0, 3).map((p, idx) => ({
      rank: idx + 1,
      name: p.name,
      totalAssets: p.totalAssets
    }));

    if (room.state.month < 12) {
      room.state.month += 1;
      room.state.hasPaidSalaryThisMonth = false;
      room.state.hasDeductedExpensesThisMonth = false;
      room.state.hasPaidDepositInterestThisMonth = false;
      room.state.hasDeductedDepositThisMonth = false;
      room.state.hasDeductedInsuranceThisMonth = false;
      room.state.hasTriggeredEventThisMonth = false;
      room.state.hasClaimedInsuranceThisMonth = false;
      room.state.hasNotifiedStockThisMonth = false;
      room.state.hasNotifiedStockFluctuationThisMonth = false;
      room.state.hasNotifiedDepositThisMonth = false;
      room.state.hasNotifiedInsuranceThisMonth = false;

      io.to(rid).emit('screen:show_month_settlement', {
        closedMonth: closedMonth,
        nextMonth: room.state.month,
        title: room.config.leaderboardTitle,
        topThree: topThree
      });
    } else {
      io.to(rid).emit('screen:show_month_settlement', {
        closedMonth: 12,
        nextMonth: 12,
        title: `🏁 年度最終 ${room.config.leaderboardTitle}`,
        topThree: topThree,
        isFinal: true
      });
    }
    emitRoomSync(rid);
  });

  // 重置指定房間
  socket.on('admin:reset', (roomId) => {
    const rid = (roomId || boundRoomId || "ROOM-101").trim().toUpperCase();
    const room = getOrCreateRoom(rid);
    room.state = getInitialGameState();
    room.marketStockPrices = {};
    room.listedStocks = [];
    for (let id in room.players) {
      room.players[id].cash = 0;
      room.players[id].stockOrders = [];
      room.players[id].deposits = {};
      room.players[id].insurances = {};
      room.players[id].notifications = ["🔄 遊戲已重置為第 1 個月！等待教師發薪。"];
    }
    io.to(rid).emit('screen:alert', { title: "🔄 遊戲已重置", msg: `本房間（${rid}）進度已回到第 1 個月！` });
    emitRoomSync(rid);
  });

  socket.on('disconnect', () => {
    if (boundRoomId && rooms[boundRoomId] && rooms[boundRoomId].players[socket.id]) {
      delete rooms[boundRoomId].players[socket.id];
      emitRoomSync(boundRoomId);
    }
  });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
  console.log(`✅ 雲端多房間伺服器已啟動於 Port ${PORT}`);
});