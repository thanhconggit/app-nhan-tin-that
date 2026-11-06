# App Nhắn Tin Thật — nhiều người nhắn/gọi qua 1 link

Đây là bản **nhắn tin thật giữa nhiều người**: một server chung duy nhất. Ai mở link (sau khi deploy),
đăng nhập bằng tài khoản được cấp sẵn, đều nhắn tin và gọi cho nhau theo thời gian thực.

Khác với bản xem thử trên Muse (link tĩnh, mỗi người một phiên riêng, không nhắn qua lại được):
bản này có server thật (Node.js + Socket.IO), tin nhắn được chuyển giữa các máy và lưu trên server,
cuộc gọi dùng **WebRTC thật** (âm thanh/hình ảnh đi ngang hàng giữa 2 máy, server chỉ chuyển tín hiệu gọi).

## Tính năng

- Đăng nhập bằng tài khoản được cấp sẵn, hoặc **tự tạo tài khoản** ngay ở màn hình đăng nhập
  (mục "Tạo tài khoản"): tài khoản được lưu trên server tại `data/users.json`
  (mật khẩu chỉ lưu dạng bcrypt hash), tạo xong đăng nhập được ngay và xuất hiện trong danh bạ của mọi người.
  Tên tài khoản 3–20 ký tự (chữ thường, số, `_`), mật khẩu tối thiểu 6 ký tự, không tạo trùng được.
  Lưu ý: giống lịch sử tin nhắn, file tài khoản nằm trên đĩa của host — gói Free của Render dùng đĩa tạm
  nên tài khoản tự tạo có thể mất khi service restart/redeploy; muốn lưu bền vững cần gắn thêm database/đĩa persistent.
- Danh bạ / danh sách trò chuyện: trạng thái online thật từ server, badge chưa đọc,
  thông báo trình duyệt (Notification API) + toast trong app khi có tin nhắn mới lúc không mở cuộc trò chuyện đó.
- Chat 1-1 thời gian thực qua Socket.IO; lịch sử tin nhắn lưu trên server (file `data/messages.json`).
- Gửi: tin nhắn chữ, ảnh (nén trên trình duyệt, giới hạn kích thước), emoji, sticker, GIF
  (bộ GIF/sticker có sẵn trong app, không cần API key ngoài), tin nhắn thoại
  (ghi bằng MediaRecorder, tối đa 60 giây / 2MB, người nhận bấm phát lại được).
- Gọi thoại + gọi video WebRTC thật: xem trước camera của mình, thấy hình/nghe tiếng của người kia,
  tắt mic / tắt camera, bấm giờ cuộc gọi, nghe / từ chối / kết thúc, và lưu một dòng lịch sử cuộc gọi vào khung chat.
- Giao diện tiếng Việt, tông xanh kiểu Zalo, dùng được trên điện thoại.

## Tài khoản được cấp sẵn

| Tài khoản | Mật khẩu | Tên hiển thị |
|---|---|---|
| nguyen | 123456 | Nguyễn Văn An |
| lananh | 123456 | Trần Lan Anh |
| minhduc | 123456 | Lê Minh Đức |
| phuongthao | 123456 | Phạm Phương Thảo |
| hoangnam | 123456 | Vũ Hoàng Nam |
| admin | admin123 | Quản trị viên |

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
đăng nhập `nguyen` ở bên này và `lananh` ở bên kia, rồi nhắn / gọi qua lại.

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
- **Lịch sử tin nhắn có thể bị mất khi deploy lại:** tin nhắn lưu ở file `data/messages.json` trên đĩa của host.
  Đĩa của gói miễn phí (Render/Fly) là tạm thời — khi dịch vụ restart/deploy lại, file này có thể bị xoá và lịch sử quay về trống.
  Muốn lưu bền vững thì gắn thêm Persistent Disk (Render, có phí) trỏ vào thư mục `data/`,
  hoặc chuyển sang cơ sở dữ liệu (PostgreSQL/MongoDB) — phần đó chưa làm trong bản này.
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
