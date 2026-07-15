# 🔧 Hướng dẫn cài đặt MCP Servers cho Claude Code

## MCP Servers là gì?

MCP (Model Context Protocol) giúp Claude Code:
- Đọc code tốt hơn (Serena)
- Tra cứu tài liệu mới nhất (Context7)
- Tăng độ chính xác khi code

---

## Yêu cầu

- **Claude Code CLI** đã cài đặt
- Terminal/Command line access

---

## Cài đặt MCP Servers

### 1. Serena MCP (Phân tích code)

```bash
# Chạy trong terminal
claude mcp add serena -- uvx --from git+https://github.com/oraios/serena serena-mcp-server --context ide-assistant --project $(pwd)

# Sau đó index project
uvx --from git+https://github.com/oraios/serena serena project index
```

### 2. Context7 MCP (Tra cứu docs)

```bash
# Chạy trong terminal
claude mcp add -s user context7 -- npx -y @upstash/context7-mcp@latest
```

---

## Kiểm tra cài đặt

```bash
# Xem danh sách MCP đã cài
claude mcp list
```

---

## Sử dụng sau khi cài

### Với Serena:
```
"Analyze the authentication flow using Serena"
"Leverage Serena's LSP analysis to refactor the database layer"
```

### Với Context7:
```
"Use Context7 to find the latest React best practices"
"Check Context7 for Next.js 14 patterns"
```

---

## Troubleshooting

### Lỗi: `command not found: claude`
- Cần cài Claude CLI từ: https://claude.ai/code
- Hoặc sử dụng Claude Code desktop app

### Lỗi: `uvx not found`
```bash
# Cài uvx trước
pip install uv
# hoặc
curl -LsSf https://astral.sh/uv/install.sh | sh
```

### Lỗi quyền truy cập
```bash
# macOS/Linux
chmod +x ~/.claude/bin/claude
```

---

## Xóa MCP (nếu cần)

```bash
claude mcp remove serena
claude mcp remove context7
```
