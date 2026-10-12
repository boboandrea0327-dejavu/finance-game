const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

app.use(express.static('public'));

let defaultAnnualStocks = {
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
};

let defaultAnnualDeposits = [
  { name: "青年安心定存", saleMonth: 1, monthlyAmount: 5000, monthlyRate: 0.005 },
  { name: "半年衝刺高利定存", saleMonth: 6, monthlyAmount: 8000, monthlyRate: 0.008 }
];

let defaultAnnualInsurances = [
  { name: "全方位安心醫療險", saleMonth: 1, monthlyFee: 1500, claimAmount: 15000 },
  { name: "重大傷病守護專案", saleMonth: 4, monthlyFee: 3000, claimAmount: 40000 }
];

let defaultAnnualEvents = {
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
};

let gameConfig = {
  salary: 38000,
  leaderboardTitle: "🏆 學員資產排行榜", // 自訂排行榜名稱
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
  annualStocks: defaultAnnualStocks,
  annualDeposits: defaultAnnualDeposits,
  annualInsurances: defaultAnnualInsurances,
  annualEvents: defaultAnnualEvents
};

let marketStockPrices = {};
let listedStocks = [];

let gameState = {
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

let players = {};

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

function getLeaderboardArray() {
  return Object.values(players).map(p => {
    let stockTotalVal = 0;
    let stockTotalCost = 0;
    let totalSharesCount = 0;

    if (p.stockOrders && p.stockOrders.length > 0) {
      p.stockOrders.forEach(o => {
        let currentPrice = marketStockPrices[o.name] !== undefined ? marketStockPrices[o.name] : o.buyPrice;
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

io.on('connection', (socket) => {
  socket.on('player:join', (name) => {
    players[socket.id] = {
      id: socket.id,
      name: name || `學員_${socket.id.substring(0,4)}`,
      cash: 0,
      stockOrders: [],
      deposits: {},
      insurances: {},
      notifications: ["👋 歡迎進入挑戰！目前帳戶現金為 $0 【結存：$0】，等待教師發放第一個月薪資。"]
    };
    emitAllUpdate();
  });

  socket.on('admin:update_config', (newCfg) => {
    gameConfig.salary = newCfg.salary;
    gameConfig.expenses = newCfg.expenses;
    io.emit('screen:alert', { title: "⚙️ 參數已更新", msg: "教師端已更新薪資與固定開銷設定！" });
    emitAllUpdate();
  });

  // 教師自訂更新排行榜名稱
  socket.on('admin:update_leaderboard_title', (title) => {
    if (title && title.trim()) {
      gameConfig.leaderboardTitle = title.trim();
      io.emit('screen:alert', { title: "🏆 排行榜名稱已更新", msg: `排行榜已同步更名為：${gameConfig.leaderboardTitle}` });
      emitAllUpdate();
    }
  });

  socket.on('admin:save_annual_stocks', (updatedStocks) => {
    gameConfig.annualStocks = updatedStocks;
    io.emit('screen:alert', { title: "📊 股票年度劇本已儲存", msg: "各月份股票排程與股價曲線已成功更新！" });
    emitAllUpdate();
  });

  socket.on('admin:save_annual_deposits', (updatedDeposits) => {
    gameConfig.annualDeposits = updatedDeposits;
    io.emit('screen:alert', { title: "🏦 定存年度劇本已儲存", msg: "定存方案排程與月利率已成功更新！" });
    emitAllUpdate();
  });

  socket.on('admin:save_annual_insurances', (updatedInsurances) => {
    gameConfig.annualInsurances = updatedInsurances;
    io.emit('screen:alert', { title: "🛡️ 保險年度劇本已儲存", msg: "保險專案排程與理賠額度已成功更新！" });
    emitAllUpdate();
  });

  socket.on('admin:save_annual_events', (updatedEvents) => {
    gameConfig.annualEvents = updatedEvents;
    io.emit('screen:alert', { title: "⚡ 突發事件年度劇本已儲存", msg: "1 ~ 12 月突發事件與理賠保單對應已成功更新！" });
    emitAllUpdate();
  });

  // 1. 發放薪資
  socket.on('admin:action_salary', () => {
    if (gameState.hasPaidSalaryThisMonth) {
      return socket.emit('admin:msg', { text: `⚠️ 第 ${gameState.month} 個月的薪資已經發放過囉！每個月限發一次。` });
    }
    gameState.hasPaidSalaryThisMonth = true;
    const sal = Number(gameConfig.salary);
    for (let id in players) {
      let p = players[id];
      p.cash += sal;
      addPlayerLog(p, `💵 [第${gameState.month}月-固定薪資] 入帳 +$${sal.toLocaleString()}`);
    }
    io.emit('screen:alert', { title: "💵 薪資入帳通知", msg: `第 ${gameState.month} 個月固定薪資 $${sal.toLocaleString()} 已全員發放入帳！` });
    emitAllUpdate();
  });

  // 2. 定存月利率發放
  socket.on('admin:action_deposit_interest', () => {
    if (gameState.hasPaidDepositInterestThisMonth) {
      return socket.emit('admin:msg', { text: `⚠️ 第 ${gameState.month} 個月的定存利息已經發放過囉！每個月限發一次。` });
    }

    gameState.hasPaidDepositInterestThisMonth = true;
    let count = 0;

    for (let id in players) {
      let p = players[id];
      let totalInterest = 0;

      for (let depName in p.deposits) {
        let dep = p.deposits[depName];
        if (gameState.month > dep.startMonth) {
          let interest = Math.round(dep.accumulatedAmount * dep.monthlyRate);
          totalInterest += interest;
          p.cash += interest;
          addPlayerLog(p, `🏦 [定存配息-${depName}] 依本金 $${dep.accumulatedAmount.toLocaleString()} 與月利率 ${(dep.monthlyRate * 100).toFixed(2)}%，獲得利息 +$${interest.toLocaleString()}`);
        }
      }
      if (totalInterest > 0) count++;
    }

    io.emit('screen:alert', { 
      title: "🏦 定存月利息發放完成", 
      msg: `第 ${gameState.month} 個月定存利息已全額匯入！（已排除本月新開立定存之學員，共 ${count} 位學員符合次期配息資格）` 
    });
    emitAllUpdate();
  });

  // 3. 股票股利發放 (限8月)
  socket.on('admin:action_stock_dividend', () => {
    if (gameState.month !== 8) {
      return socket.emit('admin:msg', { text: `⚠️ 股票除息日設定在「第 8 個月」！目前是第 ${gameState.month} 個月，無法發放 8 月股利。` });
    }
    if (gameState.hasPaidDividendMonth8) {
      return socket.emit('admin:msg', { text: "⚠️ 第 8 個月的股利已經發放過囉！除權息每年僅限一次。" });
    }

    gameState.hasPaidDividendMonth8 = true;
    let count = 0;
    for (let id in players) {
      let p = players[id];
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

    io.emit('screen:alert', { 
      title: "📈 8月除息日！現金股利已全體結算", 
      msg: `系統已依據每位學員各月份的持股流水帳，精確核算股利並匯入活期現金！（共 ${count} 位持股學員獲派股利）` 
    });
    emitAllUpdate();
  });

  // 4. 固定開銷扣款
  socket.on('admin:action_expenses', () => {
    if (gameState.hasDeductedExpensesThisMonth) {
      return socket.emit('admin:msg', { text: `⚠️ 第 ${gameState.month} 個月的生活固定開銷已經扣繳過囉！每個月只能扣款一次，無法重複扣款。` });
    }

    gameState.hasDeductedExpensesThisMonth = true;
    const totalExp = Object.values(gameConfig.expenses).reduce((a, b) => a + Number(b), 0);

    for (let id in players) {
      let p = players[id];
      for (let key in gameConfig.expenses) {
        let amount = Number(gameConfig.expenses[key]);
        let label = EXPENSE_LABELS[key] || key;
        p.cash -= amount;
        addPlayerLog(p, `  🔹 ${label}：扣繳 -$${amount.toLocaleString()}`);
      }
      p.notifications.unshift(`════ 🧾 第 ${gameState.month} 個月生活必要開銷（總計 -$${totalExp.toLocaleString()}） 【結存：$${p.cash.toLocaleString()}】 ════`);
    }

    io.emit('screen:alert', { 
      title: "🧾 9大固定開銷扣款完成", 
      msg: `第 ${gameState.month} 個月生活必要開銷總計 $${totalExp.toLocaleString()} 扣除完畢！` 
    });
    emitAllUpdate();
  });

  // 5. 定存續期扣款
  socket.on('admin:action_deposit_deduct', () => {
    if (gameState.hasDeductedDepositThisMonth) {
      return socket.emit('admin:msg', { text: `⚠️ 第 ${gameState.month} 個月的定存扣款已經執行過囉！每個月只能扣繳一次。` });
    }

    gameState.hasDeductedDepositThisMonth = true;
    let count = 0;

    for (let id in players) {
      let p = players[id];
      let deductTotal = 0;

      for (let depName in p.deposits) {
        let dep = p.deposits[depName];
        if (gameState.month > dep.startMonth) {
          deductTotal += dep.monthlyAmount;
          dep.accumulatedAmount += dep.monthlyAmount;
          p.cash -= dep.monthlyAmount;
          addPlayerLog(p, `🏦 [定存續期扣繳-${depName}] 第${gameState.month}期存入 -$${dep.monthlyAmount.toLocaleString()}（累計定存本金：$${dep.accumulatedAmount.toLocaleString()}）`);
        }
      }
      if (deductTotal > 0) count++;
    }

    io.emit('screen:alert', { 
      title: "🏦 定存定期扣款完成", 
      msg: `第 ${gameState.month} 個月定存扣款完成！（已自動排除本月份新開立定存之學員，共 ${count} 位學員執行續期儲蓄）` 
    });
    emitAllUpdate();
  });

  // 6. 保險續期扣款
  socket.on('admin:action_insurance_deduct', () => {
    if (gameState.hasDeductedInsuranceThisMonth) {
      return socket.emit('admin:msg', { text: `⚠️ 第 ${gameState.month} 個月的保費扣款已經執行過囉！每個月只能扣繳一次。` });
    }

    gameState.hasDeductedInsuranceThisMonth = true;
    let count = 0;

    for (let id in players) {
      let p = players[id];
      let deductTotal = 0;

      for (let insName in p.insurances) {
        let ins = p.insurances[insName];
        if (gameState.month > (ins.startMonth || 1)) {
          deductTotal += ins.monthlyFee;
          ins.accumulatedFee = (ins.accumulatedFee || ins.monthlyFee) + ins.monthlyFee;
          p.cash -= ins.monthlyFee;
          addPlayerLog(p, `🛡️ [保費續期扣繳-${insName}] 第${gameState.month}期續保扣費 -$${ins.monthlyFee.toLocaleString()}（累計已繳保費：$${ins.accumulatedFee.toLocaleString()}）`);
        }
      }
      if (deductTotal > 0) count++;
    }

    io.emit('screen:alert', { 
      title: "🛡️ 保費定期扣款完成", 
      msg: `第 ${gameState.month} 個月保險扣繳完成！（已自動排除本月新投保之學員，共 ${count} 位學員續保扣費）` 
    });
    emitAllUpdate();
  });

  // 7. 股票購買通知
  socket.on('admin:notify_stock', () => {
    let curMonth = gameState.month;
    let targetStockName = null;
    let targetStockData = null;

    for (let sName in gameConfig.annualStocks) {
      let s = gameConfig.annualStocks[sName];
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

    marketStockPrices[targetStockName] = currentPrice;
    if (!listedStocks.includes(targetStockName)) {
      listedStocks.push(targetStockName);
    }

    gameState.hasNotifiedStockThisMonth = true;

    io.emit('screen:open_stock_modal', {
      name: targetStockName,
      desc: targetStockData.desc || "無說明",
      price: currentPrice,
      dividendMonth8: targetStockData.dividendMonth8,
      currentMonth: curMonth
    });

    emitAllUpdate();
  });

  // 8. 股票漲跌通知
  socket.on('admin:action_stock_fluctuation', () => {
    let curMonth = gameState.month;
    let updatedList = [];

    listedStocks.forEach(sName => {
      let sData = gameConfig.annualStocks[sName];
      if (sData && sData.monthlyPrices && sData.monthlyPrices[curMonth] !== undefined) {
        let oldPrice = marketStockPrices[sName];
        let newPrice = Number(sData.monthlyPrices[curMonth]);
        marketStockPrices[sName] = newPrice;
        let diff = newPrice - oldPrice;
        let diffStr = diff > 0 ? `漲 +$${diff}` : (diff < 0 ? `跌 -$${Math.abs(diff)}` : `持平`);
        updatedList.push(`【${sName}】市價 $${newPrice} (${diffStr})`);
      }
    });

    if (updatedList.length === 0) {
      return socket.emit('admin:msg', { text: `⚠️ 目前市場上尚無已發行上市的股票，或劇本中未設定第 ${curMonth} 個月之行情！` });
    }

    gameState.hasNotifiedStockFluctuationThisMonth = true;

    for (let id in players) {
      let p = players[id];
      if (p.stockOrders && p.stockOrders.length > 0) {
        addPlayerLog(p, `📊 [第${curMonth}月股票行情異動]：${updatedList.join('；')}。股票市值已同步重新估算！`);
      }
    }

    io.emit('screen:alert', {
      title: `📊 第 ${curMonth} 個月股票行情大幅異動！`,
      msg: `最新行情結算：\n${updatedList.join('\n')}\n全體學員股票市值與總資產已即刻浮動更新！`
    });

    emitAllUpdate();
  });

  // 9. 定存詢問通知
  socket.on('admin:notify_deposit', () => {
    let curMonth = gameState.month;
    if (gameState.hasNotifiedDepositThisMonth) {
      return socket.emit('admin:msg', { text: `⚠️ 第 ${curMonth} 個月的定存專案已經詢問過囉！每個月限詢問一次，無法重複投放給學員。` });
    }

    let target = gameConfig.annualDeposits.find(d => Number(d.saleMonth) === curMonth);
    if (!target) {
      return socket.emit('admin:msg', { text: `⚠️ 劇本中未設置「第 ${curMonth} 個月」要詢問的定存專案！您可在『當年度定存操縱面板』調整開賣月份。` });
    }

    gameState.hasNotifiedDepositThisMonth = true;

    io.emit('screen:open_deposit_modal', {
      name: target.name,
      monthlyAmount: Number(target.monthlyAmount),
      monthlyRate: Number(target.monthlyRate),
      currentMonth: curMonth
    });

    io.emit('screen:alert', {
      title: `🏦 定存專案發布通知 (第 ${curMonth} 個月)`,
      msg: `本月定存專案【${target.name}】已向全體學員開放簽署詢問！`
    });

    emitAllUpdate();
  });

  // 10. 保險詢問通知
  socket.on('admin:notify_insurance', () => {
    let curMonth = gameState.month;
    if (gameState.hasNotifiedInsuranceThisMonth) {
      return socket.emit('admin:msg', { text: `⚠️ 第 ${curMonth} 個月的保險合約已經詢問過囉！每個月限詢問一次，無法重複投放給學員。` });
    }

    let target = gameConfig.annualInsurances.find(i => Number(i.saleMonth) === curMonth);
    if (!target) {
      return socket.emit('admin:msg', { text: `⚠️ 劇本中未設置「第 ${curMonth} 個月」要詢問的保險合約！您可在『當年度保險操縱面板』調整開賣月份。` });
    }

    gameState.hasNotifiedInsuranceThisMonth = true;

    io.emit('screen:open_insurance_modal', {
      name: target.name,
      monthlyFee: Number(target.monthlyFee),
      claimAmount: Number(target.claimAmount),
      currentMonth: curMonth
    });

    io.emit('screen:alert', {
      title: `🛡️ 保險保障發布通知 (第 ${curMonth} 個月)`,
      msg: `本月保單合約【${target.name}】已向全體學員開放投保詢問！`
    });

    emitAllUpdate();
  });

  // 11. 突發事件
  socket.on('admin:action_event', () => {
    const curMonth = gameState.month;
    if (gameState.hasTriggeredEventThisMonth) {
      return socket.emit('admin:msg', { text: `⚠️ 第 ${curMonth} 個月的突發事件已經觸發過囉！每個月限觸發一次。` });
    }

    const evt = gameConfig.annualEvents[curMonth] || { desc: "生活平順無事故", gain: 0, loss: 0, claimInsuranceName: "" };
    const net = Number(evt.gain) - Number(evt.loss);

    gameState.hasTriggeredEventThisMonth = true;

    for (let id in players) {
      let p = players[id];
      p.cash += net;
      let tag = net > 0 ? `🎉 [突發好運 +$${net.toLocaleString()}]` : (net < 0 ? `🚨 [突發事故 -$${Math.abs(net).toLocaleString()}]` : `🌿 [生活平順 $0]`);
      addPlayerLog(p, `${tag}：${evt.desc}`);
    }

    io.emit('screen:alert', {
      title: `⚡ 第 ${curMonth} 個月生活突發事件`,
      msg: `【事件內容】：${evt.desc}\n【現金異動】：${net >= 0 ? '+' : ''}$${net.toLocaleString()}`
    });

    emitAllUpdate();
  });

  // 12. 保險理賠通知
  socket.on('admin:notify_insurance_claim', () => {
    const curMonth = gameState.month;

    if (!gameState.hasTriggeredEventThisMonth) {
      return socket.emit('admin:msg', { text: `⚠️ 第 ${curMonth} 個月的突發事件尚未發生！請先點擊「觸發本月突發事件」後，再按保險理賠通知。` });
    }

    const curEvt = gameConfig.annualEvents[curMonth];
    const targetInsName = curEvt ? (curEvt.claimInsuranceName || "").trim() : "";

    if (!targetInsName) {
      return socket.emit('admin:msg', { text: `ℹ️ 第 ${curMonth} 個月的突發事件（${curEvt.desc}）並無約定可理賠的保險合約！無人獲得理賠。` });
    }

    gameState.hasClaimedInsuranceThisMonth = true;
    let claimCount = 0;

    for (let id in players) {
      let p = players[id];
      if (p.insurances && p.insurances[targetInsName]) {
        let ins = p.insurances[targetInsName];
        p.cash += ins.claimAmount;
        addPlayerLog(p, `🩺 [保單理賠入帳-${targetInsName}] 因事故符合契約約定，保險金全額給付 +$${ins.claimAmount.toLocaleString()}`);
        claimCount++;
      }
    }

    io.emit('screen:alert', { 
      title: "🩺 保險事故理賠給付通知", 
      msg: `第 ${curMonth} 個月突發事件經核保符合「${targetInsName}」條款！已發放理賠金至符合條件之學員帳戶（共 ${claimCount} 位學員受惠）。` 
    });
    emitAllUpdate();
  });

  // 學員申購股票
  socket.on('player:buy_stock', ({ shares, stockName }) => {
    let p = players[socket.id];
    let spData = gameConfig.annualStocks[stockName];
    if (!p || !spData) return;

    let currentPrice = marketStockPrices[stockName] || Number(spData.monthlyPrices[gameState.month]) || 50;
    let cost = shares * currentPrice;
    if (cost > p.cash) return socket.emit('player:msg', { text: "❌ 活期現金額度不足，無法購買此數量！" });

    p.cash -= cost;
    const orderRecord = {
      orderId: Date.now() + Math.random().toString(36).substring(2, 6),
      month: gameState.month,
      name: stockName,
      buyPrice: currentPrice,
      shares: shares,
      dividendPerShare: Number(spData.dividendMonth8)
    };

    p.stockOrders.push(orderRecord);
    addPlayerLog(p, `🛒 [股票申購成功] 第${gameState.month}月以每股 $${currentPrice} 買入 ${shares} 股【${stockName}】，扣除現金額度 -$${cost.toLocaleString()}`);
    socket.emit('player:msg', { text: `✅ 申購成功！本筆 ${shares} 股 ${stockName} 已納入持股流水帳。` });
    emitAllUpdate();
  });

  // 學員開立定存
  socket.on('player:accept_deposit', () => {
    let p = players[socket.id];
    let curMonth = gameState.month;
    let dp = gameConfig.annualDeposits.find(d => Number(d.saleMonth) === curMonth);
    if (!p || !dp) return;
    if (p.deposits[dp.name]) return socket.emit('player:msg', { text: "⚠️ 您已開立過此定存專案！" });

    const firstMonthDeduct = Number(dp.monthlyAmount);
    if (p.cash < firstMonthDeduct) {
      return socket.emit('player:msg', { text: `❌ 活期現金不足！需要至少 $${firstMonthDeduct.toLocaleString()} 支付首期存入金額。` });
    }

    p.cash -= firstMonthDeduct;
    p.deposits[dp.name] = {
      monthlyAmount: firstMonthDeduct,
      monthlyRate: Number(dp.monthlyRate),
      startMonth: curMonth,
      accumulatedAmount: firstMonthDeduct
    };
    addPlayerLog(p, `📝 [開立定存成功] 第${curMonth}月開立「${dp.name}」，當下扣除首期月定存金 -$${firstMonthDeduct.toLocaleString()}`);
    socket.emit('player:msg', { text: `✅ 定存簽署成功！已扣除首期款 $${firstMonthDeduct.toLocaleString()}（計入定存總資產）。續期扣款將於次月（第 ${curMonth + 1} 個月）起開始執行！` });
    emitAllUpdate();
  });

  // 學員投保
  socket.on('player:accept_insurance', () => {
    let p = players[socket.id];
    let curMonth = gameState.month;
    let ip = gameConfig.annualInsurances.find(i => Number(i.saleMonth) === curMonth);
    if (!p || !ip) return;

    if (p.insurances && p.insurances[ip.name]) {
      return socket.emit('player:msg', { text: `⚠️ 您已經投保過「${ip.name}」！每種保險商品限投保一次，無法重複投保。` });
    }

    const firstMonthFee = Number(ip.monthlyFee);
    if (p.cash < firstMonthFee) {
      return socket.emit('player:msg', { text: `❌ 活期現金不足！需要至少 $${firstMonthFee.toLocaleString()} 支付首期保險費。` });
    }

    p.cash -= firstMonthFee;
    p.insurances[ip.name] = {
      monthlyFee: firstMonthFee,
      claimAmount: Number(ip.claimAmount),
      startMonth: curMonth,
      accumulatedFee: firstMonthFee
    };
    addPlayerLog(p, `🛡️ [保單核保生效] 第${curMonth}月投保「${ip.name}」，當下扣除首期保費 -$${firstMonthFee.toLocaleString()}`);
    socket.emit('player:msg', { text: `✅ 投保成功！已扣除首期保費 $${firstMonthFee.toLocaleString()}。續期保費將於次月（第 ${curMonth + 1} 個月）起開始扣繳！` });
    emitAllUpdate();
  });

  // 【核心升級】：推進下個月時，同步廣播「本月結算前三名名單」給所有學員
  socket.on('admin:next_month', () => {
    let closedMonth = gameState.month;
    let currentLeaderboard = getLeaderboardArray();
    let topThree = currentLeaderboard.slice(0, 3).map((p, idx) => ({
      rank: idx + 1,
      name: p.name,
      totalAssets: p.totalAssets
    }));

    if (gameState.month < 12) {
      gameState.month += 1;
      gameState.hasPaidSalaryThisMonth = false;
      gameState.hasDeductedExpensesThisMonth = false;
      gameState.hasPaidDepositInterestThisMonth = false;
      gameState.hasDeductedDepositThisMonth = false;
      gameState.hasDeductedInsuranceThisMonth = false;
      gameState.hasTriggeredEventThisMonth = false;
      gameState.hasClaimedInsuranceThisMonth = false;
      gameState.hasNotifiedStockThisMonth = false;
      gameState.hasNotifiedStockFluctuationThisMonth = false;
      gameState.hasNotifiedDepositThisMonth = false;
      gameState.hasNotifiedInsuranceThisMonth = false;

      // 廣播前三名月結算彈窗給學生端
      io.emit('screen:show_month_settlement', {
        closedMonth: closedMonth,
        nextMonth: gameState.month,
        title: gameConfig.leaderboardTitle,
        topThree: topThree
      });
    } else {
      io.emit('screen:show_month_settlement', {
        closedMonth: 12,
        nextMonth: 12,
        title: `🏁 年度最終 ${gameConfig.leaderboardTitle}`,
        topThree: topThree,
        isFinal: true
      });
    }
    emitAllUpdate();
  });

  // 重置遊戲
  socket.on('admin:reset', () => {
    gameState.month = 1;
    gameState.hasPaidSalaryThisMonth = false;
    gameState.hasDeductedExpensesThisMonth = false;
    gameState.hasPaidDepositInterestThisMonth = false;
    gameState.hasDeductedDepositThisMonth = false;
    gameState.hasDeductedInsuranceThisMonth = false;
    gameState.hasTriggeredEventThisMonth = false;
    gameState.hasClaimedInsuranceThisMonth = false;
    gameState.hasNotifiedStockThisMonth = false;
    gameState.hasNotifiedStockFluctuationThisMonth = false;
    gameState.hasNotifiedDepositThisMonth = false;
    gameState.hasNotifiedInsuranceThisMonth = false;
    gameState.hasPaidDividendMonth8 = false;
    marketStockPrices = {};
    listedStocks = [];
    for (let id in players) {
      players[id].cash = 0;
      players[id].stockOrders = [];
      players[id].deposits = {};
      players[id].insurances = {};
      players[id].notifications = ["🔄 遊戲已重置為第 1 個月！目前現金為 $0 【結存：$0】，等待教師發薪。"];
    }
    io.emit('screen:alert', { title: "🔄 遊戲已重置", msg: "全場進度已回到第 1 個月，學員活期現金重置為 $0！" });
    emitAllUpdate();
  });

  socket.on('disconnect', () => {
    delete players[socket.id];
    emitAllUpdate();
  });
});

function emitAllUpdate() {
  let leaderboard = getLeaderboardArray();
  io.emit('state:sync', { gameState, gameConfig, marketStockPrices, listedStocks, leaderboard });
}

const PORT = 3000;
http.listen(PORT, () => {
  console.log(`✅ 遊戲系統已更新！請在瀏覽器打開 http://localhost:3000/admin.html 與 http://localhost:3000/player.html`);
});