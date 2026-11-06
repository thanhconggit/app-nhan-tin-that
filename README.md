# App Nhắn Tin Thật — nhiều người nhắn/gọi qua 1 link

Đây là bản **nhắn tin thật giữa nhiều người**: một server chung duy nhất. Ai mở link (sau khi deploy),
đăng nhập bằng tài khoản được cấp sẵn, đều nhắn tin và gọi cho nhau theo thời gian thực.

Khác với bản xem thử trên Muse (link tĩnh, mỗi người một phiên riêng, không nhắn qua lại được):
bản này có server thật (Node.js + Socket.IO), tin nhắn được chuyển giữa các máy và lưu trên server,
cuộc gọi dùng **WebRTC thật** (âm thanh/hình ảnh đi ngang hàng giữa 2 máy, server chỉ chuyển tín hiệu gọi).

## Tính năng

- Đăng nhập bằng tài khoản được cấp sẵn, hoặc **tự tạo tài khoản** ngay ở màn hình đăng nhập
  (mục "Tạo tài khoản"): tài khoản được lưu trên server (mật khẩu chỉ lưu dạng bcrypt hash),
  tạo xong đăng nhập được ngay và xuất hiện trong danh bạ của mọi người.
  Tên tài khoản 3–20 ký tự (chữ thường, số, `_`), mật khẩu tối thiểu 6 ký tự, không tạo trùng được.
- **Lưu trữ bền vững bằng Postgres (Neon):** khi biến môi trường `DATABASE_URL` được đặt (chuỗi kết nối
  Neon), tài khoản tự đăng ký và toàn bộ tin nhắn được lưu vào database — **không mất khi deploy lại hay
  restart** (đã kiểm chứng thực tế: trên Render Free, đĩa tạm bị xóa sạch ở mỗi lần deploy, làm mất dữ liệu
  lưu bằng file). Khi không có `DATABASE_URL`, app lùi về lưu file `data/users.json` / `data/messages.json`
  (chỉ phù hợp chạy local). Hai bảng tự tạo lúc khởi động: `users`, `messages`.
- Danh bạ / danh sách trò chuyện: trạng thái online thật từ server, badge chưa đọc,
  thông báo trình duyệt (Notification API) + toast trong app khi có tin nhắn mới lúc không mở cuộc trò chuyện đó.
- **Tiếng thông báo:** "ding" khi có tin nhắn mới (khi đang không xem cuộc trò chuyện đó) và nhạc chuông
  khi có cuộc gọi đến — tạo bằng WebAudio, không cần file âm thanh; nút 🔊/🔇 cạnh nút đăng xuất để tắt/bật.
- Chat 1-1 thời gian thực qua Socket.IO; lịch sử tin nhắn lưu trên server (Postgres, hoặc file khi chạy local).
- **Chat nhóm:** nút "➕ Tạo nhóm" — đặt tên, chọn ít nhất 2 thành viên; nhóm hiện trong danh sách trò
  chuyện của mọi thành viên (có thông báo ngay khi được thêm), tin nhắn nhóm hiện tên người gửi,
  lịch sử nhóm lưu bền như tin 1-1 (bảng `groups` + cột `grp` trong `messages`), người ngoài nhóm bị chặn.
  Gọi thoại/video chỉ hỗ trợ 1-1.
- **Dán ảnh từ clipboard** vào ô nhắn tin (Ctrl+V trên máy tính, hoặc nhấn giữ → Dán trên điện thoại sau khi copy ảnh).
- **Hồ sơ & avatar**: bấm vào avatar/tên của mình để xem hồ sơ cá nhân và **đổi ảnh đại diện** (ảnh nén
  128px, lưu bền trên server, mọi người thấy ngay); bấm avatar/tên người đang chat để xem thông tin của họ
  (trạng thái online, gọi nhanh); bấm tiêu đề nhóm để xem thông tin nhóm và danh sách thành viên.
- **Trả lời, chia sẻ, lưu tin** (trong menu nhấn giữ tin nhắn): **Trả lời** kèm trích dẫn (bấm vào trích dẫn
  để nhảy tới tin gốc), **Chia sẻ** chuyển tiếp tin tới người/nhóm khác (có nhãn "Đã chia sẻ", server tự sao
  chép nội dung), **Lưu tin nhắn** vào mục 🔖 Tin đã lưu riêng của bạn (lưu bản chụp nội dung, xem lại/bỏ lưu
  bất cứ lúc nào, tối đa 200 tin).
- **Thao tác trên tin nhắn** (nhấn giữ trên điện thoại / chuột phải trên máy tính vào bong bóng tin):
  thả cảm xúc ❤️ 😂 😮 😢 👍 😡 (bấm lại để gỡ, cảm xúc lưu bền trên server), **thu hồi tin nhắn**
  của mình (cả hai phía đều thấy "Tin nhắn đã thu hồi"), và **xoá phía tôi** (chỉ ẩn trên máy mình,
  nhớ bằng localStorage). Người tạo nhóm có nút 🗑️ để **xoá nhóm** — xoá cả tin nhắn nhóm của mọi thành viên.
