import { scriptUrl } from "./config.js";

const $ = (selector) => document.querySelector(selector);
const pollId = new URLSearchParams(location.search).get("poll");
const setupFeedback = $("#setup-feedback");
const voteFeedback = $("#vote-feedback");

function showError(message) {
  $("#setup-panel").hidden = true;
  $("#vote-panel").hidden = true;
  $("#error-message").textContent = message;
  $("#error-panel").hidden = false;
}

function feedback(element, message, isError = false) {
  element.textContent = message;
  element.classList.toggle("error", isError);
}

function dateLabel(iso) {
  const [year, month, day] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("vi-VN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(year, month - 1, day));
}

function errorText(error) {
  switch (error?.message) {
    case "UNAUTHORIZED":
      return "Mã quản trị không đúng.";
    case "NOT_FOUND":
      return "Không tìm thấy lịch bình chọn này. Hãy kiểm tra lại link.";
    case "INVALID_REQUEST":
      return "Dữ liệu không hợp lệ. Hãy kiểm tra tên và ngày đã chọn.";
    default:
      return "Không kết nối được Google Sheet. Kiểm tra cấu hình Apps Script, quyền truy cập và thử lại.";
  }
}

// HTMLService replies to a hidden form in an iframe because Apps Script does not provide
// cross-origin fetch responses to GitHub Pages. Check the Google origin and per-request nonce.
function request(fields, method = "POST") {
  return new Promise((resolve, reject) => {
    const frame = document.createElement("iframe");
    const form = document.createElement("form");
    const requestId = crypto.randomUUID();
    frame.name = `sheet-request-${requestId}`;
    frame.hidden = true;
    form.hidden = true;
    form.method = method;
    form.action = scriptUrl;
    form.target = frame.name;
    const params = { ...fields, requestId, origin: location.origin };
    for (const [name, value] of Object.entries(params)) {
      const input = document.createElement("input");
      input.type = "hidden";
      input.name = name;
      input.value = value;
      form.append(input);
    }
    function finish() {
      clearTimeout(timeout);
      window.removeEventListener("message", receive);
      form.remove();
      frame.remove();
    }
    function receive(event) {
      if (!/^https:\/\/(?:script\.google\.com|[a-z0-9-]+\.googleusercontent\.com)$/.test(event.origin) ||
          event.data?.requestId !== requestId) {
        return;
      }
      finish();
      if (event.data.ok) {
        resolve(event.data);
      } else {
        reject(new Error(event.data.error || "SERVER_ERROR"));
      }
    }
    const timeout = setTimeout(() => {
      finish();
      reject(new Error("TIMEOUT"));
    }, 30000);
    window.addEventListener("message", receive);
    document.body.append(frame, form);
    form.submit();
  });
}

function tokenForPoll(id) {
  const key = `team-vote:${id}`;
  try {
    let token = localStorage.getItem(key);
    if (!token) {
      token = crypto.randomUUID();
      localStorage.setItem(key, token);
    }
    return token;
  } catch {
    feedback(voteFeedback, "Trình duyệt không lưu dữ liệu: bạn sẽ không thể sửa phiếu sau khi tải lại trang.", true);
    return crypto.randomUUID();
  }
}

if (!/^https:\/\/script\.google\.com\/macros\/s\/[^/?#]+\/exec$/.test(scriptUrl)) {
  showError("Trang chưa được cấu hình Google Apps Script. Người quản trị vui lòng xem teambuilding-vote/README.md.");
} else if (pollId) {
  openPoll();
} else {
  openSetup();
}

function openSetup() {
  $("#setup-panel").hidden = false;
  $("#create-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = event.currentTarget.querySelector("button[type=submit]");
    const dates = [...document.querySelectorAll(".date-fields input")].map((input) => input.value).filter(Boolean);
    if (dates.length < 3 || dates.length > 4 || new Set(dates).size !== dates.length) {
      feedback(setupFeedback, "Vui lòng chọn 3 hoặc 4 ngày khác nhau.", true);
      return;
    }
    button.disabled = true;
    feedback(setupFeedback, "");
    try {
      const result = await request({
        action: "create",
        secret: $("#admin-secret").value,
        title: $("#poll-title").value.trim(),
        dates: JSON.stringify(dates.sort()),
      });
      $("#admin-secret").value = "";
      location.href = `?poll=${encodeURIComponent(result.pollId)}`;
    } catch (error) {
      feedback(setupFeedback, errorText(error), true);
    } finally {
      button.disabled = false;
    }
  });
}

async function openPoll() {
  if (!/^[a-f0-9]{32}$/.test(pollId)) {
    showError("Link bình chọn không hợp lệ.");
    return;
  }
  const token = tokenForPoll(pollId);
  let poll;
  let editing = false;
  let saving = false;
  async function refresh() {
    const result = await request({ action: "poll", pollId, token }, "GET");
    if (!poll) {
      poll = result.poll;
      if (!Array.isArray(poll.dates) || poll.dates.length < 3 || poll.dates.length > 4) {
        throw new Error("INVALID_REQUEST");
      }
      $("#vote-panel").hidden = false;
      $("#vote-title").textContent = poll.title;
      document.title = `${poll.title} · Cùng đi nhé`;
      renderOptions(poll.dates);
    }
    renderResults(poll.dates, result.votes);
    if (!editing && result.own) {
      $("#voter-name").value = result.own.name;
      for (const input of document.querySelectorAll("#date-options input")) {
        input.checked = result.own.dates.includes(input.value);
        input.dispatchEvent(new Event("change"));
      }
      $("#vote-submit").firstChild.textContent = "Cập nhật lựa chọn ";
    }
  }
  try {
    await refresh();
  } catch (error) {
    showError(errorText(error));
    return;
  }
  $("#vote-form").addEventListener("input", () => { editing = true; });
  $("#vote-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const name = $("#voter-name").value.trim();
    const dates = [...document.querySelectorAll("#date-options input:checked")].map((input) => input.value);
    if (!name || name.length > 60 || dates.length < 1 || dates.length > 2) {
      feedback(voteFeedback, "Nhập tên và chọn 1 hoặc 2 ngày phù hợp nhé.", true);
      return;
    }
    const button = $("#vote-submit");
    button.disabled = true;
    saving = true;
    feedback(voteFeedback, "");
    try {
      await request({ action: "vote", pollId, token, name, dates: JSON.stringify(dates) });
      feedback(voteFeedback, "Đã lưu lựa chọn của bạn! Bạn có thể chỉnh sửa và gửi lại nếu cần.");
      await refresh();
    } catch (error) {
      feedback(voteFeedback, errorText(error), true);
    } finally {
      saving = false;
      button.disabled = false;
    }
  });
  setInterval(() => {
    if (!document.hidden && !saving) {
      refresh().catch(() => feedback(voteFeedback, "Không cập nhật được kết quả. Hãy thử tải lại trang.", true));
    }
  }, 30000);
  $("#copy-link").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(location.href);
      $("#copy-link").textContent = "Đã sao chép ✓";
    } catch {
      feedback(voteFeedback, "Không thể sao chép tự động. Hãy sao chép link trên thanh địa chỉ.", true);
    }
  });
}

