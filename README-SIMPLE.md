# 🎯 Task-Killer - Phiên Bản Đơn Giản

CLI quản lý task bằng tiếng Việt, thân thiện như Claude Code!

## ⚡ Khởi Động Nhanh

```bash
npm install
npm run simple
```

## 🚀 Cách Sử Dụng

### Bắt đầu
Chạy lệnh và bạn sẽ vào chế độ chat:
```bash
npm run simple
```

### Nói chuyện bằng tiếng Việt
```
Bạn: Tạo task làm báo cáo, gấp
🤖: ✅ Đã tạo task "Làm báo cáo" thành công!

Bạn: Xem task hôm nay  
🤖: 📋 Tìm thấy 3 task: ...

Bạn: Hoàn thành task abc123
🤖: ✅ Đã cập nhật task thành công!
```

### Lệnh Nhanh
- `/list` - Xem tất cả task
- `/today` - Task hôm nay  
- `/stats` - Thống kê
- `/help` - Trợ giúp
- `/clear` - Xóa màn hình

## 📝 Ví Dụ Thực Tế

```
Bạn: Tôi cần làm presentation cho khách hàng ABC tuần sau, quan trọng
🤖: ✅ Đã tạo task "Làm presentation cho khách hàng ABC" với độ ưu tiên cao và hạn tuần sau!

Bạn: Xem task công việc chưa xong
🤖: 📋 Tìm thấy 2 task công việc pending:
⏳🟡 Làm presentation cho khách hàng ABC (a1b2c3d4)
⏳🟢 Review báo cáo tháng 12 (e5f6g7h8)

Bạn: Bắt đầu làm task presentation
🤖: ✅ Đã chuyển task "Làm presentation cho khách hàng ABC" sang trạng thái đang thực hiện!

Bạn: Xong rồi
🤖: ✅ Đã hoàn thành task! 🎉
```

## 🎨 Tính Năng Thông Minh

### Hiểu Ngôn Ngữ Tự Nhiên
- "Tạo task" = Tạo task mới
- "Xem task" = Hiển thị danh sách  
- "Hoàn thành" = Đánh dấu xong
- "Gấp", "urgent" = Độ ưu tiên cao
- "Ngày mai", "tuần sau" = Tự động tính ngày

### Gợi Ý Thông Minh
- Gợi ý task cần làm tiếp theo
- Nhắc nhở task đang dở dang
- Đưa ra lệnh phù hợp với tình huống

### Giao Diện Thân Thiện
- Màu sắc rõ ràng, dễ nhìn
- Emoji trực quan
- Bảng đẹp, ngắn gọn
- Không quá phức tạp

## 🔧 Cấu Hình

Chỉ cần file `.env`:
```env
GEMINI_API_KEY=your_key_here
DATABASE_URL=sqlite:./tasks.db  # Tự động tạo
```

## 💡 So Sánh Phiên Bản

| Tính năng | Phiên bản Cũ | Phiên bản Đơn giản |
|-----------|--------------|-------------------|
| **Khởi động** | `task-killer create -t "..." -p high` | `Tạo task làm báo cáo, gấp` |
| **Giao diện** | Nhiều command phức tạp | Chỉ chat đơn giản |
| **Ngôn ngữ** | Tiếng Anh + Việt | 100% tiếng Việt |
| **Học tập** | Phải nhớ syntax | Nói tự nhiên |
| **Setup** | PostgreSQL bắt buộc | SQLite tự động |

## 🎯 Philosophy

Được thiết kế theo triết lý của Claude Code:
- **Tự nhiên**: Nói chuyện như với người
- **Thông minh**: AI hiểu ý bạn muốn gì  
- **Đơn giản**: Không cần nhớ lệnh phức tạp
- **Nhanh chóng**: Vào là dùng được ngay

---

**"Quản lý task không cần phức tạp. Chỉ cần nói là AI hiểu!"** 🚀