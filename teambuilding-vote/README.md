# Bình chọn ngày team building

Trang tĩnh tiếng Việt: admin tạo lịch gồm 3–4 ngày và chia sẻ link; mỗi người nhập tên, chọn 1–2 ngày, xem kết quả cập nhật trực tiếp và có thể sửa phiếu trên cùng trình duyệt.

GitHub Pages chỉ phục vụ file tĩnh, **không lưu được phiếu bầu**. Ứng dụng sử dụng Firebase Authentication và Cloud Firestore để đồng bộ dữ liệu giữa các thiết bị. Chưa thể đưa trang vào hoạt động nếu chưa có dự án Firebase và chưa bật Pages trên repository.

## Thiết lập Firebase

1. Tạo dự án trên [Firebase Console](https://console.firebase.google.com/), thêm **Web app**, tạo **Cloud Firestore**. Trong **Authentication → Sign-in method**, bật **Anonymous** và **Email/Password**.
2. Tạo tài khoản admin tại **Authentication → Users → Add user**. Sao chép **User UID** của tài khoản này. Không chia sẻ mật khẩu admin. Nếu tài khoản Email/Password khác tự đăng ký, Firestore Rules bên dưới vẫn không cho phép họ tạo bình chọn.
3. Sao chép nội dung `firestore.rules` vào **Firestore Database → Rules**; thay `REPLACE_WITH_ADMIN_UID` bằng UID ở bước 2 rồi **Publish**. Không dùng rules mặc định cho production.
4. Điền cấu hình Web app vào `config.js`: `apiKey`, `authDomain`, `projectId`, `appId`. Các giá trị cấu hình Firebase Web app **không phải khóa bí mật**; quyền truy cập do Firestore Rules quyết định. Không điền mật khẩu hoặc khóa service account vào mã nguồn.
5. Trong **Authentication → Settings → Authorized domains**, thêm `bamboosg.github.io` (và hostname tùy chỉnh nếu có). Bật giới hạn hoặc giám sát chi phí Firebase nếu triển khai công khai.

Admin đăng nhập trên trang chủ để tạo bình chọn. Link hiển thị trên thanh địa chỉ sau khi tạo; dùng nút **Sao chép link** để gửi đồng đội. Một Firebase Anonymous UID được lưu theo trình duyệt; mỗi UID có thể lưu/cập nhật một phiếu. Việc xóa dữ liệu trình duyệt hoặc dùng trình duyệt khác sẽ tạo UID mới: đây **không phải** biện pháp chống bỏ phiếu nhiều lần. Người có link có thể xem tên và ngày được chọn của mọi người trong cuộc bình chọn; chỉ chia sẻ link trong nhóm tin cậy.

## Đưa lên GitHub Pages

1. Merge thay đổi vào nhánh `main`, rồi vào **Settings → Pages → Build and deployment**, chọn **GitHub Actions**.
2. Workflow `Deploy team-building vote to GitHub Pages` tự triển khai thư mục này khi cập nhật trên `main` (hoặc chạy thủ công qua **Actions**). Sau khi deploy thành công, trang nằm tại **https://bamboosg.github.io/Lobster/**.
3. Mở URL này để admin tạo poll; link `?poll=...` hoạt động trên cùng trang Pages. Nếu đổi tên repository hoặc dùng domain riêng, link được tạo tự động theo địa chỉ trang hiện tại.

Để chạy thử cục bộ, mở thư mục này qua một local HTTP server; Firebase Authentication cần một domain được cho phép (ví dụ `localhost`). Không mở trực tiếp file bằng `file://`.
