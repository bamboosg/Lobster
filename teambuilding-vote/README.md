# Bình chọn ngày team building

Trang GitHub Pages để admin tạo lịch gồm 3–4 ngày, chia sẻ link; mỗi người nhập tên, chọn tối đa 2 ngày, xem kết quả và sửa phiếu của mình trên cùng trình duyệt. **Kết quả được lưu vào Google Sheet riêng tư**, thông qua Google Apps Script chạy bằng tài khoản chủ Sheet. GitHub Pages không thể tự lưu phiếu bầu.

## Tạo Google Sheet và Apps Script

1. Tạo một **Google Sheet mới, không chia sẻ công khai**. Chọn **Extensions → Apps Script** để tạo dự án Apps Script gắn với Sheet. Dán toàn bộ nội dung `apps-script/Code.gs` vào file `Code.gs` và lưu.
2. Trong Apps Script, vào **Project Settings → Script properties**, thêm thuộc tính `ADMIN_SECRET` có giá trị là chuỗi ngẫu nhiên dài **ít nhất 24 ký tự**. Đây là mã để tạo lịch; giữ bí mật, **không** ghi vào repository, `config.js` hoặc link chia sẻ. Người có mã này có thể tạo lịch mới.
3. Chọn **Deploy → New deployment → Web app**, chọn **Execute as: Me** và **Who has access: Anyone**. Cấp quyền truy cập Sheet theo yêu cầu và sao chép URL Web app kết thúc bằng `/exec`. Quyền “Anyone” cần thiết để người nhận link có thể vote mà không đăng nhập Google; chỉ script (không phải Sheet) được truy cập công khai.
4. Điền URL này vào `scriptUrl` trong `config.js` (chỉ có URL công khai; không có mã bí mật). Khi sửa Apps Script, cần tạo **New version** trong **Deploy → Manage deployments → Edit** để URL `/exec` dùng phiên bản mới.

Apps Script tự tạo tab `Polls` và `Votes` trong Sheet khi được sử dụng; không sửa tên hoặc cột của các tab này. Để hạn chế spam hoặc chi phí, chỉ chia sẻ link trong nhóm và theo dõi quotas của Google Apps Script. Mã quản trị được gửi qua HTTPS trong form POST tới Apps Script và chỉ kiểm tra với Script Properties trên máy chủ. Nếu lộ mã, thay ngay `ADMIN_SECRET`.

Mỗi trình duyệt có một token ngẫu nhiên được lưu tại localStorage cho từng lịch, cho phép cập nhật phiếu đã gửi. Xóa dữ liệu trình duyệt hoặc dùng thiết bị khác sẽ tạo phiếu khác; **không đảm bảo mỗi người chỉ vote một lần**. Người có link có thể xem tên và lựa chọn của mọi người; đừng dùng cho thông tin nhạy cảm. Kết quả làm mới mỗi 30 giây (hoặc sau khi gửi phiếu).

## Đưa lên GitHub Pages

1. Merge thay đổi vào nhánh `main`, rồi vào **Settings → Pages → Build and deployment**, chọn **GitHub Actions**.
2. Workflow `Deploy team-building vote to GitHub Pages` tự triển khai thư mục này khi cập nhật trên `main` (hoặc chạy thủ công qua **Actions**). Khi deploy thành công, trang nằm tại **https://bamboosg.github.io/Lobster/**.
3. Mở trang, nhập mã quản trị và các ngày để tạo lịch; sao chép link có `?poll=...` để gửi nhóm. Nếu đổi tên repository hoặc dùng domain riêng, link sẽ lấy theo địa chỉ trang hiện tại.

Để chạy thử cục bộ, mở thư mục qua một local HTTP server (không dùng `file://`). Apps Script web app phải được triển khai trước; chỉ thay `config.js` bằng URL deployment của bạn. Lần triển khai đầu tiên cần chủ Sheet cấp quyền cho Apps Script; không thể làm bước này tự động từ repository.
