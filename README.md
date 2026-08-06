# Sổ Tài Chính

App quản lý thu chi cá nhân — cùng bộ khung với app "Việc Của Tôi" (React + Vite + Supabase),
deploy trên Vercel.

## Cấu trúc project

```
so-tai-chinh/
├── index.html
├── package.json
├── vite.config.js
├── tailwind.config.js
├── postcss.config.js
├── .env.example
├── .gitignore
├── schema-finance.sql        ← chạy file này trong Supabase (1 lần)
└── src/
    ├── main.jsx
    ├── index.css
    └── App.jsx                ← toàn bộ giao diện + logic app
```

## Bước 1 — Tạo bảng trong Supabase

1. Mở project Supabase bạn đã dùng cho app "Việc Của Tôi" (khuyến khích dùng
   chung 1 project cho cả 2 app cá nhân — 4 bảng mới không đụng gì tới các bảng
   `tasks` cũ). Nếu muốn tách riêng thì tạo project Supabase mới cũng được.
2. Vào **SQL Editor** → **New query**.
3. Dán toàn bộ nội dung file `schema-finance.sql` → bấm **Run**.
4. Kiểm tra ở **Table Editor** đã thấy 4 bảng: `fin_categories`,
   `fin_subcategories`, `fin_transactions`, `fin_budgets`.

## Bước 2 — Lấy URL và anon key

Trong Supabase: **Project Settings → API**, copy 2 giá trị:
- `Project URL` → dán vào `VITE_SUPABASE_URL`
- `anon public` key → dán vào `VITE_SUPABASE_ANON_KEY`

(Nếu dùng chung project với app to-do thì đây chính là 2 giá trị bạn đã có sẵn.)

## Bước 3 — Chạy thử ở máy local (tuỳ chọn)

```bash
npm install
cp .env.example .env
# mở .env, dán 2 giá trị thật vào
npm run dev
```

Mở `http://localhost:5173` để xem thử.

## Bước 4 — Đưa lên GitHub

```bash
git init
git add .
git commit -m "Sổ Tài Chính: app quản lý thu chi cá nhân"
git branch -M main
git remote add origin https://github.com/<tên-bạn>/so-tai-chinh.git
git push -u origin main
```

(Tạo repo trống trước trên github.com nếu chưa có, rồi thay đường link ở trên.)

## Bước 5 — Deploy trên Vercel

1. Vào [vercel.com](https://vercel.com) → **Add New → Project**.
2. Chọn repo `so-tai-chinh` vừa đẩy lên GitHub → **Import**.
3. Vercel tự nhận diện framework là **Vite** — giữ nguyên cấu hình mặc định
   (Build Command: `vite build`, Output Directory: `dist`).
4. Vào **Environment Variables**, thêm đúng 2 biến:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
5. Bấm **Deploy**. Sau khoảng 1 phút bạn sẽ có link dạng
   `https://so-tai-chinh.vercel.app`.

Từ lần sau, mỗi lần `git push` lên nhánh `main`, Vercel sẽ tự build và deploy lại.

## Ghi chú

- App có 2 chế độ giao diện (Web / App) và nút ẩn số tiền, y hệt cách hoạt
  động của app "Việc Của Tôi".
- Toàn bộ dữ liệu (danh mục, khoản ghi thu/chi, hạn mức ngân sách) được lưu
  thật trong Supabase — không mất khi tải lại trang.
- Muốn đổi tên miền hiển thị đẹp hơn (`taichinh.tenban.com`)? Vào Vercel →
  Project → **Settings → Domains** để gắn domain riêng.