- Gửi: tin nhắn chữ, ảnh (nén trên trình duyệt, giới hạn kích thước), emoji, sticker ảnh thật
  (4 bộ vẽ riêng: Mèo trắng, Shiba, Gà vàng, Thỏ — 48 sticker PNG nền trong suốt trong `public/stickers/`),
  GIF động thật từ Giphy CDN (34 GIF, chỉ lưu URL nên không tốn dung lượng database), tin nhắn thoại
  (ghi bằng MediaRecorder, tối đa 60 giây / 2MB, người nhận bấm phát lại được).
- Gọi thoại + gọi video WebRTC thật: xem trước camera của mình, thấy hình/nghe tiếng của người kia,
  tắt mic / tắt camera, bấm giờ cuộc gọi, nghe / từ chối / kết thúc, và lưu một dòng lịch sử cuộc gọi vào khung chat.
- Giao diện tiếng Việt, tông xanh kiểu Zalo, dùng được trên điện thoại.

## Tài khoản được cấp sẵn

| Tài khoản | Mật khẩu | Tên hiển thị |
|---|---|---|
| admin | admin123 | Quản trị viên |

(06/11/2026: đã xóa 5 tài khoản test nguyen, minhduc, phuongthao, hoangnam, lananh theo yêu cầu của chủ app —
các tài khoản đó không còn đăng nhập được và không còn hiện trong danh bạ. Tài khoản tự đăng ký cần xóa
thì đặt biến môi trường `REMOVE_USERS=<username>` trên host rồi deploy lại: server sẽ xóa tài khoản đó
khỏi database/file ngay khi khởi động — đã áp dụng để xóa tài khoản kiểm tra `kiemtra`.)

Các thẻ điền nhanh tài khoản test trên màn hình đăng nhập đã được ẩn theo yêu cầu — đăng nhập bằng cách gõ tay tài khoản/mật khẩu ở bảng trên, hoặc tự tạo tài khoản mới.

> ⚠️ Đây là mật khẩu test công khai. Trước khi dùng thật cho người khác, hãy đổi mật khẩu
> (xem mục dưới) và đặt `JWT_SECRET` riêng.

## Công nghệ và phiên bản đã kiểm chứng

Kiểm tra trên npm registry ngày 06/11/2026, ghim đúng phiên bản trong `package.json`:

- Node.js 20 (đã test bằng Node v20.20.2)
- express 5.3.0
- socket.io 4.8.4 (client dùng bản do chính server phát tại `/socket.io/socket.io.js`, nên không lệch phiên bản)
- socket.io-client 4.8.4 (chỉ dùng cho test tự động, khớp với server)
- bcryptjs 3.0.3 (băm mật khẩu)
- jsonwebtoken 9.0.3 (phiên đăng nhập)

## Chạy thử trên máy của bạn (local)

Yêu cầu: Node.js 20 trở lên.

```bash
npm install
npm start
```

Mở http://localhost:3000 — cổng mặc định là 3000, đổi bằng biến `PORT` (ví dụ `PORT=8080 npm start`).

Cách test 2 người trên cùng một máy: mở app ở **2 trình duyệt khác nhau** (hoặc 1 cửa sổ thường + 1 cửa sổ ẩn danh),
đăng nhập `admin` ở bên này và một tài khoản bạn tự tạo ở bên kia, rồi nhắn / gọi qua lại.

Test tự động 2 client (đã có sẵn, chạy lại được): để server đang chạy, mở terminal khác:

```bash
npm install   # nếu chưa chạy
BASE=http://localhost:3000 npm run test:2client
```

Script này đăng nhập 2 tài khoản thật, kiểm tra: A gửi chữ → B nhận; B gửi sticker → A nhận;
presence online của cả 2; và chuyển tiếp tín hiệu gọi WebRTC (offer → answer → ICE → kết thúc).

## Deploy lên Render (cách chính — miễn phí, có link công khai)

Repo này đã có sẵn `render.yaml` ở thư mục gốc.

### Cách A — qua GitHub (khuyên dùng)

1. Tạo một repo GitHub mới, đẩy toàn bộ thư mục này lên (không đẩy `node_modules` — đã có `.gitignore`).
2. Vào https://dashboard.render.com → **New +** → **Blueprint** → chọn repo vừa tạo.
   Render sẽ đọc `render.yaml` và tạo sẵn dịch vụ web:
   - Build Command: `npm install`
   - Start Command: `npm start`
   - Biến `JWT_SECRET`: được tự sinh (`generateValue: true` trong render.yaml).
3. Bấm **Apply / Create**, đợi deploy xong. Render cấp một link dạng `https://app-nhan-tin-that.onrender.com`.
4. Gửi link đó cho mọi người: ai mở link, đăng nhập bằng tài khoản ở bảng trên là nhắn/gọi được với nhau.

### Cách B — tạo Web Service thủ công

1. Render → **New +** → **Web Service** → nối repo GitHub của bạn.
2. Runtime: Node; Build Command: `npm install`; Start Command: `npm start`.
3. Vào tab **Environment**, thêm:
   - `JWT_SECRET` = một chuỗi bí mật dài, ngẫu nhiên, chỉ bạn biết.
   - Không cần đặt `PORT`: Render tự cấp cổng qua biến `PORT` và app đã đọc biến này.
