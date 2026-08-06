-- ============================================================
-- SCHEMA: "Sổ Tài Chính" — cơ sở dữ liệu quan hệ cho app quản lý thu chi
-- Dán toàn bộ nội dung này vào Supabase → SQL Editor → Run
-- (An toàn khi chạy lại nhiều lần nhờ IF NOT EXISTS)
-- Đây là 4 bảng MỚI, không đụng tới các bảng tasks / task_results / task_result_files
-- của app "Việc Của Tôi" — có thể chạy trên CÙNG một project Supabase.
-- ============================================================

-- Danh mục thu nhập / chi tiêu (cấp 1), ví dụ: "Ăn uống", "Lương"...
create table if not exists fin_categories (
  id          bigint generated always as identity primary key,
  type        text not null check (type in ('income', 'expense')),
  name        text not null,
  position    int not null default 0,
  created_at  timestamptz not null default now(),
  unique (type, name)
);

-- Chi tiết trong từng danh mục (cấp 2), ví dụ: "Ăn uống" → "Đi chợ", "Ăn ngoài"
create table if not exists fin_subcategories (
  id            bigint generated always as identity primary key,
  category_id   bigint not null references fin_categories(id) on delete cascade,
  name          text not null,
  position      int not null default 0,
  created_at    timestamptz not null default now(),
  unique (category_id, name)
);

-- Từng khoản ghi thu / chi thực tế
create table if not exists fin_transactions (
  id            bigint generated always as identity primary key,
  type          text not null check (type in ('income', 'expense')),
  date          date not null,
  category      text not null,
  subcategory   text,
  amount        numeric(14, 0) not null check (amount > 0),
  created_at    timestamptz not null default now()
);

-- Hạn mức ngân sách theo từng tháng, cho từng danh mục chi tiêu
create table if not exists fin_budgets (
  id          bigint generated always as identity primary key,
  month       text not null,              -- định dạng 'YYYY-MM'
  category    text not null,
  amount      numeric(14, 0) not null check (amount >= 0),
  created_at  timestamptz not null default now(),
  unique (month, category)
);

-- Index giúp truy vấn nhanh theo ngày, theo loại, theo tháng ngân sách
create index if not exists idx_fin_tx_date on fin_transactions (date);
create index if not exists idx_fin_tx_type on fin_transactions (type);
create index if not exists idx_fin_budgets_month on fin_budgets (month);
create index if not exists idx_fin_subcategories_category_id on fin_subcategories (category_id);

-- ------------------------------------------------------------
-- BẢO MẬT (giống hệt cách làm với app "Việc Của Tôi")
-- App cá nhân dùng một mình → bật RLS, cho phép mọi thao tác qua anon key.
-- Nếu sau này thêm đăng nhập (Supabase Auth), hãy đổi policy để lọc theo user_id.
-- ------------------------------------------------------------

alter table fin_categories enable row level security;
alter table fin_subcategories enable row level security;
alter table fin_transactions enable row level security;
alter table fin_budgets enable row level security;

drop policy if exists "allow all on fin_categories" on fin_categories;
create policy "allow all on fin_categories"
  on fin_categories for all
  using (true)
  with check (true);

drop policy if exists "allow all on fin_subcategories" on fin_subcategories;
create policy "allow all on fin_subcategories"
  on fin_subcategories for all
  using (true)
  with check (true);

drop policy if exists "allow all on fin_transactions" on fin_transactions;
create policy "allow all on fin_transactions"
  on fin_transactions for all
  using (true)
  with check (true);

drop policy if exists "allow all on fin_budgets" on fin_budgets;
create policy "allow all on fin_budgets"
  on fin_budgets for all
  using (true)
  with check (true);

-- ------------------------------------------------------------
-- (Tuỳ chọn) Danh mục mặc định ban đầu, giống bản demo cũ.
-- Xoá đoạn dưới nếu bạn muốn tự thêm danh mục từ đầu trong app.
-- ------------------------------------------------------------

insert into fin_categories (type, name, position) values
  ('income', 'Lương', 0),
  ('income', 'Thưởng', 1),
  ('income', 'Đầu tư', 2),
  ('income', 'Thu nhập khác', 3),
  ('expense', 'Ăn uống', 0),
  ('expense', 'Nhà ở', 1),
  ('expense', 'Di chuyển', 2),
  ('expense', 'Mua sắm', 3),
  ('expense', 'Giải trí', 4),
  ('expense', 'Tiết kiệm & đầu tư', 5),
  ('expense', 'Khác', 6)
on conflict (type, name) do nothing;

-- Chi tiết (subcategory) mặc định cho các danh mục chi tiêu ở trên
do $$
declare
  cat record;
  sub_names text[];
  sub_name text;
  pos int;
begin
  for cat in select id, name from fin_categories where type = 'expense' loop
    sub_names := case cat.name
      when 'Ăn uống' then array['Đi chợ', 'Ăn ngoài', 'Cà phê / trà sữa']
      when 'Nhà ở' then array['Tiền thuê nhà', 'Điện nước', 'Internet']
      when 'Di chuyển' then array['Xăng xe', 'Grab / Taxi', 'Gửi xe']
      when 'Mua sắm' then array['Quần áo', 'Đồ gia dụng']
      when 'Giải trí' then array['Xem phim', 'Du lịch']
      when 'Tiết kiệm & đầu tư' then array['Gửi tiết kiệm', 'Chứng khoán']
      when 'Khác' then array['Chi phí khác']
      else array[]::text[]
    end;
    pos := 0;
    foreach sub_name in array sub_names loop
      insert into fin_subcategories (category_id, name, position)
      values (cat.id, sub_name, pos)
      on conflict (category_id, name) do nothing;
      pos := pos + 1;
    end loop;
  end loop;
end $$;
