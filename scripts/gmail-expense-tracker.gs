/**
 * Gmail Expense Tracker – Google Apps Script
 *
 * Chức năng:
 *  1. Quét Gmail tìm mail chưa đọc theo filter.
 *  2. Luôn ghi subject + ngày nhận vào sheet TRƯỚC KHI gọi Gemini
 *     → có thể xử lý thủ công nếu Gemini lỗi.
 *  3. Gọi Gemini để parse chi tiết (số tiền, loại giao dịch, merchant…).
 *  4. Đánh trạng thái OK / LỖI – CẦN XỬ LÝ THỦ CÔNG.
 *
 * Cài đặt:
 *  - Mở Google Sheets → Extensions → Apps Script → dán toàn bộ file này.
 *  - Điền GEMINI_API_KEY bên dưới.
 *  - Chạy setupTrigger() một lần để đặt lịch tự động.
 *
 * Cột sheet "Transactions":
 *  A: Ngày nhận  B: Tiêu đề mail  C: Nội dung gốc  D: Trạng thái
 *  E: Số tiền    F: Loại GD       G: Merchant       H: Ghi chú
 */

// ─── CẤU HÌNH ────────────────────────────────────────────────────────────────
var GEMINI_API_KEY = "YOUR_GEMINI_API_KEY"; // ← điền API key ở đây
var GMAIL_QUERY    = "is:unread subject:(thanh toán OR giao dịch OR invoice OR payment OR receipt)";
var SHEET_NAME     = "Transactions";
var MAX_EMAILS     = 20; // số mail xử lý mỗi lần chạy
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Hàm chính – quét mail và ghi vào sheet.
 * Luôn ghi subject + date dù Gemini có lỗi hay không.
 */
function processEmails() {
  var sheet = getOrCreateSheet(SHEET_NAME);
  var threads = GmailApp.search(GMAIL_QUERY, 0, MAX_EMAILS);

  if (threads.length === 0) {
    Logger.log("Không có mail mới.");
    return;
  }

  threads.forEach(function (thread) {
    var msg     = thread.getMessages()[0];
    var subject = msg.getSubject();
    var date    = msg.getDate();
    var body    = msg.getPlainBody().substring(0, 3000); // giới hạn 3000 ký tự
    var msgId   = msg.getId();

    // Kiểm tra đã xử lý chưa (tránh trùng)
    if (isAlreadyProcessed(sheet, msgId)) {
      thread.markRead();
      return;
    }

    // ── BƯỚC 1: Ghi raw ngay lập tức ────────────────────────────────────────
    var row = sheet.getLastRow() + 1;
    sheet.getRange(row, 1).setValue(date);        // A: Ngày nhận
    sheet.getRange(row, 2).setValue(subject);     // B: Tiêu đề
    sheet.getRange(row, 3).setValue(body);        // C: Nội dung gốc
    sheet.getRange(row, 4).setValue("PENDING");   // D: Trạng thái
    sheet.getRange(row, 9).setValue(msgId);       // I: Message ID (ẩn)
    SpreadsheetApp.flush();                       // lưu ngay để không mất dữ liệu
    // ────────────────────────────────────────────────────────────────────────

    // ── BƯỚC 2: Gọi Gemini parse chi tiết ────────────────────────────────────
    var parsed = null;
    try {
      parsed = askGemini(subject, body);
    } catch (e) {
      Logger.log("Gemini lỗi với mail '" + subject + "': " + e.message);
    }

    // ── BƯỚC 3: Ghi kết quả hoặc đánh dấu lỗi ────────────────────────────────
    if (parsed) {
      sheet.getRange(row, 4).setValue("OK");
      sheet.getRange(row, 5).setValue(parsed.amount   || "");  // E: Số tiền
      sheet.getRange(row, 6).setValue(parsed.type     || "");  // F: Loại GD
      sheet.getRange(row, 7).setValue(parsed.merchant || "");  // G: Merchant
      sheet.getRange(row, 8).setValue(parsed.note     || "");  // H: Ghi chú
    } else {
      sheet.getRange(row, 4).setValue("LỖI – CẦN XỬ LÝ THỦ CÔNG");
    }

    thread.markRead();
    SpreadsheetApp.flush();
  });

  Logger.log("Xử lý xong " + threads.length + " thread(s).");
}

/**
 * Gọi Gemini API để parse thông tin từ mail.
 * Trả về object { amount, type, merchant, note } hoặc null nếu lỗi.
 */
