import { firebaseConfig } from "./config.js";

if (
  !firebaseConfig.apiKey ||
  firebaseConfig.apiKey.startsWith("REPLACE_") ||
  !firebaseConfig.projectId ||
  firebaseConfig.projectId.startsWith("REPLACE_")
) {
  document.querySelector("#error-message").textContent =
    "Trang chưa được cấu hình Firebase. Người quản trị vui lòng xem hướng dẫn trong teambuilding-vote/README.md.";
  document.querySelector("#error-panel").hidden = false;
} else {
  import("./poll.js").catch(() => {
    document.querySelector("#setup-panel").hidden = true;
    document.querySelector("#vote-panel").hidden = true;
    document.querySelector("#error-message").textContent =
      "Không tải được ứng dụng. Kiểm tra kết nối mạng và thử tải lại trang.";
    document.querySelector("#error-panel").hidden = false;
  });
}
