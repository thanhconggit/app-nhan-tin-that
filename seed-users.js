// Danh sách tài khoản được cấp sẵn (bên cạnh tài khoản người dùng tự đăng ký,
// được lưu ở data/users.json trên server).
//
// Mật khẩu chỉ lưu dưới dạng bcrypt hash (không lưu mật khẩu gốc ở đây).
// Mật khẩu mặc định để đăng nhập (xem README.md):
//   admin -> admin123
//
// 06/11/2026: đã xóa 5 tài khoản test theo yêu cầu của chủ app: nguyen (Nguyễn Văn An),
// minhduc (Lê Minh Đức), phuongthao (Phạm Phương Thảo), hoangnam (Vũ Hoàng Nam),
// lananh (Trần Lan Anh). Chỉ còn giữ tài khoản admin làm tài khoản cấp sẵn.
//
// Cách thêm / đổi tài khoản: xem mục "Thêm / đổi tài khoản" trong README.md.
// Khi đổi mật khẩu, tạo hash mới bằng lệnh:
//   node -e "console.log(require('bcryptjs').hashSync('MAT_KHAU_MOI', 10))"
// rồi dán hash vào đây và deploy lại.
module.exports = [
  {
    username: 'admin',
    displayName: 'Quản trị viên',
    passwordHash: '$2b$10$kXvJqZXYVLIoDausBqM11.vYE5GSXTqcE/9.p7o6nhiqgh8XgaYSi',
  },
];
