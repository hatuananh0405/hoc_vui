# Quy trình pull request cho repo hoc_vui

Chủ repo (hatuananh0405) muốn agent **tự merge pull request**, không cần hỏi lại.

Mỗi lần thay đổi code:

1. Tạo nhánh mới từ `main` mới nhất. Không commit thẳng lên `main`.
2. Sửa code, chạy `node build.mjs` để cập nhật `dist/hoc-vui.html`, rồi kiểm tra trên trình duyệt.
3. Commit, push nhánh và mở PR vào `main`.
4. Chờ check **SonarCloud Code Analysis** chạy xong.
   - Nếu check đạt và PR ở trạng thái `mergeable_state: clean`: merge luôn bằng `gh api -X PUT repos/hatuananh0405/hoc_vui/pulls/{n}/merge -f merge_method=merge`.
   - Nếu check lỗi hoặc PR bị xung đột: sửa trên cùng nhánh rồi push lại. Không merge khi check còn lỗi.
5. Chờ workflow "pages build and deployment" chạy xong, rồi báo cho người dùng link PR và link trang https://hatuananh0405.github.io/hoc_vui/.
