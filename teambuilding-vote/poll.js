import { initializeApp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signInAnonymously,
  signInWithEmailAndPassword,
  signOut,
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getFirestore,
  onSnapshot,
  serverTimestamp,
  setDoc,
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";
import { firebaseConfig } from "./config.js";

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
  switch (error?.code) {
    case "auth/invalid-credential":
    case "auth/wrong-password":
      return "Email hoặc mật khẩu không đúng.";
    case "permission-denied":
      return "Bạn không có quyền thực hiện thao tác này. Kiểm tra tài khoản admin và Firestore Rules.";
    case "unavailable":
      return "Không kết nối được máy chủ. Hãy thử lại sau.";
    default:
      return "Có lỗi xảy ra. Vui lòng thử lại hoặc kiểm tra cấu hình Firebase.";
  }
}

{
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);

  if (pollId) {
    openPoll();
  } else {
    openSetup();
  }

  function openSetup() {
    $("#setup-panel").hidden = false;
    onAuthStateChanged(auth, (user) => {
      const isAdmin = user && !user.isAnonymous;
      $("#login-area").hidden = Boolean(isAdmin);
      $("#create-area").hidden = !isAdmin;
      $("#admin-email").textContent = isAdmin ? user.email : "";
    });
    $("#login-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const button = event.currentTarget.querySelector("button[type=submit]");
      button.disabled = true;
      feedback(setupFeedback, "");
      try {
        await signInWithEmailAndPassword(auth, $("#email").value.trim(), $("#password").value);
        $("#password").value = "";
      } catch (error) {
        feedback(setupFeedback, errorText(error), true);
      } finally {
        button.disabled = false;
      }
    });
    $("#logout-button").addEventListener("click", () => signOut(auth));
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
        const poll = await addDoc(collection(db, "polls"), {
          ownerUid: auth.currentUser.uid,
          title: $("#poll-title").value.trim(),
          dates: dates.sort(),
          createdAt: serverTimestamp(),
        });
        location.href = `?poll=${encodeURIComponent(poll.id)}`;
      } catch (error) {
        feedback(setupFeedback, errorText(error), true);
        button.disabled = false;
      }
    });
  }

  async function openPoll() {
    if (!/^[a-zA-Z0-9]{20}$/.test(pollId)) {
      showError("Link bình chọn không hợp lệ.");
      return;
    }
    try {
      await auth.authStateReady();
      const user = auth.currentUser || (await signInAnonymously(auth)).user;
      const pollRef = doc(db, "polls", pollId);
      const snapshot = await getDoc(pollRef);
      if (!snapshot.exists()) {
        showError("Không tìm thấy lịch bình chọn này. Hãy kiểm tra lại link.");
        return;
      }
      const poll = snapshot.data();
      if (!Array.isArray(poll.dates) || poll.dates.length < 3 || poll.dates.length > 4) {
        showError("Dữ liệu bình chọn không hợp lệ.");
        return;
      }
      $("#vote-panel").hidden = false;
      $("#vote-title").textContent = poll.title;
      document.title = `${poll.title} · Cùng đi nhé`;
      const votesRef = collection(pollRef, "votes");
      const selected = new Set();
      const inputs = [];
      for (const iso of poll.dates) {
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
          if (checkbox.checked) {
            selected.add(iso);
          } else {
            selected.delete(iso);
          }
          inputs.forEach((input) => {
            input.disabled = !input.checked && selected.size >= 2;
            input.parentElement.classList.toggle("selected", input.checked);
          });
          $("#selection-count").textContent = `${selected.size} / 2 đã chọn`;
        });
      }
      onSnapshot(votesRef, (votes) => {
        const rows = votes.docs.map((vote) => ({ id: vote.id, ...vote.data() }));
        renderResults(poll.dates, rows);
        const own = rows.find((vote) => vote.id === user.uid);
        if (own && !$("#voter-name").value) {
          $("#voter-name").value = own.name;
          inputs.forEach((input) => {
            input.checked = own.dates.includes(input.value);
            input.dispatchEvent(new Event("change"));
          });
          $("#vote-submit").firstChild.textContent = "Cập nhật lựa chọn ";
        }
      }, () => feedback(voteFeedback, "Không tải được kết quả. Hãy thử tải lại trang.", true));

      $("#vote-form").addEventListener("submit", async (event) => {
        event.preventDefault();
        const name = $("#voter-name").value.trim();
        if (!name || name.length > 60 || selected.size < 1 || selected.size > 2) {
          feedback(voteFeedback, "Nhập tên và chọn 1 hoặc 2 ngày phù hợp nhé.", true);
          return;
        }
        const button = $("#vote-submit");
        button.disabled = true;
        feedback(voteFeedback, "");
        try {
          await setDoc(doc(votesRef, user.uid), { name, dates: [...selected].sort() });
          feedback(voteFeedback, "Đã lưu lựa chọn của bạn! Bạn có thể chỉnh sửa và gửi lại nếu cần.");
        } catch (error) {
          feedback(voteFeedback, errorText(error), true);
        } finally {
          button.disabled = false;
        }
      });
      $("#copy-link").addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(location.href);
          $("#copy-link").textContent = "Đã sao chép ✓";
        } catch {
          feedback(voteFeedback, "Không thể sao chép tự động. Hãy sao chép link trên thanh địa chỉ.", true);
        }
      });
    } catch (error) {
      showError(errorText(error));
    }
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