function renderOptions(dates) {
  const inputs = [];
  for (const iso of dates) {
    const label = document.createElement("label");
    label.className = "date-option";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = iso;
    const text = document.createElement("span");
    text.textContent = dateLabel(iso);
    label.append(checkbox, text);
    $("#date-options").append(label);
    inputs.push(checkbox);
    checkbox.addEventListener("change", () => {
      const count = inputs.filter((input) => input.checked).length;
      inputs.forEach((input) => {
        input.disabled = !input.checked && count >= 2;
        input.parentElement.classList.toggle("selected", input.checked);
      });
      $("#selection-count").textContent = `${count} / 2 đã chọn`;
    });
  }
}

function renderResults(dates, votes) {
  $("#total-voters").textContent = `${votes.length} người tham gia`;
  const list = $("#result-list");
  list.replaceChildren();
  for (const iso of dates) {
    const matched = votes.filter((vote) => Array.isArray(vote.dates) && vote.dates.includes(iso));
    const row = document.createElement("div");
    row.className = "result-row";
    const top = document.createElement("div");
    top.className = "result-top";
    const label = document.createElement("strong");
    label.textContent = dateLabel(iso);
    const count = document.createElement("span");
    count.textContent = `${matched.length} phiếu`;
    top.append(label, count);
    const track = document.createElement("div");
    track.className = "result-track";
    const fill = document.createElement("div");
    fill.className = "result-fill";
    fill.style.width = `${votes.length ? (matched.length / votes.length) * 100 : 0}%`;
    track.append(fill);
    const names = document.createElement("small");
    names.textContent = matched.map((vote) => vote.name).join(", ") || "Chưa có ai chọn";
    row.append(top, track, names);
    list.append(row);
  }
}
