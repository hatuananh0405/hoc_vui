# HọcVui: vừa chơi vừa học

Web app học tập bằng trò chơi trắc nghiệm, dùng được cho mọi môn học. Người dùng tải bộ đề của mình lên rồi chơi.
App chạy hoàn toàn trên trình duyệt, không cần server hay tài khoản. Dữ liệu lưu trong localStorage.

## Cách chạy

- **Cách nhanh nhất**: mở file `dist/hoc-vui.html` bằng trình duyệt (double-click). Toàn bộ app nằm trong một file này.
- **Khi đang sửa code**: chạy server tĩnh trong thư mục này (`python3 -m http.server`), rồi mở `http://localhost:8000`.
- Sửa code xong, chạy `node build.mjs` để tạo lại `dist/hoc-vui.html`.

## Phòng riêng (màn mở đầu)

Mở app sẽ vào phòng riêng nhìn chéo từ trên cao (isometric 2.5D), có nhân vật chibi đi lại được.

- **Di chuyển**: bấm hoặc chạm vào sàn, nhân vật tự tìm đường và đi vòng qua đồ đạc. Trên máy tính dùng được phím mũi tên hoặc WASD.
- **Ngồi học**: lại gần bàn học thì hiện nút **🪑 Ngồi học**. Bấm nút đó, bấm thẳng vào bàn, hoặc nhấn E / Enter: nhân vật ngồi xuống, đèn bàn bật, camera phóng vào bàn rồi mở menu.
- **Góc âm nhạc** (phía trước bên phải): một bãi cát nhỏ có viền sóng, ghế bãi biển vải sọc, ô che nắng, bàn nhỏ để trái dừa và radio. Bấm ghế hoặc nút **🎧 Nghe nhạc**: nhân vật ngả lưng, hai tay gối sau đầu, đeo tai nghe chụp tai và bịt mắt, lắc lư theo nhịp. Nốt nhạc bay lên, loa radio rung theo.
- **Góc xem phim** (sát tường bên phải): sofa đặt song song với TV treo tường. Bấm sofa, TV hoặc nút **🍿 Xem phim**: nhân vật nằm nghiêng dọc sofa, chống tay đỡ đầu, quay mặt về TV, tay kia bốc bỏng ngô. TV chiếu 3 cảnh hoạt hình luân phiên, đèn phòng tối đi, ánh TV đổi màu theo cảnh.
- Đang ngồi hoặc nằm: bấm **⬆️ Đứng dậy**, nhấn E, bấm vào sàn hoặc nhấn phím di chuyển để đứng lên.
- **Nghe nhạc thật**: khi ngồi ghế bãi biển, bảng nhạc hiện ra bên dưới phòng. Bạn có thể:
  - **Tạo playlist**: đặt tên, rồi thêm link bài hát, album hoặc playlist (mỗi dòng một link, hoặc thêm dần sau).
  - **Lưu playlist có sẵn từ link**: dán link playlist Spotify / YouTube Music, đặt tên hoặc để app lấy tên gốc.
  - Đổi tên, xoá playlist, xoá từng link, phát từ bất kỳ link nào, chuyển bài trước / bài tiếp.
  - Link hỗ trợ: `open.spotify.com/...` (bài hát, album, playlist, podcast, nghệ sĩ), `spotify:...`, `youtube.com/watch`, `youtu.be`, `youtube.com/shorts`, `youtube.com/playlist`, `music.youtube.com/...`.
  - Nhạc phát bằng trình phát nhúng chính thức, không cần đăng nhập vào app. Với Spotify, ai đang đăng nhập Spotify trên trình duyệt nghe được cả bài, chưa đăng nhập thì chỉ nghe đoạn 30 giây. Với YouTube, ai không có Premium sẽ thấy quảng cáo.
  - **Bài trước / Bài tiếp**: nếu link đang phát là playlist YouTube thì chuyển bài ngay trong playlist đó. Nếu YouTube không đổi bài thì sang link khác của playlist trong app.
  - Hết một bài lẻ thì tự chuyển sang link tiếp theo. Hết link cuối thì dừng và báo đã phát hết, không quay về bài đầu. Nốt nhạc và radio chỉ nhảy khi nhạc đang phát.
  - **Mix tự động của YouTube** (link có `list=RD...`) có thể chỉ phát được bài đầu trong trình phát nhúng. Khi gặp trường hợp này, app hiện cảnh báo. Muốn nghe nhiều bài, hãy thêm từng bài vào playlist của app hoặc dùng playlist thường của YouTube.
  - Playlist lưu trong trình duyệt (localStorage) cùng với dữ liệu học tập. Đứng dậy khỏi ghế thì nhạc dừng.
- Góc xem phim hiện mới có hoạt ảnh, chưa phát phim thật.
- Nút "Bỏ qua" vào menu ngay. Nút 🏫 trên thanh trên cùng đưa về lại phòng.
- Trên điện thoại, camera phóng gần hơn và bám theo nhân vật.

Phòng vẽ bằng canvas 2D, không dùng thư viện. Đồ đạc, chỗ bị chặn và các chỗ tương tác khai báo ở đầu `js/classroom.js` (`BLOCKS`, `SPOTS`, `OBJECTS`), nên thêm góc mới chỉ cần thêm vào các danh sách này.

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
js/classroom.js   phòng riêng isometric, nhân vật, tìm đường (canvas)
js/music.js       playlist nhạc, nhận diện link, trình phát Spotify / YouTube
js/parser.js      đọc file docx/txt/csv/json
js/store.js       lưu trữ, XP, cấp độ, huy hiệu
js/sample.js      bộ đề mẫu
build.mjs         gộp thành dist/hoc-vui.html
```

## Giới hạn hiện tại

- App chỉ đọc được đề **đã có sẵn câu hỏi và đáp án**. Chưa tự tạo câu hỏi từ tài liệu bài giảng (tính năng này cần AI).
- Chưa đọc trực tiếp file PDF. Cách tạm: copy nội dung PDF rồi dán vào ô nhập.
- Dữ liệu chỉ nằm trên trình duyệt đang dùng. Xóa dữ liệu trình duyệt sẽ mất dữ liệu app, và chưa đồng bộ giữa các máy.
