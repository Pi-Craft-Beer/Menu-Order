const SHEET_ID = "1u0K3glmBMK2YkPcOvVx3vU9iUefEOYxlwn4AxiYFjhE";
const SHEET_NAME = "DATA"; // đổi tên nếu tab khác
const STATUS_OPTIONS = ["Chưa thanh toán", "Đã thanh toán"];
const STATUS_COL = 11; // cột K
const STT_COL = 1; // cột A
const TS_COL = 3; // cột C
const TOTAL_COL = 9; // cột I (Thành tiền)

function getSheet() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow([
      "STT",
      "Số bàn",
      "Timestamp",
      "Phân loại",
      "Món",
      "Số lượng",
      "Đơn vị tính",
      "Giá",
      "Thành tiền",
      "Ghi chú",
      "Trạng thái"
    ]);
  }
  return sheet;
}

function doPost(e) {
  try {
    if (!e || !e.postData) throw new Error("No postData");
    const data = JSON.parse(e.postData.contents);
    writeRows(data);

    return ContentService.createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    Logger.log(err);
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet() {
  return HtmlService.createHtmlOutputFromFile("MenuPortal").setTitle("Pi Craft Beer");
}

// Cho phép gọi trực tiếp từ client bằng google.script.run.processOrder(payload)
function processOrder(data) {
  writeRows(data);
  return { ok: true };
}

function getLastNonEmptyRow(sheet, col) {
  const values = sheet.getRange(1, col, sheet.getMaxRows()).getValues();
  for (let i = values.length - 1; i >= 1; i--) { // bỏ qua header ở dòng 1
    if (values[i][0] !== "" && values[i][0] !== null) return i + 1;
  }
  return 1;
}

function writeRows(data) {
  const sheet = getSheet();
  const baseTimestamp = new Date();
  const lastDataRowByTs = getLastNonEmptyRow(sheet, TS_COL);
  const lastDataRowByStt = getLastNonEmptyRow(sheet, STT_COL);
  const startRow = Math.max(lastDataRowByTs, lastDataRowByStt) + 1;
  const lastStt = lastDataRowByStt > 1 ? Number(sheet.getRange(lastDataRowByStt, STT_COL).getValue()) || 0 : 0;
  const rows = (data.items || []).map((i, idx) => {
    const stt = lastStt + idx + 1; // đánh số liên tục
    return [
      stt,
      data.table || "",
      baseTimestamp,
      i.category || "",
      i.name || "",
      i.qty || "",
      i.unit || "phần",
      i.price || "",
      "", // bỏ tự tính thành tiền, để công thức trên sheet
      data.note || "",
      STATUS_OPTIONS[0]
    ];
  });
  if (rows.length === 0) throw new Error("No items provided");
  sheet.getRange(startRow, 1, rows.length, rows[0].length).setValues(rows);

  // Data validation cho trạng thái
  const statusRange = sheet.getRange(startRow, STATUS_COL, rows.length, 1);
  const validation = SpreadsheetApp.newDataValidation()
    .requireValueInList(STATUS_OPTIONS, true)
    .setAllowInvalid(true)
    .build();
  statusRange.setDataValidation(validation);

  // Conditional formatting: Chưa thanh toán -> màu vàng nhạt
  const existingRules = sheet.getConditionalFormatRules() || [];
  const filtered = existingRules.filter(rule => {
    const cond = rule.getBooleanCondition();
    if (!cond) return true;
    const vals = cond.getCriteriaValues();
    return !(cond.getCriteriaType() === SpreadsheetApp.BooleanCriteria.TEXT_EQ && vals && vals[0] === STATUS_OPTIONS[0]);
  });
  const formatRange = sheet.getRange(2, STATUS_COL, sheet.getMaxRows() - 1, 1); // từ K2 xuống
  const pendingRule = SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo(STATUS_OPTIONS[0])
    .setBackground("#f6d96c")
    .setRanges([formatRange])
    .build();
  filtered.push(pendingRule);
  sheet.setConditionalFormatRules(filtered);

  // Giữ công thức cột I (Thành tiền) nếu có sẵn hàng trên
  const formulaRow = startRow - 1;
  if (formulaRow >= 2) {
    const prevFormulaR1C1 = sheet.getRange(formulaRow, TOTAL_COL).getFormulaR1C1();
    if (prevFormulaR1C1) {
      sheet.getRange(startRow, TOTAL_COL, rows.length, 1).setFormulaR1C1(prevFormulaR1C1);
    }
  }
}
