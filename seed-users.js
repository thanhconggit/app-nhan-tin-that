// Danh sách tài khoản được cấp sẵn — KHÔNG có đăng ký tự do.
//
// Mật khẩu chỉ lưu dưới dạng bcrypt hash (không lưu mật khẩu gốc ở đây).
// Mật khẩu mặc định để đăng nhập (xem README.md):
//   nguyen / lananh / minhduc / phuongthao / hoangnam -> 123456
//   admin -> admin123
//
// Cách thêm / đổi tài khoản: xem mục "Thêm / đổi tài khoản" trong README.md.
// Khi đổi mật khẩu, tạo hash mới bằng lệnh:
//   node -e "console.log(require('bcryptjs').hashSync('MAT_KHAU_MOI', 10))"
// rồi dán hash vào đây và deploy lại.
module.exports = [
  {
    username: 'nguyen',
    displayName: 'Nguyễn Văn An',
    passwordHash: '$2b$10$FXcfwpibSy9FDBWEZs8AoOYQ4PY/dsCa5yek71ZNeXF1OoseTHGFK',
  },
  {
    username: 'lananh',
    displayName: 'Trần Lan Anh',
    passwordHash: '$2b$10$Jue.qx2d4g2ls4aZyqp8nu7V3APmtgPCYpGuL4bo9pA/d7toHi052',
  },
  {
    username: 'minhduc',
    displayName: 'Lê Minh Đức',
    passwordHash: '$2b$10$iZFIxJfdiEJTt6SGtYecSer/DQZ0KQk3ml9Nf7pLrI7ib/KNsry9.',
  },
  {
    username: 'phuongthao',
    displayName: 'Phạm Phương Thảo',
    passwordHash: '$2b$10$VsnNEpng9o9S4RiBFnBsAeT4UobXW.hzSVIxfGfyLYTNNe7ZDA6le',
  },
  {
    username: 'hoangnam',
    displayName: 'Vũ Hoàng Nam',
    passwordHash: '$2b$10$F3bPwHSIfjG97AB6yQvkT.OFywtWWI.pqjNwFW0zjAZ/ybHCVseV2',
  },
  {
    username: 'admin',
    displayName: 'Quản trị viên',
    passwordHash: '$2b$10$kXvJqZXYVLIoDausBqM11.vYE5GSXTqcE/9.p7o6nhiqgh8XgaYSi',
  },
];