function askGemini(subject, body) {
  var prompt = [
    "Phân tích email thông báo giao dịch tài chính dưới đây và trả về JSON với các trường:",
    "  amount   : số tiền (chỉ số, VD: 150000)",
    "  type     : loại giao dịch (chuyển khoản / thanh toán / nạp tiền / khác)",
    "  merchant : tên cửa hàng / người nhận / người gửi",
    "  note     : mô tả ngắn",
    "",
    "Nếu không tìm thấy thông tin, để trường đó là null.",
    "Chỉ trả về JSON thuần, không giải thích thêm.",
    "",
    "Tiêu đề mail: " + subject,
    "Nội dung mail:\n" + body
  ].join("\n");

  var url     = "https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=" + GEMINI_API_KEY;
  var payload = JSON.stringify({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0, maxOutputTokens: 512 }
  });

  var response = UrlFetchApp.fetch(url, {
    method      : "post",
    contentType : "application/json",
    payload     : payload,
    muteHttpExceptions: true
  });

  var code = response.getResponseCode();
  if (code !== 200) {
    throw new Error("HTTP " + code + ": " + response.getContentText().substring(0, 200));
  }

  var json  = JSON.parse(response.getContentText());
  var text  = json.candidates[0].content.parts[0].text.trim();

  // Loại bỏ markdown code block nếu có
  text = text.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/, "").trim();

  return JSON.parse(text);
}

// ─── TIỆN ÍCH ─────────────────────────────────────────────────────────────────

/**
 * Lấy sheet có sẵn hoặc tạo mới với header.
 */
function getOrCreateSheet(name) {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    var headers = ["Ngày nhận", "Tiêu đề mail", "Nội dung gốc", "Trạng thái",
                   "Số tiền", "Loại GD", "Merchant", "Ghi chú", "Message ID"];
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold");
    // Ẩn cột I (Message ID)
    sheet.hideColumns(9);
  }
  return sheet;
}

/**
 * Kiểm tra message ID đã có trong sheet chưa để tránh xử lý trùng.
 */
function isAlreadyProcessed(sheet, msgId) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return false;
  var ids = sheet.getRange(2, 9, lastRow - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (ids[i][0] === msgId) return true;
  }
  return false;
}

/**
 * Điền thủ công kết quả cho một dòng đang ở trạng thái LỖI / PENDING.
 * Gọi từ menu hoặc chạy trực tiếp sau khi chọn dòng cần xử lý.
 *
 * @param {number} row  - Số dòng (1-indexed, ≥ 2)
 * @param {number} amount
 * @param {string} type
 * @param {string} merchant
 * @param {string} note
 */
function manualFillRow(row, amount, type, merchant, note) {
  var sheet = getOrCreateSheet(SHEET_NAME);
  if (!row || row < 2) {
    SpreadsheetApp.getUi().alert("Vui lòng truyền số dòng hợp lệ (≥ 2).");
    return;
  }
  sheet.getRange(row, 4).setValue("OK (THỦ CÔNG)");
  sheet.getRange(row, 5).setValue(amount   || "");
  sheet.getRange(row, 6).setValue(type     || "");
  sheet.getRange(row, 7).setValue(merchant || "");
  sheet.getRange(row, 8).setValue(note     || "");
  SpreadsheetApp.flush();
  Logger.log("Đã cập nhật thủ công dòng " + row);
}

/**
 * Thử lại Gemini cho các dòng đang LỖI / PENDING.
 * Gọi khi Gemini đã hoạt động trở lại.
 */
function retryFailedRows() {
  var sheet   = getOrCreateSheet(SHEET_NAME);
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return;

  var data    = sheet.getRange(2, 1, lastRow - 1, 9).getValues();
  var retried = 0;

  data.forEach(function (row, idx) {
    var status  = row[3]; // cột D
    var subject = row[1]; // cột B
    var body    = row[2]; // cột C
    var sheetRow = idx + 2;

    if (status === "PENDING" || status === "LỖI – CẦN XỬ LÝ THỦ CÔNG") {
      var parsed = null;
      try {
        parsed = askGemini(subject, body);
      } catch (e) {
        Logger.log("Retry lỗi dòng " + sheetRow + ": " + e.message);
      }

      if (parsed) {
        sheet.getRange(sheetRow, 4).setValue("OK (RETRY)");
        sheet.getRange(sheetRow, 5).setValue(parsed.amount   || "");
        sheet.getRange(sheetRow, 6).setValue(parsed.type     || "");
        sheet.getRange(sheetRow, 7).setValue(parsed.merchant || "");
        sheet.getRange(sheetRow, 8).setValue(parsed.note     || "");
        retried++;
      }
    }
  });

  SpreadsheetApp.flush();
  Logger.log("Retry xong, đã xử lý " + retried + " dòng.");
}

/**
 * Cài đặt trigger tự động chạy processEmails() mỗi 15 phút.
 * Chạy hàm này một lần duy nhất.
 */
function setupTrigger() {
  // Xoá trigger cũ tránh trùng
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === "processEmails") {
      ScriptApp.deleteTrigger(t);
    }
  });

  ScriptApp.newTrigger("processEmails")
    .timeBased()
    .everyMinutes(15)
    .create();

  Logger.log("Trigger đã được cài đặt: chạy mỗi 15 phút.");
}

/**
 * Thêm menu tuỳ chỉnh vào Google Sheets.
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("📧 Email Tracker")
    .addItem("▶ Chạy ngay",            "processEmails")
    .addItem("🔄 Retry lỗi / pending", "retryFailedRows")
    .addItem("⏱ Cài trigger tự động",  "setupTrigger")
    .addToUi();
}
