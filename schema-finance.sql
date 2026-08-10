-- ============================================================
-- SCHEMA: "Sổ Tài Chính" — cơ sở dữ liệu quan hệ cho app quản lý thu chi
-- Dán toàn bộ nội dung này vào Supabase → SQL Editor → Run
-- (An toàn khi chạy lại nhiều lần nhờ IF NOT EXISTS)
-- Đây là 5 bảng, không đụng tới các bảng tasks / task_results / task_result_files
-- của app "Việc Của Tôi" — có thể chạy trên CÙNG một project Supabase.
--
-- CẬP NHẬT so với bản trước:
--   1) fin_transactions: thêm cột payment_method ('cash' | 'bank') để tách
--      dòng tiền mặt và dòng chuyển khoản ngân hàng.
--   2) Bảng mới fin_wallet_transfers: ghi lại các lượt "rút tiền mặt" /
--      "nộp tiền vào tài khoản" — chuyển đổi qua lại giữa 2 ví, không làm
--      thay đổi tổng số dư.
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
  id              bigint generated always as identity primary key,
  type            text not null check (type in ('income', 'expense')),
  date            date not null,
  category        text not null,
  subcategory     text,
  amount          numeric(14, 0) not null check (amount > 0),
  -- Hình thức: tiền mặt hay chuyển khoản ngân hàng. Mặc định 'bank' để tương thích
  -- ngược với các khoản ghi cũ đã tồn tại trước khi có tính năng này.
  payment_method  text not null default 'bank' check (payment_method in ('cash', 'bank')),
  created_at      timestamptz not null default now()
);

-- Nếu bảng fin_transactions đã tồn tại từ trước (chưa có cột payment_method),
-- lệnh này sẽ tự thêm cột vào — an toàn khi chạy lại nhiều lần.
alter table fin_transactions
  add column if not exists payment_method text not null default 'bank';
-- Đảm bảo ràng buộc check tồn tại (bỏ qua nếu đã có, tránh lỗi khi chạy lại).
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'fin_transactions_payment_method_check'
  ) then
    alter table fin_transactions
      add constraint fin_transactions_payment_method_check
      check (payment_method in ('cash', 'bank'));
  end if;
end $$;

-- Hạn mức ngân sách theo từng tháng, cho từng danh mục chi tiêu
create table if not exists fin_budgets (
  id          bigint generated always as identity primary key,
  month       text not null,              -- định dạng 'YYYY-MM'
  category    text not null,
  amount      numeric(14, 0) not null check (amount >= 0),
  created_at  timestamptz not null default now(),
  unique (month, category)
);

-- Lịch sử chuyển đổi giữa "Tiền mặt" và "Tài khoản ngân hàng" (VD: rút tiền mặt từ
-- ATM, hoặc nộp tiền mặt vào tài khoản). Đây KHÔNG phải là một khoản thu/chi —
-- chỉ tái phân bổ giữa 2 ví, nên không cộng/trừ vào tổng số dư.
create table if not exists fin_wallet_transfers (
  id          bigint generated always as identity primary key,
  date        date not null,
  -- 'bank_to_cash' = rút tiền mặt (tài khoản giảm, tiền mặt tăng)
  -- 'cash_to_bank' = nộp vào tài khoản (tiền mặt giảm, tài khoản tăng)
  direction   text not null check (direction in ('bank_to_cash', 'cash_to_bank')),
  amount      numeric(14, 0) not null check (amount > 0),
  note        text,
  created_at  timestamptz not null default now()
);

-- Index giúp truy vấn nhanh theo ngày, theo loại, theo tháng ngân sách
create index if not exists idx_fin_tx_date on fin_transactions (date);
create index if not exists idx_fin_tx_type on fin_transactions (type);
create index if not exists idx_fin_tx_payment_method on fin_transactions (payment_method);
create index if not exists idx_fin_budgets_month on fin_budgets (month);
create index if not exists idx_fin_subcategories_category_id on fin_subcategories (category_id);
create index if not exists idx_fin_wallet_transfers_date on fin_wallet_transfers (date);

-- ------------------------------------------------------------
-- BẢO MẬT (giống hệt cách làm với app "Việc Của Tôi")
-- App cá nhân dùng một mình → bật RLS, cho phép mọi thao tác qua anon key.
-- Nếu sau này thêm đăng nhập (Supabase Auth), hãy đổi policy để lọc theo user_id.
-- ------------------------------------------------------------

alter table fin_categories enable row level security;
alter table fin_subcategories enable row level security;
alter table fin_transactions enable row level security;
alter table fin_budgets enable row level security;
alter table fin_wallet_transfers enable row level security;

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

drop policy if exists "allow all on fin_wallet_transfers" on fin_wallet_transfers;
create policy "allow all on fin_wallet_transfers"
  on fin_wallet_transfers for all
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