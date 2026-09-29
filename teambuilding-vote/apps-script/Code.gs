// Bind this script to a private Google Sheet and deploy it as a Web app.
const POLLS_SHEET = "Polls";
const VOTES_SHEET = "Votes";
const ID_PATTERN = /^[a-f0-9]{32}$/;
const TOKEN_PATTERN = /^[a-f0-9-]{36}$/;

function doGet(e) {
  return respond(e, () => {
    if (e.parameter.action !== "poll" || !ID_PATTERN.test(e.parameter.pollId || "")) {
      throw new Error("INVALID_REQUEST");
    }
    const polls = sheet(POLLS_SHEET, ["id", "title", "dates", "createdAt"]).getDataRange().getValues();
    const poll = polls.slice(1).find((row) => row[0] === e.parameter.pollId);
    if (!poll) {
      throw new Error("NOT_FOUND");
    }
    const votes = sheet(VOTES_SHEET, ["pollId", "token", "name", "dates"]).getDataRange().getValues()
      .slice(1).filter((row) => row[0] === poll[0]);
    const token = e.parameter.token || "";
    const own = votes.find((row) => row[1] === token);
    return {
      poll: { title: poll[1], dates: JSON.parse(poll[2]) },
      votes: votes.map((row) => ({ name: row[2], dates: JSON.parse(row[3]) })),
      own: own ? { name: own[2], dates: JSON.parse(own[3]) } : null,
    };
  });
}

function doPost(e) {
  return respond(e, () => {
    const data = e.parameter;
    if (data.action === "create") {
      const secret = PropertiesService.getScriptProperties().getProperty("ADMIN_SECRET");
      if (!secret || secret.length < 24 || data.secret !== secret) {
        throw new Error("UNAUTHORIZED");
      }
      const title = (data.title || "").trim();
      const dates = parseDates(data.dates, 3, 4);
      if (!title || title.length > 80) {
        throw new Error("INVALID_REQUEST");
      }
      const lock = LockService.getScriptLock();
      lock.waitLock(10000);
      try {
        const id = Utilities.getUuid().replace(/-/g, "");
        sheet(POLLS_SHEET, ["id", "title", "dates", "createdAt"])
          .appendRow([id, safeCell(title), JSON.stringify(dates), new Date()]);
        return { pollId: id };
      } finally {
        lock.releaseLock();
      }
    }
    if (data.action === "vote") {
      if (!ID_PATTERN.test(data.pollId || "") || !TOKEN_PATTERN.test(data.token || "")) {
        throw new Error("INVALID_REQUEST");
      }
      const name = (data.name || "").trim();
      const dates = parseDates(data.dates, 1, 2);
      if (!name || name.length > 60) {
        throw new Error("INVALID_REQUEST");
      }
      const lock = LockService.getScriptLock();
      lock.waitLock(10000);
      try {
        const poll = sheet(POLLS_SHEET, ["id", "title", "dates", "createdAt"]).getDataRange()
          .getValues().slice(1).find((row) => row[0] === data.pollId);
        if (!poll) {
          throw new Error("NOT_FOUND");
        }
        const candidates = JSON.parse(poll[2]);
        if (!dates.every((date) => candidates.includes(date))) {
          throw new Error("INVALID_REQUEST");
        }
        const votesSheet = sheet(VOTES_SHEET, ["pollId", "token", "name", "dates"]);
        const rows = votesSheet.getDataRange().getValues();
        const index = rows.findIndex((row, i) => i > 0 && row[0] === data.pollId && row[1] === data.token);
        if (index < 0) {
          votesSheet.appendRow([data.pollId, data.token, safeCell(name), JSON.stringify(dates)]);
        } else {
          votesSheet.getRange(index + 1, 3, 1, 2).setValues([[safeCell(name), JSON.stringify(dates)]]);
        }
        return { saved: true };
      } finally {
        lock.releaseLock();
      }
    }
    throw new Error("INVALID_REQUEST");
  });
}

function parseDates(value, min, max) {
  let dates;
  try {
    dates = JSON.parse(value);
  } catch (_) {
    throw new Error("INVALID_REQUEST");
  }
  if (!Array.isArray(dates) || dates.length < min || dates.length > max ||
      new Set(dates).size !== dates.length ||
      !dates.every((date) => typeof date === "string" &&
        /^\d{4}-\d{2}-\d{2}$/.test(date) &&
        !isNaN(new Date(date + "T00:00:00Z").getTime()) &&
        new Date(date + "T00:00:00Z").toISOString().slice(0, 10) === date)) {
    throw new Error("INVALID_REQUEST");
  }
  return dates;
}

function safeCell(value) {
  return /^[\s]*[=+\-@]/.test(value) ? "'" + value : value;
}

function sheet(name, headers) {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  let result = spreadsheet.getSheetByName(name);
  if (!result) {
    result = spreadsheet.insertSheet(name);
    result.appendRow(headers);
  }
  return result;
}

function respond(e, handler) {
  let result;
  try {
    result = { ok: true, ...handler() };
  } catch (error) {
    const allowed = ["INVALID_REQUEST", "NOT_FOUND", "UNAUTHORIZED"];
    result = { ok: false, error: allowed.includes(error.message) ? error.message : "SERVER_ERROR" };
  }
  // HTMLService can be nested inside Google's own iframe; send to the top-level voting page.
  const payload = JSON.stringify({ requestId: e.parameter.requestId, ...result })
    .replace(/</g, "\\u003c").replace(/\u2028|\u2029/g, " ");
  const origin = String(e.parameter.origin || "");
  const target = /^https:\/\/[a-z0-9.-]+(?::\d+)?$|^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/.test(origin)
    ? origin : "https://invalid.example";
  return HtmlService.createHtmlOutput(
    "<!doctype html><script>top.postMessage(" + payload + "," + JSON.stringify(target) + ")</script>"
  ).setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
