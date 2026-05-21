/**
 * 高雄郵局商品管理系統 - 後端邏輯 (GAS)
 * ★ 已升級為 API 伺服器架構，支援 GitHub 前端呼叫
 */

const SPREADSHEET_IDS = {
  INVENTORY: '1NChMUn0wOAAJ2WkyMlgajUAp9j-VjYV1Q2WANnp4r9s', // 商品庫存表
  UPLOAD_MGR: '1xoEP3kymqpqbtO-jSpuCJTPVsKp8NDtBcUDrCUN8P8Y', // 支局上架管理表
  INFO_AUTH: '1ufCs0u-jFZe0ZTgrje14Kd5FNCdmG_zlVynx7N1AcVY' // 支局資訊與權限表
};

function doGet(e) {
  if (e && e.parameter) {
    if (e.parameter.action === 'getCustomerData') {
      const data = getCustomerData();
      return ContentService.createTextOutput(JSON.stringify(data))
                           .setMimeType(ContentService.MimeType.JSON);
    }
    if (e.parameter.action === 'recordClick') {
      if (e.parameter.productId) {
        recordProductClick(e.parameter.productId);
      }
      return ContentService.createTextOutput(JSON.stringify({status: 'success'}))
                           .setMimeType(ContentService.MimeType.JSON);
    }
  }
  
  let template = HtmlService.createTemplateFromFile('Index');
  return template.evaluate()
      .setTitle('高雄郵局商品管理系統')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// 1. 登入驗證
function verifyLogin(account, password) {
  try {
    const authSheet = SpreadsheetApp.openById(SPREADSHEET_IDS.INFO_AUTH).getSheetByName('帳號權限');
    const data = authSheet.getDataRange().getValues();
    
    for (let i = 1; i < data.length; i++) {
      let [局號, 局名, 局等, 帳號, 密碼, 權限等級] = data[i];
      if (String(帳號).trim() === String(account).trim() && String(密碼).trim() === String(password).trim()) {
        logAction(account, '系統登入');
        return {
          status: 'success',
          branchId: String(局號).trim(),
          branchName: 局名,
          role: 權限等級
        };
      }
    }
    return { status: 'fail', message: '帳號或密碼錯誤' };
  } catch (error) {
    return { status: 'error', message: error.toString() };
  }
}

// 2. 日誌紀錄
function logAction(account, action) {
  try {
    const logSheet = SpreadsheetApp.openById(SPREADSHEET_IDS.INFO_AUTH).getSheetByName('操作日誌');
    const timeString = Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy/MM/dd HH:mm:ss');
    logSheet.appendRow([timeString, "'" + String(account).trim(), action]);
  } catch (e) {
    console.error("日誌寫入失敗: " + e.message);
  }
}

// 3. 讀取支局商品資料
function getBranchData(branchId) {
  try {
    const invSs = SpreadsheetApp.openById(SPREADSHEET_IDS.INVENTORY);
    const invSheet = invSs.getSheetByName('庫存資料');
    const mainSheet = invSs.getSheetByName('商品主檔'); 
    const mgrSs = SpreadsheetApp.openById(SPREADSHEET_IDS.UPLOAD_MGR);
    const mgrSheet = mgrSs.getSheetByName('分局上架狀態');
    
    let allowSheet = mgrSs.getSheetByName('全局開放清單');
    let allowedKeys = [];
    if (allowSheet) {
      const allowData = allowSheet.getDataRange().getValues();
      allowedKeys = allowData.slice(1).map(row => String(row[0]).trim()); 
    } else {
      allowSheet = mgrSs.insertSheet('全局開放清單');
      allowSheet.appendRow(['被允許開放的商品組合鍵(類別+票品+票號)']);
    }

    const invData = invSheet.getDataRange().getValues();
    const mainData = mainSheet.getDataRange().getValues();
    const bid = String(branchId).trim();

    const mainMap = {};
    mainData.slice(1).forEach(row => {
      const key = `${String(row[1]).trim()}${String(row[2]).trim()}${String(row[3]).trim()}`;
      mainMap[key] = {
        barcode: row[4],    
        price: row[5],      
        name: row[30] || row[7] || row[3], 
        date: row[8] ? (row[8] instanceof Date ? Utilities.formatDate(row[8], 'Asia/Taipei', 'yyyy/MM/dd') : String(row[8])) : '未提供',
        img: row[31] || ''  
      };
    });

    const myProducts = invData.slice(1)
      .filter(row => String(row[1]).trim() === bid) 
      .map(row => {
        const key = `${String(row[2]).trim()}${String(row[3]).trim()}${String(row[4]).trim()}`; 
        const info = mainMap[key];
        return {
          key: key,
          barcode: info ? info.barcode : key, 
          name: info ? info.name : (row[5] || "未命名:" + row[3]), 
          price: info ? info.price : (row[7] || 0), 
          date: info ? info.date : (row[6] instanceof Date ? Utilities.formatDate(row[6], 'Asia/Taipei', 'yyyy/MM/dd') : (row[6] || "未提供")),
          img: info ? info.img : "",
          qty: row[8] || 0 
        };
      })
      .filter(product => allowedKeys.includes(product.key)); 

    let selectedItemsMap = {};
    if (mgrSheet.getLastRow() > 1) {
      const mgrData = mgrSheet.getDataRange().getValues();
      mgrData.slice(1).forEach(row => {
        if (String(row[0]).trim() === bid && row[6] === 'T') {
          const k = `${String(row[1]).trim()}${String(row[2]).trim()}${String(row[3]).trim()}`;
          if (allowedKeys.includes(k)) {
            selectedItemsMap[k] = row.length > 7 ? (Number(row[7]) || 0) : 0;
          }
        }
      });
    }

    return { allProducts: myProducts, selectedItemsMap: selectedItemsMap };
  } catch (e) {
    throw new Error("載入出錯: " + e.message);
  }
}

// 4. 儲存排序與上架狀態 (B級)
function saveSelection(branchId, itemsData) {
  try {
    const bid = String(branchId).trim();
    const mgrSs = SpreadsheetApp.openById(SPREADSHEET_IDS.UPLOAD_MGR);
    const mgrSheet = mgrSs.getSheetByName('分局上架狀態');
    const invSheet = SpreadsheetApp.openById(SPREADSHEET_IDS.INVENTORY).getSheetByName('庫存資料');
    
    const allInvRows = invSheet.getDataRange().getValues().slice(1)
                       .filter(row => String(row[1]).trim() === bid);

    const oldData = mgrSheet.getDataRange().getValues();
    let headers = oldData[0] || [];
    if (headers.length < 8) {
      headers[7] = '現場額外數量';
    }
    
    const otherRows = oldData.slice(1).filter(row => String(row[0]).trim() !== bid).map(r => {
      while(r.length < 8) r.push(''); 
      return r;
    });
    
    const currentRows = allInvRows.map(row => {
      const key = `${String(row[2]).trim()}${String(row[3]).trim()}${String(row[4]).trim()}`;
      const isListed = itemsData.hasOwnProperty(key);
      const extraQty = isListed ? (Number(itemsData[key]) || 0) : 0;
      return [bid, row[2], row[3], row[4], row[8], isListed ? 1 : '', isListed ? 'T' : 'F', extraQty];
    });

    const finalData = [headers].concat(otherRows).concat(currentRows);
    mgrSheet.clearContents();
    mgrSheet.getRange(1, 1, finalData.length, 8).setValues(finalData); 
    
    logAction(branchId, '更新了上架清單與現場數量');
    return "儲存成功！";
  } catch (e) {
    return "儲存失敗：" + e.toString();
  }
}

// 5. A 級權限上傳大資料庫
function updateInventoryFromExcel(dataArray, adminAccount) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_IDS.INVENTORY);
    const sheet = ss.getSheetByName('庫存資料');
    sheet.clearContents();
    sheet.getRange(1, 1, dataArray.length, dataArray[0].length).setValues(dataArray);
    logAction(adminAccount, 'A權限更新大資料庫');
    return { status: 'success', message: "大資料庫已成功覆蓋更新" };
  } catch (e) {
    return { status: 'error', message: e.toString() };
  }
}

