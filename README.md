# HọcVui: vừa chơi vừa học

Web app học tập bằng trò chơi trắc nghiệm, dùng được cho mọi môn học. Người dùng tải bộ đề của mình lên rồi chơi.
App chạy hoàn toàn trên trình duyệt, không cần server hay tài khoản. Dữ liệu lưu trong localStorage.

## Cách chạy

- **Cách nhanh nhất**: mở file `dist/hoc-vui.html` bằng trình duyệt (double-click). Toàn bộ app nằm trong một file này.
- **Khi đang sửa code**: chạy server tĩnh trong thư mục này (`python3 -m http.server`), rồi mở `http://localhost:8000`.
- Sửa code xong, chạy `node build.mjs` để tạo lại `dist/hoc-vui.html`.

## Phòng học (màn mở đầu)

Mở app sẽ thấy một phòng học nhỏ có hoạt ảnh: chữ phấn tự viết lên bảng, mây trôi ngoài cửa sổ, đồng hồ chạy, bạn nhỏ chớp mắt.
Bấm vào bàn học (hoặc bạn nhỏ, cái ghế, hoặc nhấn Enter): bạn nhỏ đi tới ngồi xuống, bật đèn bàn, camera phóng vào bàn rồi menu hiện ra.
Nút "Bỏ qua" vào menu ngay. Nút 🏫 trên thanh trên cùng đưa bạn về lại phòng học.
Nếu máy bật chế độ giảm chuyển động (prefers-reduced-motion), app bỏ qua hoạt ảnh.

## Trò chơi

| Trò | Luật chơi |
|---|---|
| 📝 Trắc nghiệm | Làm lần lượt từng câu, chọn được số câu, có giải thích sau mỗi câu |
| ⏱️ Đua thời gian | 60 giây, câu tự chuyển, hết đề thì lặp lại |
| ❤️ Sinh tồn | 3 mạng, sai một câu mất một mạng |
| 🧩 Ghép cặp | Nối câu hỏi với đáp án, mỗi vòng 5 cặp, tối đa 15 cặp (cần ít nhất 4 câu) |
| 📖 Ôn câu sai | Chỉ chơi các câu từng sai, trả lời đúng thì câu được gỡ khỏi danh sách |

Phím tắt: `1`-`8` để chọn đáp án, `Enter` để sang câu tiếp.

## Tính năng đi kèm

- Điểm có thưởng chuỗi đúng liên tiếp (+10 mỗi câu trong chuỗi, tối đa +50).
- XP và cấp độ. XP = 10 mỗi câu đúng + 2 × chuỗi dài nhất + 20 nếu đúng hết (ván từ 5 câu).
- Số ngày học liên tiếp, 6 huy hiệu, top 5 điểm cao cho mỗi bộ đề và mỗi trò.
- Màn kết quả liệt kê các câu sai kèm đáp án và giải thích.
- Quản lý bộ đề: xem danh sách câu, xóa câu, xóa bộ đề, xuất JSON.

## Định dạng bộ đề

Hỗ trợ `.docx`, `.txt`, `.csv`, `.json`, hoặc dán nội dung trực tiếp. Trang "Thêm bộ đề" có file mẫu để tải về.

```
1. Thủ đô của Việt Nam là gì?
A. Hồ Chí Minh
*B. Hà Nội          <- dấu * đánh dấu đáp án đúng
C. Đà Nẵng
Giải thích: ...     <- tùy chọn

2. 2 + 2 = ?
A. 3
B. 4
Đáp án: B           <- hoặc ghi đáp án ở dòng riêng
```

CSV: `question,A,B,C,D,answer,explanation`. Cột answer có thể là chữ cái, thứ tự (bắt đầu từ 1) hoặc nội dung đáp án.

## Cấu trúc code

```
index.html        khung trang
css/style.css     giao diện (responsive cho điện thoại)
js/main.js        các màn hình và điều hướng
js/games.js       logic các trò chơi
js/classroom.js   phòng học có hoạt ảnh (SVG + CSS)
js/parser.js      đọc file docx/txt/csv/json
js/store.js       lưu trữ, XP, cấp độ, huy hiệu
js/sample.js      bộ đề mẫu
build.mjs         gộp thành dist/hoc-vui.html
```

## Giới hạn hiện tại

- App chỉ đọc được đề **đã có sẵn câu hỏi và đáp án**. Chưa tự tạo câu hỏi từ tài liệu bài giảng (tính năng này cần AI).
- Chưa đọc trực tiếp file PDF. Cách tạm: copy nội dung PDF rồi dán vào ô nhập.
- Dữ liệu chỉ nằm trên trình duyệt đang dùng. Xóa dữ liệu trình duyệt sẽ mất dữ liệu app, và chưa đồng bộ giữa các máy.
