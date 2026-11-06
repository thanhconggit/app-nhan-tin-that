// Danh sách tài khoản được cấp sẵn (bên cạnh tài khoản người dùng tự đăng ký,
// được lưu ở data/users.json trên server).
//
// Mật khẩu chỉ lưu dưới dạng bcrypt hash (không lưu mật khẩu gốc ở đây).
// Mật khẩu mặc định để đăng nhập (xem README.md):
//   lananh -> 123456
//   admin -> admin123
//
// 06/11/2026: đã xóa 4 tài khoản test nguyen (Nguyễn Văn An), minhduc (Lê Minh Đức),
// phuongthao (Phạm Phương Thảo), hoangnam (Vũ Hoàng Nam) theo yêu cầu của chủ app.
//
// Cách thêm / đổi tài khoản: xem mục "Thêm / đổi tài khoản" trong README.md.
// Khi đổi mật khẩu, tạo hash mới bằng lệnh:
//   node -e "console.log(require('bcryptjs').hashSync('MAT_KHAU_MOI', 10))"
// rồi dán hash vào đây và deploy lại.
module.exports = [
  {
    username: 'lananh',
    displayName: 'Trần Lan Anh',
    passwordHash: '$2b$10$Jue.qx2d4g2ls4aZyqp8nu7V3APmtgPCYpGuL4bo9pA/d7toHi052',
  },
  {
    username: 'admin',
    displayName: 'Quản trị viên',
    passwordHash: '$2b$10$kXvJqZXYVLIoDausBqM11.vYE5GSXTqcE/9.p7o6nhiqgh8XgaYSi',
  },
];