// 6. 讀取 A 級管理員的「全局商品清單」
function getAdminSettingData() {
  try {
    const invSs = SpreadsheetApp.openById(SPREADSHEET_IDS.INVENTORY);
    const mainSheet = invSs.getSheetByName('商品主檔');
    const mgrSs = SpreadsheetApp.openById(SPREADSHEET_IDS.UPLOAD_MGR);
    
    let allowSheet = mgrSs.getSheetByName('全局開放清單');
    if (!allowSheet) {
      allowSheet = mgrSs.insertSheet('全局開放清單');
      allowSheet.appendRow(['被允許開放的商品組合鍵(類別+票品+票號)']);
    }

    const mainData = mainSheet.getDataRange().getValues();
    const allowData = allowSheet.getDataRange().getValues();
    const allowedKeys = allowData.slice(1).map(r => String(r[0]).trim());

    const adminProducts = [];
    mainData.slice(1).forEach(row => {
      if(!row[1] || !row[2]) return;
      const key = `${String(row[1]).trim()}${String(row[2]).trim()}${String(row[3]).trim()}`;
      adminProducts.push({
        key: key,
        barcode: row[4],
        name: row[30] || row[7] || row[3],
        isAllowed: allowedKeys.includes(key)
      });
    });

    return adminProducts;
  } catch(e) {
    throw new Error("載入 A 級設定出錯: " + e.message);
  }
}