4. Deploy, lấy link `onrender.com` và dùng như trên.

Lưu ý gói miễn phí của Render: dịch vụ có thể "ngủ" khi không ai dùng một lúc; lần mở đầu tiên sau đó sẽ chậm vài chục giây.

### Về việc đẩy code lên

Render (và hầu hết các host) deploy từ GitHub/GitLab, không có nút tải file zip trực tiếp lên.
Nếu bạn chưa quen GitHub: tạo tài khoản GitHub → tạo repo trống → trên trang repo chọn
**uploading an existing file** → giải nén file zip này và kéo toàn bộ nội dung vào → Commit.
Sau đó làm Cách A ở trên.

## Cách deploy khác (ngắn gọn)

- **Fly.io:** cài `flyctl`, chạy `fly launch` trong thư mục này (chọn Node, cổng nội bộ 3000),
  đặt secret `fly secrets set JWT_SECRET=<chuoi-bi-mat>`, rồi `fly deploy`. App đã tôn trọng biến `PORT` do Fly cấp.
- **VPS:** cài Node 20, `npm install`, chạy bằng pm2: `PORT=3000 JWT_SECRET=<chuoi-bi-mat> pm2 start server.js`,
  và trỏ một reverse proxy (Nginx/Caddy) có HTTPS về cổng đó. **HTTPS là bắt buộc** thì trình duyệt mới cho dùng micro/camera để gọi và ghi âm.

## Thêm / đổi tài khoản

Tài khoản nằm trong file `seed-users.js`. Mật khẩu chỉ lưu dạng **bcrypt hash** (không lưu mật khẩu gốc).

1. Tạo hash cho mật khẩu mới:
   ```bash
   node -e "console.log(require('bcryptjs').hashSync('MAT_KHAU_MOI', 10))"
   ```
2. Thêm một mục mới vào danh sách trong `seed-users.js` (username, displayName, passwordHash vừa tạo),
   hoặc thay `passwordHash` của tài khoản muốn đổi mật khẩu.
3. Deploy lại (push code mới lên GitHub, Render tự deploy lại).

## Giới hạn cần biết (nói thật)

- **Cuộc gọi dùng STUN, chưa có TURN:** app dùng máy chủ STUN miễn phí của Google để 2 máy tìm đường kết nối.
  Cách này gọi được trên đa số mạng nhà / 4G thông thường, nhưng một số mạng (wifi công ty, NAT đối xứng,
  tường lửa chặt) sẽ **không kết nối được tiếng/hình** dù chuông vẫn đổ.
  Muốn gọi ổn định trên mọi mạng thì cần thêm máy chủ TURN, ví dụ dùng dịch vụ TURN (Metered, Twilio, Cloudflare Calls)
  hoặc tự dựng coturn trên VPS, rồi thêm vào `iceServers` trong `public/app.js`:
  ```js
  { urls: 'turn:YOUR_TURN_HOST:3478', username: '...', credential: '...' }
  ```
- **Lưu trữ:** đã xử lý bằng Postgres (Neon, miễn phí) qua biến `DATABASE_URL` — xem mục Tính năng ở đầu file.
  Chỉ khi chạy local không đặt `DATABASE_URL` thì app mới lưu ra file trên đĩa, và dữ liệu file đó vẫn mất
  khi host miễn phí restart/deploy (đĩa tạm).
- **Ảnh / tin nhắn thoại gửi dạng data URL** và lưu cùng file tin nhắn, phù hợp quy mô test / nhóm nhỏ;
  dùng đông người lâu dài nên chuyển sang lưu trữ file riêng (S3…) và cơ sở dữ liệu.
- **Bảo mật:** mật khẩu ở trên là mật khẩu test đã công khai trong file này — đổi trước khi dùng thật;
  luôn đặt `JWT_SECRET` riêng, dài và giữ bí mật; chỉ dùng app qua HTTPS khi đã deploy.

## Đã kiểm chứng / chưa kiểm chứng

Đã chạy và đạt (06/11/2026, trên máy dựng bản này):

1. `npm install` thành công với đúng các phiên bản đã ghim (104 package).
2. Server khởi động bằng `npm start`, trang đăng nhập trả HTTP 200, `/socket.io/socket.io.js` trả HTTP 200.
3. Test tự động 2 client (`test/two-client.test.js`): đăng nhập 2 tài khoản, A→B tin chữ, B→A sticker,
   presence online, lịch sử lưu trên server, chuyển tiếp offer/answer/ICE/end-call — **tất cả PASS** (11/11 mục).

Chưa kiểm chứng được:

- Giao diện hiển thị trong trình duyệt thật (chưa mở bằng trình duyệt để nhìn).
- Âm thanh/hình ảnh WebRTC thật giữa 2 thiết bị thật (mới kiểm chứng phần **chuyển tín hiệu gọi**, chưa kiểm chứng media).
- Khả năng gọi qua các mạng cần TURN (xem giới hạn ở trên).

<!-- Kiem chung ben vung du lieu: commit kich hoat deploy lai 06/11/2026 -->
