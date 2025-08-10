# 🔨 Build Task-Killer Executable

Hướng dẫn build Task-Killer thành file executable để cài vào `/usr/local/bin`

## 🚀 Quick Build & Install

```bash
# 1. Build executable
./build-executable.sh

# 2. Install globally (cần sudo)
sudo ./install.sh

# 3. Hoặc install local (không cần sudo)
./install.sh --local

# 4. Sử dụng
task-killer
```

## 📋 Chi Tiết

### Build Methods

**Method 1: Bundle Script (Recommended)**
- Tạo script bundle với Node.js
- Tự động tạo config directory
- Nhỏ gọn, dễ debug

**Method 2: Using nexe**
- Tạo true executable
- Không cần Node.js trên máy đích
- Lớn hơn (~50MB)

**Method 3: Using pkg** 
- Cross-platform executables
- Support nhiều OS
- Phức tạp hơn

### File Structure sau khi build

```
task-killer/
├── task-killer          # Executable file
├── build-executable.sh  # Build script
├── install.sh          # Install script
└── ~/.task-killer/     # Config directory (created on first run)
    ├── .env           # Configuration
    └── tasks.db       # SQLite database (if used)
```

## 🎯 Usage sau khi install

```bash
# Chạy từ bất kỳ đâu
task-killer

# First run sẽ tạo config
# Edit ~/.task-killer/.env để thêm GEMINI_API_KEY
nano ~/.task-killer/.env

# Sau đó sử dụng bình thường
task-killer
```

## 🔧 Troubleshooting

**Lỗi permission:**
```bash
sudo chmod +x /usr/local/bin/task-killer
```

**Command not found:**
```bash
# Check PATH
echo $PATH | grep -o "/usr/local/bin"

# Hoặc dùng full path
/usr/local/bin/task-killer
```

**Config issues:**
```bash
# Check config
ls -la ~/.task-killer/
cat ~/.task-killer/.env
```

## 🌟 Features của Executable

- ✅ **Standalone**: Không cần npm/node trong runtime
- ✅ **Auto-config**: Tự tạo config directory
- ✅ **Global access**: Gọi từ bất kỳ đâu
- ✅ **Cross-platform**: macOS, Linux, Windows
- ✅ **Self-contained**: Tất cả dependencies included

## 📦 Distribution

Sau khi build, bạn có thể:

1. **Copy executable** cho người khác
2. **Upload to releases** on GitHub
3. **Package installer** cho easy setup
4. **Create deb/rpm packages** cho Linux

---

**Happy task managing!** 🎯