// 7. 儲存 A 級管理員的「開放商品勾選結果」
function saveAdminAllowedList(keysArray, adminAccount) {
  try {
    const mgrSs = SpreadsheetApp.openById(SPREADSHEET_IDS.UPLOAD_MGR);
    let allowSheet = mgrSs.getSheetByName('全局開放清單');
    if (!allowSheet) { allowSheet = mgrSs.insertSheet('全局開放清單'); }
    
    allowSheet.clearContents();
    const outData = [['被允許開放的商品組合鍵(類別+票品+票號)']];
    keysArray.forEach(k => outData.push([k]));
    
    if(outData.length > 0) {
       allowSheet.getRange(1, 1, outData.length, 1).setValues(outData);
    }
    
    logAction(adminAccount, 'A權限更新了開放上架清單');
    return "✅ B 級支局的可上架清單已更新！";
  } catch(e) {
    return "儲存失敗：" + e.toString();
  }
}

// 8. 讀取顧客端頁面所需資料 (API 核心)
function getCustomerData() {
  try {
    const invSs = SpreadsheetApp.openById(SPREADSHEET_IDS.INVENTORY);
    const mainSheet = invSs.getSheetByName('商品主檔');
    const invDataSheet = invSs.getSheetByName('庫存資料');
    const mgrSs = SpreadsheetApp.openById(SPREADSHEET_IDS.UPLOAD_MGR);
    const mgrSheet = mgrSs.getSheetByName('分局上架狀態');
    const authSs = SpreadsheetApp.openById(SPREADSHEET_IDS.INFO_AUTH);
    
    let allowSheet = mgrSs.getSheetByName('全局開放清單');
    let allowedKeys = [];
    if (allowSheet) {
      allowedKeys = allowSheet.getDataRange().getValues().slice(1).map(row => String(row[0]).trim());
    }

    let popSheet = mgrSs.getSheetByName('人氣統計');
    let popMap = {};
    if (popSheet) {
      const popData = popSheet.getDataRange().getValues();
      popData.slice(1).forEach(row => { popMap[String(row[0]).trim()] = Number(row[1]) || 0; });
    }

    let logSheet = authSs.getSheetByName('操作日誌');
    let branchBaseScoreMap = {};
    if (logSheet && logSheet.getLastRow() > 1) {
      const logData = logSheet.getDataRange().getValues();
      const today = new Date();
      const dailyCheckMap = {}; 

      logData.slice(1).forEach(row => {
        const logDate = new Date(row[0]);
        const acc = String(row[1]).replace(/^'/, '').trim(); 
        
        if (acc.length === 6 && !isNaN(logDate.getTime())) {
          const dateString = logDate.getFullYear() + '-' + logDate.getMonth() + '-' + logDate.getDate();
          const diffDays = Math.floor((today - logDate) / (1000 * 60 * 60 * 24));

          if (diffDays <= 30) {
            const checkKey = `${acc}_${dateString}`;
            if (!dailyCheckMap[checkKey]) {
              dailyCheckMap[checkKey] = true; 
              let pts = 0;
              if (diffDays <= 3) pts = 3;
              else if (diffDays <= 14) pts = 2;
              else if (diffDays <= 30) pts = 1;
              branchBaseScoreMap[acc] = (branchBaseScoreMap[acc] || 0) + pts;
            }
          }
        }
      });
    }

    const mgrData = mgrSheet.getDataRange().getValues();
    const listedMap = {}; 
    mgrData.slice(1).forEach(row => {
      if (row[6] === 'T') { 
        const branchId = String(row[0]).trim();
        const key = `${String(row[1]).trim()}${String(row[2]).trim()}${String(row[3]).trim()}`;
        const extraQty = row.length > 7 ? (Number(row[7]) || 0) : 0;
        listedMap[`${branchId}_${key}`] = { extraQty: extraQty };
      }
    });

    const invData = invDataSheet.getDataRange().getValues();
    const stockMap = {};
    const branchVarietyMap = {}; 
    const globalInvQtyMap = {}; 

    invData.slice(1).forEach(row => {
      const branchId = String(row[1]).trim();
      const key = `${String(row[2]).trim()}${String(row[3]).trim()}${String(row[4]).trim()}`;
      const mainQty = Number(row[8]) || 0; 

      globalInvQtyMap[key] = (globalInvQtyMap[key] || 0) + mainQty;

      if (allowedKeys.includes(key) && listedMap[`${branchId}_${key}`] && mainQty > 0) {
        const extraQty = listedMap[`${branchId}_${key}`].extraQty || 0;
        const finalDisplayedQty = mainQty + extraQty;

        globalInvQtyMap[key] += extraQty;

        if (!stockMap[key]) stockMap[key] = [];
        stockMap[key].push({ branchId: branchId, qty: finalDisplayedQty });
        branchVarietyMap[branchId] = (branchVarietyMap[branchId] || 0) + 1;
      }
    });

    const mainData = mainSheet.getDataRange().getValues();
    const products = [];
    const prodMap = {}; 
    
    mainData.slice(1).forEach(row => {
      const key = `${String(row[1]).trim()}${String(row[2]).trim()}${String(row[3]).trim()}`;
      if (allowedKeys.includes(key) && !prodMap[key]) {
        prodMap[key] = true;
        let rawDate = 0;
        if (row[8]) rawDate = new Date(row[8]).getTime() || 0;

        products.push({
          key: key,
          barcode: row[4],    
          price: row[5],      
          name: row[30] || row[7] || row[3], 
          desc: row[32] || "目前尚未提供商品詳細說明，款式與規格請依現場實物為主。", 
          img: row[31] || 'https://via.placeholder.com/300x200?text=暫無商品圖片',
          clicks: popMap[key] || 0,
          rawDate: rawDate,
          totalInvQty: globalInvQtyMap[key] || 0 
        });
      }
    });

    products.sort((a, b) => {
      const aStock = (stockMap[a.key] && stockMap[a.key].length > 0) ? 1 : 0;
      const bStock = (stockMap[b.key] && stockMap[b.key].length > 0) ? 1 : 0;
      if (aStock !== bStock) return bStock - aStock; 
      
      if (aStock === 0 && bStock === 0) {
        const aSoldOut = a.totalInvQty === 0 ? 1 : 0;
        const bSoldOut = b.totalInvQty === 0 ? 1 : 0;
        if (aSoldOut !== bSoldOut) return aSoldOut - bSoldOut; 
      }
      
      if (a.clicks !== b.clicks) return b.clicks - a.clicks; 
      
      return b.rawDate - a.rawDate; 
    });

    const branchListSheet = authSs.getSheetByName('支局清單');
    const authSheet = authSs.getSheetByName('帳號權限');
    const branchListData = branchListSheet ? branchListSheet.getDataRange().getValues() : [];
    const branchInfo = {};
    
    const assignBranchInfo = (branchId, name, phone, address) => {
      const baseLoginScore = branchBaseScoreMap[branchId] || 0;
      const varietyScore = (branchVarietyMap[branchId] || 0) * 2;
      branchInfo[branchId] = { 
        name: name, 
        phone: phone, 
        address: address,
        baseActiveScore: baseLoginScore + varietyScore 
      };
    };

    if (branchListData.length > 1) {
      branchListData.slice(1).forEach(row => {
        assignBranchInfo(String(row[0]).trim(), row[1], row[2] || '未提供電話', row[3] || '未提供地址');
      });
    } else {
      const authData = authSheet.getDataRange().getValues();
      authData.slice(1).forEach(row => {
        assignBranchInfo(String(row[0]).trim(), row[1], row[7] || '未提供電話', row[6] || '未提供地址');
      });
    }

    return { status: 'success', products: products, stockMap: stockMap, branchInfo: branchInfo };
  } catch (e) {
    return { status: 'error', message: e.toString() };
  }
}

// 9. 紀錄顧客點擊次數 API
function recordProductClick(productKey) {
  try {
    const mgrSs = SpreadsheetApp.openById(SPREADSHEET_IDS.UPLOAD_MGR);
    let popSheet = mgrSs.getSheetByName('人氣統計');
    if (!popSheet) {
      popSheet = mgrSs.insertSheet('人氣統計');
      popSheet.appendRow(['商品組合鍵', '點擊次數']);
    }
    const data = popSheet.getDataRange().getValues();
    let foundIndex = -1;
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]).trim() === productKey) { foundIndex = i + 1; break; }
    }
    if (foundIndex !== -1) {
      const currentClicks = Number(popSheet.getRange(foundIndex, 2).getValue()) || 0;
      popSheet.getRange(foundIndex, 2).setValue(currentClicks + 1);
    } else {
      popSheet.appendRow([productKey, 1]);
    }
  } catch(e) {
    console.error("人氣紀錄失敗: " + e.message);
  }
}

// 10. A 級專屬：取得支局活躍排行榜
function getLeaderboardData() {
  try {
    const invSs = SpreadsheetApp.openById(SPREADSHEET_IDS.INVENTORY);
    const invDataSheet = invSs.getSheetByName('庫存資料');
    const mgrSs = SpreadsheetApp.openById(SPREADSHEET_IDS.UPLOAD_MGR);
    const mgrSheet = mgrSs.getSheetByName('分局上架狀態');
    const authSs = SpreadsheetApp.openById(SPREADSHEET_IDS.INFO_AUTH);

    const authSheet = authSs.getSheetByName('帳號權限');
    const authData = authSheet.getDataRange().getValues();
    const branches = [];
    authData.slice(1).forEach(row => {
      if (row[5] === 'B') { 
        branches.push({ id: String(row[0]).trim(), name: row[1] });
      }
    });

    const logSheet = authSs.getSheetByName('操作日誌');
    const branchBaseScoreMap = {};
    if (logSheet && logSheet.getLastRow() > 1) {
      const logData = logSheet.getDataRange().getValues();
      const today = new Date();
      const dailyCheckMap = {};
      logData.slice(1).forEach(row => {
        const logDate = new Date(row[0]);
        const acc = String(row[1]).replace(/^'/, '').trim();
        if (acc.length === 6 && !isNaN(logDate.getTime())) {
          const dateString = logDate.getFullYear() + '-' + logDate.getMonth() + '-' + logDate.getDate();
          const diffDays = Math.floor((today - logDate) / (1000 * 60 * 60 * 24));
          if (diffDays <= 30) {
            const checkKey = `${acc}_${dateString}`;
            if (!dailyCheckMap[checkKey]) {
              dailyCheckMap[checkKey] = true;
              let pts = 0;
              if (diffDays <= 3) pts = 3;
              else if (diffDays <= 14) pts = 2;
              else if (diffDays <= 30) pts = 1;
              branchBaseScoreMap[acc] = (branchBaseScoreMap[acc] || 0) + pts;
            }
          }
        }
      });
    }

    let allowSheet = mgrSs.getSheetByName('全局開放清單');
    let allowedKeys = [];
    if (allowSheet) {
      allowedKeys = allowSheet.getDataRange().getValues().slice(1).map(row => String(row[0]).trim());
    }

    const mgrData = mgrSheet.getDataRange().getValues();
    const listedMap = {};
    mgrData.slice(1).forEach(row => {
      if (row[6] === 'T') {
        const branchId = String(row[0]).trim();
        const key = `${String(row[1]).trim()}${String(row[2]).trim()}${String(row[3]).trim()}`;
        listedMap[`${branchId}_${key}`] = true;
      }
    });

    const branchVarietyMap = {};
    const invData = invDataSheet.getDataRange().getValues();
    invData.slice(1).forEach(row => {
      const branchId = String(row[1]).trim();
      const key = `${String(row[2]).trim()}${String(row[3]).trim()}${String(row[4]).trim()}`;
      const qty = Number(row[8]) || 0;
      if (allowedKeys.includes(key) && listedMap[`${branchId}_${key}`] && qty > 0) {
        branchVarietyMap[branchId] = (branchVarietyMap[branchId] || 0) + 1;
      }
    });

    const leaderboard = branches.map(b => {
      const baseScore = branchBaseScoreMap[b.id] || 0;
      const varietyCount = branchVarietyMap[b.id] || 0;
      const varietyScore = varietyCount * 2;
      return {
        branchId: b.id,
        branchName: b.name,
        baseScore: baseScore,
        varietyCount: varietyCount,
        varietyScore: varietyScore,
        totalScore: baseScore + varietyScore
      };
    });

    leaderboard.sort((a, b) => b.totalScore - a.totalScore);
    return { status: 'success', data: leaderboard };

  } catch(e) {
    return { status: 'error', message: e.toString() };
  }
}

// 11. A 級專屬，讀取商品主檔進行編輯
function getEditableMasterData() {
  try {
    const invSs = SpreadsheetApp.openById(SPREADSHEET_IDS.INVENTORY);
    const mainSheet = invSs.getSheetByName('商品主檔');
    const data = mainSheet.getDataRange().getValues();
    const results = [];

    for (let i = 1; i < data.length; i++) {
      let row = data[i];
      if (!row[4]) continue; 
      
      results.push({
        rowIdx: i + 1, 
        barcode: String(row[4]).trim(),
        originalName: String(row[7] || ''), 
        name: String(row[30] || ''), 
        img: String(row[31] || ''),  
        desc: String(row[32] || '')  
      });
    }
    return { status: 'success', data: results };
  } catch (e) {
    return { status: 'error', message: e.toString() };
  }
}

// 12. A 級專屬，儲存商品主檔的修改
function updateMasterDataRecord(rowIdx, name, img, desc, account) {
  try {
    const invSs = SpreadsheetApp.openById(SPREADSHEET_IDS.INVENTORY);
    const mainSheet = invSs.getSheetByName('商品主檔');
    
    mainSheet.getRange(rowIdx, 31).setValue(name);
    mainSheet.getRange(rowIdx, 32).setValue(img);
    mainSheet.getRange(rowIdx, 33).setValue(desc);
    
    logAction(account, `修改商品主檔資訊 (Row:${rowIdx}, 條碼或名稱:${name})`);
    return { status: 'success', message: '儲存成功！' };
  } catch (e) {
    return { status: 'error', message: e.toString() };
  }
}

// 13. A 級專屬：取得各局現場額外庫存總覽
function getAllBranchExtraStock() {
  try {
    const mgrSs = SpreadsheetApp.openById(SPREADSHEET_IDS.UPLOAD_MGR);
    const mgrSheet = mgrSs.getSheetByName('分局上架狀態');
    const authSs = SpreadsheetApp.openById(SPREADSHEET_IDS.INFO_AUTH);
    const authSheet = authSs.getSheetByName('帳號權限');
    const invSs = SpreadsheetApp.openById(SPREADSHEET_IDS.INVENTORY);
    const mainSheet = invSs.getSheetByName('商品主檔');

    const branchMap = {};
    authSheet.getDataRange().getValues().slice(1).forEach(row => {
      branchMap[String(row[0]).trim()] = String(row[1]).trim();
    });

    const productMap = {};
    mainSheet.getDataRange().getValues().slice(1).forEach(row => {
      const key = `${String(row[1]).trim()}${String(row[2]).trim()}${String(row[3]).trim()}`;
      productMap[key] = {
        name: row[30] || row[7] || row[3],
        barcode: row[4]
      };
    });

    const results = [];
    const mgrData = mgrSheet.getDataRange().getValues();
    
    mgrData.slice(1).forEach(row => {
      if (row[6] === 'T') {
        const extraQty = row.length > 7 ? (Number(row[7]) || 0) : 0;
        if (extraQty > 0) {
          const branchId = String(row[0]).trim();
          const key = `${String(row[1]).trim()}${String(row[2]).trim()}${String(row[3]).trim()}`;
          results.push({
            branchId: branchId,
            branchName: branchMap[branchId] || branchId,
            productKey: key,
            productName: productMap[key] ? productMap[key].name : '未知商品',
            barcode: productMap[key] ? productMap[key].barcode : '未知條碼',
            extraQty: extraQty
          });
        }
      }
    });

    results.sort((a, b) => {
      if (a.productName !== b.productName) {
        return a.productName.localeCompare(b.productName);
      }
      return a.branchName.localeCompare(b.branchName);
    });

    return { status: 'success', data: results };
  } catch(e) {
    return { status: 'error', message: e.toString() };
  }
}

// 14. ★ 新增：A 級專屬，處理多檔案合併上傳的「商品主檔」，並自動去重新增
function appendMasterDataFromExcel(dataArray, adminAccount) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_IDS.INVENTORY);
    const mainSheet = ss.getSheetByName('商品主檔');
    const existData = mainSheet.getDataRange().getValues();

    // 1. 建立現有組合鍵清單 (類別+票品+票號) 來去重
    const existKeys = new Set();
    existData.forEach(row => {
      // 確保欄位不是空的再組合
      if (row[1] && row[2]) {
        const key = `${String(row[1]).trim()}${String(row[2]).trim()}${String(row[3] || '').trim()}`;
        existKeys.add(key);
      }
    });

    // 2. 篩選出試算表中「還沒有」的資料
    const newRows = [];
    dataArray.forEach(row => {
      if (row[1] && row[2]) {
        const key = `${String(row[1]).trim()}${String(row[2]).trim()}${String(row[3] || '').trim()}`;
        if (!existKeys.has(key)) {
          newRows.push(row);
          existKeys.add(key); // 把新增的也加進去，防止這次上傳的檔案內部自己有重複
        }
      }
    });

    // 3. 寫入到試算表的最底端
    if (newRows.length > 0) {
      // 為了避免新資料欄數比試算表原本的欄數少而報錯，我們統一補齊欄數
      const currentCols = mainSheet.getLastColumn();
      // 取現有最大欄數或新資料欄數中的最大值
      const targetCols = Math.max(currentCols, newRows[0].length);
      
      const finalRows = newRows.map(row => {
        let r = [...row];
        while (r.length < targetCols) r.push("");
        return r.slice(0, targetCols);
      });

      mainSheet.getRange(mainSheet.getLastRow() + 1, 1, finalRows.length, targetCols).setValues(finalRows);
    }

    logAction(adminAccount, `A權限批次匯入商品主檔：新增了 ${newRows.length} 筆資料`);
    
    return { 
      status: 'success', 
      message: `✅ 匯入完成！\n\n系統共掃描了 ${dataArray.length} 筆資料：\n成功新增：${newRows.length} 筆新商品\n略過重複：${dataArray.length - newRows.length} 筆` 
    };
  } catch (e) {
    return { status: 'error', message: e.toString() };
  }
}
