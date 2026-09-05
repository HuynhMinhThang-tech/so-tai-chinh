import React, { useState, useMemo, useEffect, useLayoutEffect, useCallback, useRef } from "react";
import { createClient } from "@supabase/supabase-js";
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, LabelList,
} from "recharts";
import {
  Wallet, TrendingUp, TrendingDown, PiggyBank, ChevronDown, ChevronRight,
  Plus, Pencil, Trash2, LayoutGrid, GitBranch, NotebookPen, X, Check,
  Monitor, Smartphone, Target, Eye, EyeOff, Banknote, Landmark, ArrowLeftRight, AlertTriangle, Search, Download,
  LogOut, Mail, Lock, UserCircle2, Loader2, Sun, CloudSun, Moon,
  Users, ShieldCheck, ShieldOff, MailCheck,
} from "lucide-react";

// ---------- Theme: DÙNG CHUNG bảng màu & font với app "Việc Của Tôi" ----------
// (Cùng hex, cùng font Fraunces/Inter/IBM Plex Mono — để 2 app trông như một bộ sản phẩm)
const T = {
  page: "#EDEFE7",
  card: "#FFFFFF",
  ink: "#20261F",
  muted: "#646B5D",
  border: "#D9DCCE",
  green: "#2F6F5E",     // thu nhập / tích cực (= "teal" của app Việc Của Tôi)
  greenSoft: "#E1EDE8",
  sage: "#3E6B45",       // hạn mức ngân sách (= "done" của app Việc Của Tôi)
  sageSoft: "#E1EAE0",
  olive: "#B8792C",      // cảnh báo / trung tính (= "amber")
  oliveSoft: "#F3E7D2",
  rust: "#AD3B34",       // chi tiêu / vượt hạn mức (= "danger")
  rustSoft: "#F5E1DF",
};
const CHART_COLORS = ["#2F6F5E", "#B8792C", "#AD3B34", "#3E6B45", "#6E8F63", "#C4A24A", "#4F6B57"];

const FontImport = () => (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap');
    .ff-serif { font-family: 'Fraunces', Georgia, serif; }
    .ff-sans { font-family: 'Inter', system-ui, sans-serif; }
    .ff-mono { font-family: 'IBM Plex Mono', monospace; }
    .rounded-2xl.bg-white { box-shadow: 0 1px 2px rgba(32,38,31,0.06); border-radius: 10px !important; }
    .rounded-xl { border-radius: 8px !important; }
    /* ---- PWA trên iPhone: khi mở từ màn hình chính (standalone), chặn hiệu ứng
       cuộn nẩy (rubber-banding) làm lộ khoảng trắng phía sau, và chặn zoom 2 ngón tay ngoài ý muốn ---- */
    html, body {
      height: 100%;
      margin: 0;
      background: ${T.card};
      overscroll-behavior: none;
      touch-action: pan-x pan-y;
    }
  `}</style>
);

// ---------- Helpers ----------
const fmt = (n) => (n || 0).toLocaleString("vi-VN") + " đ";
const HIDDEN_MASK = "******";
const mfmt = (n, hidden) => (hidden ? HIDDEN_MASK : fmt(n));
const mShort = (v, hidden) => (hidden ? "***" : shortMoney(v));
const shortMoney = (v) => {
  if (!v) return "0";
  if (v >= 1000000) { const n = v / 1000000; return `${Number.isInteger(n) ? n : n.toFixed(1)}tr`; }
  if (v >= 1000) return `${Math.round(v / 1000)}k`;
  return `${v}`;
};
const niceMax = (max) => {
  if (max <= 0) return 0;
  const padded = max * 1.25;
  const magnitude = Math.pow(10, Math.floor(Math.log10(padded)) - 1);
  return Math.ceil(padded / magnitude) * magnitude;
};
const monthLabel = (ym) => { const [y, m] = ym.split("-"); return `Tháng ${parseInt(m, 10)}/${y}`; };
// TRƯỚC (lỗi): dùng new Date(y, m, 0).toISOString().slice(0,10) — toISOString() quy đổi thời
// điểm "00:00:00 giờ địa phương" sang UTC trước khi cắt chuỗi. Với múi giờ DƯƠNG so với UTC
// (VD Việt Nam, UTC+7), điều này làm NGÀY BỊ LÙI VỀ HÔM TRƯỚC (ngày 31 bị tính nhầm thành 30),
// khiến mọi phép tính "lũy kế tới hết tháng" (Số dư tháng này, Chưa phân bổ, ngày cuối cho phép
// lọc nhật ký, v.v.) VÔ TÌNH BỎ SÓT các khoản ghi đúng vào ngày cuối cùng của tháng — đây chính
// là nguyên nhân KPI "Số dư tháng này" không khớp với "Tiền mặt hiện có" + "Tiền trong tài khoản"
// (2 số này KHÔNG bị giới hạn theo cutoff nên vẫn cộng đủ, còn "Số dư tháng này" thì thiếu).
// SAU (đúng): dùng localISODate() — lấy ngày theo GIỜ ĐỊA PHƯƠNG, khớp với cách todayISO() và
// mọi nơi khác trong app đang tính ngày (xem giải thích chi tiết ở hàm localISODate bên dưới).
const monthEnd = (ym) => { const [y, m] = ym.split("-").map(Number); return localISODate(new Date(y, m, 0)); };
// Trả về tháng liền TRƯỚC "YYYY-MM" của một tháng "YYYY-MM" cho trước (VD: "2026-09" -> "2026-08").
function prevMonthOf(ym) {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 2, 1); // (m-1) là tháng hiện tại (0-indexed), trừ thêm 1 để lùi về tháng trước
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
// Số dư LŨY KẾ (tổng thu - tổng chi, cộng dồn MỌI giao dịch từ trước tới nay) tính đến hết một
// ngày cắt (cutoffDate, dạng "YYYY-MM-DD") cho trước. Dùng để lấy "số dư cuối tháng trước" — tức
// là số tiền còn lại ("carry-over") sẽ được mang sang tháng sau, mà KHÔNG ghi thành một giao dịch
// thật nào cả (chỉ là con số suy ra từ các giao dịch đã có).
function computeCumulativeBalanceUpTo(transactions, cutoffDate) {
  return transactions.reduce((sum, t) => {
    if (t.date > cutoffDate) return sum;
    return sum + (t.type === "income" ? t.amount : -t.amount);
  }, 0);
}
const dayLabel = (iso) => { const [y, m, d] = iso.split("-"); return `${parseInt(d, 10)} Thg ${parseInt(m, 10)}, ${y}`; };

// ============================================================
// CƠ CHẾ "CHƯA PHÂN BỔ" LŨY KẾ (kiểu YNAB — "Ready to Assign")
// ------------------------------------------------------------
// PHIÊN BẢN 1 (cũ hơn — theo NGÂN SÁCH ĐÃ LẬP của mọi tháng):
//     Chưa phân bổ(N) = Tổng thu nhập lũy kế − Tổng NGÂN SÁCH ĐÃ LẬP lũy kế (mọi tháng)
//   => Một khi đã lập hạn mức cho 1 danh mục, số tiền đó coi như "có chủ" VĨNH VIỄN — dù
//      tháng đó tiêu không hết, phần dư vẫn bị khoá cứng vào đúng danh mục/tháng cũ, không
//      bao giờ quay lại pool "Chưa phân bổ" để dùng cho việc khác nữa.
//
// PHIÊN BẢN 2 (MỚI — đúng tinh thần YNAB hơn, nhưng ĐƠN GIẢN HÓA phần carry-over):
//   YNAB "chuẩn" giữ số dư còn lại gắn liền với TỪNG danh mục qua các tháng. Ở đây ta làm
//   đơn giản hơn theo đúng ý bạn: KHÔNG giữ số dư gắn với danh mục cũ (vì mỗi tháng có thể
//   cần chi cho việc khác), mà gom hết phần CHƯA TIÊU của các tháng đã qua trả THẲNG về
//   pool "Chưa phân bổ" chung, sẵn sàng gán lại cho BẤT KỲ danh mục nào ở tháng hiện tại.
//
//   Quy tắc: một tháng chỉ coi là "đã đóng sổ" khi nó là tháng TRƯỚC tháng đang xem.
//   - Với các tháng ĐÃ ĐÓNG SỔ (m < tháng đang xem): dùng đúng số ĐÃ CHI THỰC TẾ (không phải
//     số đã lập ngân sách) để trừ vào pool — nên phần lập nhiều mà chưa xài hết sẽ tự động
//     "tan ra", quay lại Chưa phân bổ (nếu tiêu VƯỢT ngân sách thì ngược lại, pool bị trừ
//     nhiều hơn — đúng bản chất, vì tiền đó đã thực sự mất đi).
//   - Với THÁNG ĐANG XEM (tháng vẫn "mở", còn có thể tiếp tục chi trong tháng): vẫn dùng số
//     NGÂN SÁCH ĐÃ LẬP (không phải đã chi) — vì tháng chưa kết thúc, tiền đã gán coi như vẫn
//     đang "giữ chỗ" cho danh mục đó, CHƯA đến lúc hoàn trả về pool.
//
//     Chưa phân bổ(N) =  Thu nhập lũy kế tới hết tháng N
//                       − Tổng ĐÃ CHI THỰC TẾ của các tháng TRƯỚC tháng N
//                       − Ngân sách ĐÃ LẬP của riêng tháng N
//
//   Hệ quả (đúng như bạn kỳ vọng): ngay đầu một tháng mới, TRƯỚC KHI lập ngân sách gì cho
//   tháng đó, "Chưa phân bổ" sẽ bằng CHÍNH XÁC số dư thực tế đang có trong ví (tiền mặt +
//   tài khoản) tính tới lúc đó — vì lúc này mọi khoản dư của các tháng trước đều đã "được
//   thả tự do" trở lại, không còn khoản nào bị khoá cứng vào danh mục cũ nữa.
// ============================================================
function computeCumulativeUnallocated(transactions, budgets, month) {
  const monthStart = `${month}-01`;
  const monthEndCutoff = monthEnd(month); // "YYYY-MM-DD" cuối tháng đang xem

  // Tổng thu nhập từ trước tới hết tháng đang xem
  const cumulativeIncome = transactions.reduce(
    (s, t) => (t.type === "income" && t.date <= monthEndCutoff ? s + t.amount : s),
    0
  );
  // Tổng ĐÃ CHI THỰC TẾ của các tháng TRƯỚC tháng đang xem (các tháng đã "đóng sổ") — dùng
  // số thực chi, KHÔNG dùng số đã lập ngân sách, để phần lập dư không tiêu hết tự trả về pool.
  const spentBeforeThisMonth = transactions.reduce(
    (s, t) => (t.type === "expense" && t.date < monthStart ? s + t.amount : s),
    0
  );
  // Ngân sách đã lập CHO ĐÚNG tháng đang xem (tháng này vẫn đang "mở" nên vẫn coi là giữ chỗ)
  const currentMonthBudgeted = Object.values((budgets[month] || {}).categories || {}).reduce(
    (s, v) => s + v,
    0
  );
  return cumulativeIncome - spentBeforeThisMonth - currentMonthBudgeted;
}

// Tính vị trí nhãn % cho biểu đồ pie/donut, có so le để tránh đè chữ lên nhau
// khi nhiều lát cắt nhỏ nằm sát nhau (ví dụ các lát 4%, 2%, 1% liền kề).
const RADIAN = Math.PI / 180;
function buildPieLabelPositions(data, cx, cy, outerRadius) {
  const total = data.reduce((s, d) => s + (d.value || 0), 0) || 1;
  let acc = 0;
  const items = data.map((d) => {
    const midFrac = (acc + d.value / 2) / total;
    acc += d.value;
    const midAngle = 90 - midFrac * 360; // khớp với startAngle=90 / endAngle=-270 (theo chiều kim đồng hồ, bắt đầu từ 12 giờ)
    const anchorX = cx + outerRadius * Math.cos(-midAngle * RADIAN);
    const anchorY = cy + outerRadius * Math.sin(-midAngle * RADIAN);
    const labelRadius = outerRadius + 26;
    const x = cx + labelRadius * Math.cos(-midAngle * RADIAN);
    const y = cy + labelRadius * Math.sin(-midAngle * RADIAN);
    return { ...d, anchorX, anchorY, x, y, side: x >= cx ? "right" : "left" };
  });
  ["left", "right"].forEach((side) => {
    const group = items.filter((it) => it.side === side).sort((a, b) => a.y - b.y);
    const minGap = 15;
    for (let i = 1; i < group.length; i++) {
      if (group[i].y - group[i - 1].y < minGap) group[i].y = group[i - 1].y + minGap;
    }
  });
  return items;
}
// Trả về ngày YYYY-MM-DD theo GIỜ ĐỊA PHƯƠNG (không dùng toISOString() vì nó quy đổi
// sang UTC trước, khiến bất kỳ thời điểm nào trước giờ lệch UTC (VD: ở UTC+7, mọi thời điểm
// trước 7h sáng giờ VN) đều bị lùi về "hôm qua" — đây chính là lỗi ghi 00h05 ngày 9/8 nhưng
// bị tính vào ngày 8/8.
function pad2(n) { return String(n).padStart(2, "0"); }
function localISODate(dateLike = new Date()) {
  const d = dateLike instanceof Date ? dateLike : new Date(dateLike);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
const todayISO = () => localISODate(new Date());
const currentMonth = () => todayISO().slice(0, 7);
function colorFor(name, index) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return CHART_COLORS[Math.abs(h + (index || 0)) % CHART_COLORS.length];
}
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

// ============================================================
// ĐĂNG NHẬP / ĐĂNG KÝ / PHIÊN ĐĂNG NHẬP (Supabase Auth)
// ------------------------------------------------------------
// - Mật khẩu KHÔNG bao giờ được app tự lưu hay tự băm — toàn bộ việc băm mật khẩu (bcrypt) do
//   chính hệ thống Supabase Auth (GoTrue) đảm nhiệm ở phía server, app chỉ gửi mật khẩu dạng
//   plaintext qua kết nối HTTPS trong đúng 1 lần gọi API — kể cả người có quyền truy cập trực
//   tiếp vào Postgres (bảng auth.users) cũng chỉ nhìn thấy chuỗi hash, không thấy mật khẩu gốc.
// - Phiên đăng nhập: Supabase tự làm mới access token ngầm, nên nếu không tự giới hạn thêm thì
//   người dùng có thể ở trạng thái đăng nhập vô thời hạn. Ta tự lưu mốc thời gian đăng nhập vào
//   localStorage và tự động đăng xuất sau đúng 24 giờ (xem enforceSessionExpiry bên dưới).
// ============================================================
const SESSION_LOGIN_AT_KEY = "fin_app_login_at";
const SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 giờ

// Quy tắc mật khẩu: tối thiểu 8 ký tự, có ít nhất 1 chữ hoa, 1 chữ số, 1 ký tự đặc biệt.
const PASSWORD_RULE_REGEX = /^(?=.*[A-Z])(?=.*[0-9])(?=.*[^A-Za-z0-9\s]).{8,}$/;
const PASSWORD_RULE_HINT = "Tối thiểu 8 ký tự, gồm ít nhất 1 chữ HOA, 1 chữ số và 1 ký tự đặc biệt.";
function isValidPassword(pw) { return PASSWORD_RULE_REGEX.test(pw || ""); }
function isValidEmail(email) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((email || "").trim()); }

// "Good morning / afternoon / evening" — lấy trực tiếp giờ hệ thống của thiết bị đang mở app.
function getGreetingPeriod(date = new Date()) {
  const h = date.getHours();
  if (h >= 5 && h < 12) return { label: "Good morning", Icon: Sun, color: "#B8792C" };
  if (h >= 12 && h < 18) return { label: "Good afternoon", Icon: CloudSun, color: "#2F6F5E" };
  return { label: "Good evening", Icon: Moon, color: "#3E4C6B" };
}
function displayNameOf(session) {
  return session?.user?.user_metadata?.display_name || session?.user?.email || "bạn";
}

// ---------- Xuất file CSV (mở được bằng Excel / Google Sheets để tự phân tích) ----------
// Không cần cài thêm thư viện nào (không dùng xlsx) — chỉ dựng 1 chuỗi CSV thuần rồi tải về
// bằng Blob, cách này chạy được trên mọi trình duyệt, kể cả trên "app" (mobile).
function csvEscape(value) {
  const s = value === null || value === undefined ? "" : String(value);
  // Nếu ô có dấu phẩy, dấu ngoặc kép, hoặc xuống dòng thì phải bọc trong "..." và nhân đôi dấu " bên trong.
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
function downloadCsv(filename, headerRow, dataRows) {
  const lines = [headerRow, ...dataRows].map((row) => row.map(csvEscape).join(","));
  // Thêm BOM (\uFEFF) ở đầu file để Excel nhận đúng bảng mã UTF-8 — nếu không, tiếng Việt có
  // dấu (VD: "Ăn uống") sẽ bị hiển thị sai ký tự khi mở file bằng Excel trên Windows.
  const blob = new Blob(["\uFEFF" + lines.join("\r\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function detectDevice() {
  if (typeof window === "undefined") return "web";
  const ua = window.navigator?.userAgent || "";
  const isMobileUA = /Android|iPhone|iPad|iPod|Mobile|IEMobile/i.test(ua);
  const isNarrow = window.innerWidth < 820;
  return isMobileUA || isNarrow ? "app" : "web";
}

// Phân biệt "điện thoại thật" (kể cả khi cài PWA lẫn khi mở tab Safari bình thường trên máy) với
// việc chỉ đang bấm nút chuyển "App" để xem thử giao diện mobile trên trình duyệt máy tính.
// Trên điện thoại thật thì hiển thị full màn hình, không cần khung mockup điện thoại giả nữa.
function isRealMobileDevice() {
  if (typeof window === "undefined") return false;
  const ua = window.navigator?.userAgent || "";
  return /Android|iPhone|iPad|iPod|Mobile|IEMobile/i.test(ua);
}

const THIS_MONTH = currentMonth();

// ---- Kích thước dùng để căn chỉnh 2 cột trong tab "Ghi chép thu chi" (chỉ áp dụng bản web) ----
// Giá trị TẠM dùng cho thẻ "Lịch sử chuyển đổi" trong lúc chưa đo được chiều cao thật (render
// lần đầu) — chiều cao THẬT SỰ sau đó được đo trực tiếp từ DOM (vừa khít 5 dòng), xem WalletTransferHistory.
const WALLET_HISTORY_FALLBACK_HEIGHT = 200;
// Khoảng cách dọc giữa 2 thẻ trong 1 cột (khớp với class "space-y-4" = 1rem = 16px).
const COLUMN_GAP = 16;
// Chiều cao TỐI ĐA của danh sách giao dịch trong "Nhật ký" ở bản app — vượt quá chiều cao này thì
// tự cuộn bên trong thẻ, thay vì hiển thị hết và đẩy dài cả trang.
const MOBILE_JOURNAL_MAX_HEIGHT = 480;

// ---------- Supabase client (cùng cách cấu hình với app "Việc Của Tôi") ----------
// PHẢI đặt 2 biến môi trường sau trong .env (Vite) hoặc Environment Variables của Vercel:
//   VITE_SUPABASE_URL=https://xxxxx.supabase.co
//   VITE_SUPABASE_ANON_KEY=eyJhbGciOi...
// (Có thể dùng LẠI đúng project Supabase và đúng 2 biến môi trường bạn đã tạo cho app
// "Việc Của Tôi" — app này chỉ thêm 4 bảng mới, không đụng tới bảng tasks cũ.)
const SUPABASE_URL =
  (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_SUPABASE_URL) ||
  (typeof process !== "undefined" && process.env && process.env.REACT_APP_SUPABASE_URL) ||
  "";
const SUPABASE_ANON_KEY =
  (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_SUPABASE_ANON_KEY) ||
  (typeof process !== "undefined" && process.env && process.env.REACT_APP_SUPABASE_ANON_KEY) ||
  "";
const supabase =
  SUPABASE_URL && SUPABASE_ANON_KEY ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

// Chỉ true khi đang chạy `npm run dev` (Vite dev server) / môi trường development — dùng để ẩn
// hẳn nút chuyển đổi xem thử "Web ⇄ App" khỏi bản THẬT đã build/deploy cho người dùng cuối,
// vì nút đó chỉ có ích lúc code/xem thử giao diện, không nên xuất hiện khi dùng thực tế.
const IS_DEV =
  (typeof import.meta !== "undefined" && import.meta.env && !!import.meta.env.DEV) ||
  (typeof process !== "undefined" && process.env && process.env.NODE_ENV === "development");

/* ---------- mapping: hàng dữ liệu Supabase (snake_case) <-> object dùng trong UI (camelCase) ---------- */
function mapCategoriesFromRows(catRows, subRows) {
  const subsByCategory = new Map();
  (subRows || []).forEach((s) => {
    if (!subsByCategory.has(s.category_id)) subsByCategory.set(s.category_id, []);
    subsByCategory.get(s.category_id).push({ id: s.id, name: s.name });
  });
  const build = (type) =>
    (catRows || [])
      .filter((c) => c.type === type)
      .sort((a, b) => a.position - b.position || a.id - b.id)
      .map((c) => ({ id: c.id, name: c.name, subs: (subsByCategory.get(c.id) || []).map((s) => s.name) }));
  return { income: build("income"), expense: build("expense") };
}
function mapTransactionRow(row) {
  return {
    id: row.id,
    type: row.type,
    date: row.date,
    category: row.category,
    subcategory: row.subcategory || "",
    amount: Number(row.amount),
    paymentMethod: row.payment_method === "cash" ? "cash" : "bank",
  };
}
function mapWalletTransferRow(row) {
  return { id: row.id, date: row.date, direction: row.direction, amount: Number(row.amount), note: row.note || "", createdAt: row.created_at };
}
function mapBudgetTransferRow(row) {
  return {
    id: row.id,
    month: row.month,
    date: row.date,
    from: row.from_category,
    to: row.to_category,
    amount: Number(row.amount),
    createdAt: row.created_at,
  };
}
function mapBudgetsFromRows(rows) {
  const budgets = {};
  (rows || []).forEach((r) => {
    if (!budgets[r.month]) budgets[r.month] = { total: null, categories: {} };
    budgets[r.month].categories[r.category] = Number(r.amount);
  });
  return budgets;
}

// ---------- Small UI atoms ----------
// "breakdown" (tuỳ chọn): danh sách các dòng nhỏ giải thích các thành phần cộng lại thành
// "value" ở trên — dùng cho trường hợp "Tổng thu nhập tháng" giờ gồm cả số dư mang sang từ
// tháng trước cộng với thu nhập thật của tháng này, để người dùng nhìn ra ngay 2 phần đó.
// Thẻ luôn cao bằng NHAU trong cùng 1 hàng (nhờ "h-full" + grid cha có "items-stretch"), và nội
// dung được CĂN GIỮA theo chiều dọc ("justify-center") — nhờ vậy các thẻ không có "breakdown"
// (ngắn hơn) vẫn nhìn cân đối, không bị dồn hết lên trên rồi để trống mảng lớn phía dưới.
function KpiCard({ icon: Icon, label, value, accent, breakdown }) {
  return (
    <div
      className="rounded-2xl bg-white p-4 h-full flex flex-col justify-center"
      style={{ borderLeft: `3px solid ${accent}` }}
    >
      <div className="flex items-center gap-2 mb-2">
        <Icon size={15} style={{ color: accent }} />
      </div>
      <p className="text-2xl font-medium ff-mono" style={{ color: T.ink }}>{value}</p>
      <p className="text-xs mt-0.5" style={{ color: T.muted }}>{label}</p>
      {breakdown && breakdown.length > 0 && (
        <div className="mt-2 pt-2 space-y-0.5" style={{ borderTop: `1px dashed ${T.border}` }}>
          {breakdown.map((b, i) => (
            <div key={i} className="flex items-center justify-between text-[11px]">
              <span style={{ color: T.muted }}>{b.label}</span>
              <span className="ff-mono" style={{ color: T.ink }}>{b.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MonthPicker({ value, onChange, className = "" }) {
  return (
    <input
      type="month"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`rounded-lg border px-3 py-1.5 text-sm focus:outline-none ${className}`}
      style={{ borderColor: T.border, color: T.ink, background: T.card }}
    />
  );
}

function ViewToggle({ value, onChange, full = false }) {
  const opts = [
    { id: "web", label: "Web", icon: Monitor },
    { id: "app", label: "App", icon: Smartphone },
  ];
  return (
    <div className={`flex rounded-lg p-0.5 ${full ? "w-full" : ""}`} style={{ background: T.page, border: `1px solid ${T.border}` }}>
      {opts.map((o) => {
        const Icon = o.icon;
        const active = value === o.id;
        return (
          <button
            key={o.id}
            onClick={() => onChange(o.id)}
            className={`flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${full ? "flex-1" : ""}`}
            style={active ? { background: T.ink, color: "#fff" } : { color: T.muted }}
          >
            <Icon size={13} /> {o.label}
          </button>
        );
      })}
    </div>
  );
}

function IconViewToggle({ value, onChange }) {
  const opts = [
    { id: "web", icon: Monitor },
    { id: "app", icon: Smartphone },
  ];
  return (
    <div className="flex gap-1.5">
      {opts.map((o) => {
        const Icon = o.icon;
        const active = value === o.id;
        return (
          <button
            key={o.id}
            onClick={() => onChange(o.id)}
            aria-label={o.id}
            className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
            style={active ? { background: T.ink, color: "#fff" } : { background: T.card, border: `1px solid ${T.border}`, color: T.muted }}
          >
            <Icon size={15} />
          </button>
        );
      })}
    </div>
  );
}

function AmountVisibilityToggle({ hidden, onChange, full = false }) {
  return (
    <button
      onClick={() => onChange(!hidden)}
      aria-label={hidden ? "Hiện số tiền" : "Ẩn số tiền"}
      className={`flex items-center justify-center gap-1.5 rounded-lg text-xs font-medium transition-colors ${full ? "w-full py-1.5" : "w-8 h-8"}`}
      style={hidden ? { background: T.ink, color: "#fff" } : { background: T.card, border: `1px solid ${T.border}`, color: T.muted }}
    >
      {hidden ? <EyeOff size={full ? 13 : 15} /> : <Eye size={full ? 13 : 15} />}
      {full && <span>{hidden ? "Đã ẩn số tiền" : "Ẩn số tiền"}</span>}
    </button>
  );
}

// Panel xác nhận xoá dùng chung cho cả app — thay cho window.confirm() mặc định của trình
// duyệt (kiểu hộp thoại "localhost:xxxx says...") bằng một modal đồng bộ giao diện với app.
function ConfirmModal({ open, title = "Xác nhận xoá", message, confirmLabel = "Xoá", cancelLabel = "Hủy", onConfirm, onCancel }) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(32,38,31,0.45)" }}
      onClick={onCancel}
    >
      <div
        className="rounded-2xl bg-white p-5 w-full max-w-sm"
        style={{ boxShadow: "0 16px 40px rgba(32,38,31,0.25)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-sm font-semibold mb-2 ff-serif" style={{ color: T.ink, fontSize: 16 }}>{title}</h3>
        <p className="text-sm mb-5 leading-relaxed" style={{ color: T.muted }}>{message}</p>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border px-3.5 py-2 text-sm font-medium"
            style={{ borderColor: T.border, color: T.muted, background: T.card }}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-lg px-3.5 py-2 text-sm font-medium text-white"
            style={{ background: T.rust }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------- Tab 1: Overview ----------
function OverviewTab({ transactions, month, budgets, hideAmounts, viewMode = "web", walletBalances, isActive = true, cumulativeUnallocated, carryOverBalance = 0 }) {
  const mobile = viewMode === "app";
  // Kích thước chữ / góc nghiêng trục biểu đồ co giãn theo giao diện đang xem: ở "app"
  // (màn hình hẹp) chữ cần nhỏ hơn và nhãn trục X cần nghiêng nhiều hơn để không bị chật/đè chữ.
  const chartUI = {
    axisFont: mobile ? 9 : 11,
    // Nhãn tên danh mục ở trục X của biểu đồ "Ngân sách so với thực chi" — nhỏ hơn axisFont
    // thường một chút, vì tên danh mục (VD: "Cho ba má, bà ngoại, bé Ngọc") khá dài, dễ bị chật.
    categoryAxisFont: mobile ? 8 : 9.5,
    legendFont: mobile ? 10 : 12,
    labelFont: mobile ? 9 : 11,
    pctFont: mobile ? 10 : 12,
    xAngle: mobile ? -40 : -15,
    xHeight: mobile ? 68 : 50,
    chartHeight: mobile ? 240 : 280,
    pieHeight: mobile ? 200 : 220,
    // độ rộng 1 cột-ngày khi xem trên "app": đủ để 7 ngày gần nhất vừa khít vùng nhìn thấy
    dayColWidth: 46,
  };
  const txMonth = useMemo(() => transactions.filter((t) => t.date.startsWith(month)), [transactions, month]);
  const totalIncome = txMonth.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0);
  const totalExpense = txMonth.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0);
  // "Tổng thu nhập tháng" hiển thị ở KPI đầu trang = thu nhập THẬT của tháng này CỘNG THÊM số
  // dư còn lại từ cuối tháng trước ("carry-over") — số dư này KHÔNG phải một giao dịch thật,
  // chỉ là con số suy ra để biết tổng "nguồn tiền" đang có sẵn tính đến thời điểm hiện tại.
  const totalIncomeWithCarryOver = totalIncome + carryOverBalance;
  // KPI "Số dư" hiển thị ở đầu trang: số dư LŨY KẾ (tiền mặt + tài khoản CỘNG DỒN mọi giao dịch
  // từ trước tới nay) tính đến CUỐI tháng đang lọc — khớp đúng ý nghĩa với 2 ô "Tiền mặt hiện
  // có" / "Tiền trong tài khoản" bên dưới (vốn cũng là số lũy kế, không reset theo tháng).
  // Nhờ vậy khi xem một tháng chưa có giao dịch nào (VD tháng tới), KPI này vẫn hiện đúng số
  // tiền thực tế đang có trong ví — thay vì hiện 0đ gây hiểu lầm là "hết tiền".
  const cumulativeBalance = useMemo(() => {
    const cutoff = monthEnd(month); // "YYYY-MM-DD" cuối tháng đang lọc
    return transactions.reduce((sum, t) => {
      if (t.date > cutoff) return sum; // bỏ qua giao dịch của các tháng SAU tháng đang xem
      return sum + (t.type === "income" ? t.amount : -t.amount);
    }, 0);
  }, [transactions, month]);
  const balance = cumulativeBalance;

  const mb = budgets[month] || { total: null, categories: {} };

  // Phân bổ dòng tiền ra theo danh mục (lv1) — dùng SỐ NGÂN SÁCH đã đặt cho từng danh mục
  // (không phải số đã chi thực tế), cộng thêm "Chưa phân bổ" (thu nhập chưa được gán vào ngân sách nào).
  const byCategory = useMemo(() => {
    const budgetedCats = mb.categories || {};
    const totalBudgeted = Object.values(budgetedCats).reduce((s, v) => s + v, 0);
    // SAU (mới): dùng "Chưa phân bổ" LŨY KẾ (kiểu YNAB, xem computeCumulativeUnallocated) làm
    // mẫu số + lát cắt "Chưa phân bổ", thay vì chỉ so với thu nhập của riêng tháng này.
    // Nếu số lũy kế đang ÂM (đã lập ngân sách vượt quá số tiền sẵn có), không cộng thêm lát cắt
    // "Chưa phân bổ" nữa — phần vượt đó được thể hiện riêng ở badge "Ngân sách vượt thu nhập".
    const denom = cumulativeUnallocated > 0 ? totalBudgeted + cumulativeUnallocated : totalBudgeted;
    const list = Object.entries(budgetedCats).map(([name, value], i) => ({
      name, value, color: colorFor(name, i), pct: denom ? Math.round((value / denom) * 100) : 0,
    }));
    if (cumulativeUnallocated > 0) {
      list.push({ name: "Chưa phân bổ", value: cumulativeUnallocated, color: "#C9C4AE", pct: denom ? Math.round((cumulativeUnallocated / denom) * 100) : 0 });
    }
    list.sort((a, b) => b.value - a.value);
    return list;
  }, [mb, cumulativeUnallocated]);

  // Xếp hạng danh mục chi tiêu — dạng PHÂN CẤP: cấp 1 là danh mục (tổng toàn bộ chi tiêu
  // của danh mục đó), bấm vào để mở rộng xem cấp 2 (từng chi tiết bên trong danh mục đó).
  // Cả 2 cấp đều được sắp xếp giảm dần theo số tiền.
  const byCategoryDrill = useMemo(() => {
    const map = {};
    txMonth.filter((t) => t.type === "expense").forEach((t) => {
      if (!map[t.category]) map[t.category] = { name: t.category, value: 0, color: colorFor(t.category), subs: {} };
      map[t.category].value += t.amount;
      const sub = t.subcategory || "Khác";
      map[t.category].subs[sub] = (map[t.category].subs[sub] || 0) + t.amount;
    });
    return Object.values(map)
      .map((c) => ({
        ...c,
        subs: Object.entries(c.subs)
          .map(([name, value]) => ({ name, value }))
          .sort((a, b) => b.value - a.value),
      }))
      .sort((a, b) => b.value - a.value);
  }, [txMonth]);
  const [expandedRankCats, setExpandedRankCats] = useState(() => new Set());
  const toggleRankCat = (name) =>
    setExpandedRankCats((prev) => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  // Khi đổi tháng, thu gọn lại từ đầu — tránh giữ trạng thái mở rộng của danh mục thuộc tháng cũ.
  useEffect(() => { setExpandedRankCats(new Set()); }, [month]);

  // So sánh hạn mức ngân sách với số tiền đã chi thực tế, theo từng danh mục đã đặt hạn mức
  const budgetVsActual = useMemo(() => {
    const spentMap = {};
    txMonth.filter((t) => t.type === "expense").forEach((t) => { spentMap[t.category] = (spentMap[t.category] || 0) + t.amount; });
    return Object.entries(mb.categories).map(([name, budget]) => ({
      name,
      "Hạn mức": budget,
      "Đã chi": spentMap[name] || 0,
    }));
  }, [txMonth, mb]);
  const budgetChartMax = useMemo(
    () => niceMax(budgetVsActual.reduce((m, d) => Math.max(m, d["Hạn mức"], d["Đã chi"]), 0)),
    [budgetVsActual]
  );
  // TRƯỚC (cũ): unallocatedBudget = totalIncome(tháng này) − totalCatBudget(tháng này).
  // SAU (mới): dùng thẳng số "Chưa phân bổ" LŨY KẾ được App tính sẵn và truyền xuống —
  // xem computeCumulativeUnallocated ở đầu file để biết công thức đầy đủ.
  const unallocatedBudget = cumulativeUnallocated;

  const byDay = useMemo(() => {
    const days = {};
    txMonth.forEach((t) => {
      const d = t.date.slice(8, 10);
      days[d] = days[d] || { day: d, thu: 0, chi: 0 };
      if (t.type === "income") days[d].thu += t.amount; else days[d].chi += t.amount;
    });
    return Object.values(days).sort((a, b) => a.day.localeCompare(b.day));
  }, [txMonth]);

  // Trên "app": biểu đồ theo ngày cuộn ngang được, mặc định cuộn tới sát mép PHẢI để
  // luôn hiện đúng 7 ngày gần nhất tính từ hôm nay trước (các ngày đã sắp xếp tăng dần
  // nên ngày mới nhất luôn nằm ở bên phải cùng); cuộn sang trái để xem lại các ngày cũ hơn.
  const dayChartScrollRef = useRef(null);
  useEffect(() => {
    if (mobile && dayChartScrollRef.current) {
      dayChartScrollRef.current.scrollLeft = dayChartScrollRef.current.scrollWidth;
    }
  }, [mobile, byDay, month]);
  const dayChartWidth = Math.max(byDay.length * chartUI.dayColWidth, chartUI.dayColWidth * 7);

  // Khoá chiều cao của thẻ "Xếp hạng danh mục chi tiêu" đúng bằng chiều cao THẬT của thẻ
  // biểu đồ tròn bên cạnh (đo bằng ResizeObserver, cập nhật lại mỗi khi nội dung/kích thước
  // đổi) — để khung ngoài luôn bằng nhau, còn phần cuộn bên trong bị giới hạn cứng theo pixel
  // đó (không tự phình ra theo số lượng dòng như CSS grid auto-size vẫn làm).
  const pieCardRef = useRef(null);
  const [pieCardHeight, setPieCardHeight] = useState(null);
  useEffect(() => {
    const el = pieCardRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        // Khi tab này bị ẩn bằng display:none (chuyển sang tab khác nhưng vẫn giữ mounted),
        // trình duyệt báo chiều cao = 0 — bỏ qua giá trị 0 này, chỉ giữ lại chiều cao THẬT
        // gần nhất đã đo được, để khi quay lại tab "Tổng quan" không bị "quên" mất chiều cao
        // cũ trong khoảnh khắc trước khi layout mới kịp đo lại.
        const h = entry.target.offsetHeight;
        if (h > 0) setPieCardHeight(h);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // Khi tab "Tổng quan" chuyển từ ẩn (display:none) sang hiện lại, chủ động đo lại ngay
  // (thay vì chỉ trông chờ ResizeObserver, vốn có thể không bắn sự kiện kịp thời trên một số
  // trình duyệt/khung web) — đây chính là điểm khắc phục lỗi "quay lại tab Tổng quan bị tràn
  // danh sách xếp hạng" từng chỉ được sửa ở giao diện "app" mà chưa sửa ở giao diện web.
  useEffect(() => {
    if (!isActive) return;
    const raf = requestAnimationFrame(() => {
      if (pieCardRef.current) setPieCardHeight(pieCardRef.current.offsetHeight);
    });
    return () => cancelAnimationFrame(raf);
  }, [isActive]);

  return (
    <div className="space-y-5">
      {/* Trên bản web: "auto-rows-fr" ép TẤT CẢ các hàng KPI cao bằng nhau (hàng nào có nội
          dung dài nhất — VD hàng có "breakdown" của "Tổng thu nhập tháng" — sẽ quyết định
          chiều cao chung cho mọi hàng), nhìn cân xứng hơn. Trên "app" (mobile) GIỮ NGUYÊN như
          cũ — mỗi thẻ 1 hàng riêng (grid-cols-1) nên không cần và không áp dụng auto-rows-fr. */}
      <div className={`grid gap-3 items-stretch ${mobile ? "grid-cols-1" : "grid-cols-3 auto-rows-fr"}`}>
        <KpiCard
          icon={TrendingUp}
          label="Tổng thu nhập tháng"
          value={mfmt(totalIncomeWithCarryOver, hideAmounts)}
          accent={T.green}
          breakdown={
            carryOverBalance !== 0
              ? [
                  { label: carryOverBalance >= 0 ? "Số dư tháng trước" : "Nợ tháng trước", value: mfmt(Math.abs(carryOverBalance), hideAmounts) },
                  { label: "Thu nhập tháng này", value: mfmt(totalIncome, hideAmounts) },
                ]
              : null
          }
        />
        <KpiCard icon={PiggyBank} label={unallocatedBudget < 0 ? "Ngân sách vượt thu nhập" : "Chưa phân bổ"} value={mfmt(Math.abs(unallocatedBudget), hideAmounts)} accent={unallocatedBudget < 0 ? T.rust : T.olive} />
        <KpiCard icon={TrendingDown} label="Tổng chi tiêu" value={mfmt(totalExpense, hideAmounts)} accent={T.rust} />
        <KpiCard icon={Wallet} label="Số dư tháng này" value={mfmt(balance, hideAmounts)} accent={balance >= 0 ? T.green : T.rust} />
        {walletBalances && (
          <>
            <KpiCard icon={Banknote} label="Tiền mặt hiện có" value={mfmt(walletBalances.cash, hideAmounts)} accent={walletBalances.cash < 0 ? T.rust : T.olive} />
            <KpiCard icon={Landmark} label="Tiền trong tài khoản" value={mfmt(walletBalances.bank, hideAmounts)} accent={walletBalances.bank < 0 ? T.rust : T.green} />
          </>
        )}
      </div>

      <div className="rounded-2xl bg-white p-4">
        <h3 className="text-sm font-medium mb-2" style={{ color: T.ink }}>Thu / chi theo ngày</h3>
        {byDay.length === 0 ? (
          <p className="text-sm py-10 text-center" style={{ color: T.muted }}>Chưa có dữ liệu tháng này.</p>
        ) : mobile ? (
          <>
            {/* chú thích màu đặt cố định bên ngoài vùng cuộn ngang — vì <Legend> của Recharts sẽ
                canh giữa theo TOÀN BỘ chiều rộng biểu đồ (gồm cả phần đã cuộn qua), nên mặc định
                cuộn về bên phải sẽ làm nó bị khuất khỏi màn hình */}
            <div className="flex items-center gap-4 mb-2">
              <span className="flex items-center gap-1.5 text-xs" style={{ color: T.muted }}>
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: T.green }} /> Thu nhập
              </span>
              <span className="flex items-center gap-1.5 text-xs" style={{ color: T.muted }}>
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: T.olive }} /> Chi tiêu
              </span>
            </div>
            <div ref={dayChartScrollRef} style={{ width: "100%", height: chartUI.chartHeight, overflowX: "auto" }}>
              <BarChart
                data={byDay}
                width={dayChartWidth}
                height={chartUI.chartHeight}
                margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={T.border} />
                <XAxis dataKey="day" tick={{ fontSize: chartUI.axisFont, fill: T.muted }} />
                <YAxis width={44} tick={{ fontSize: chartUI.axisFont, fill: T.muted }} tickFormatter={(v) => mShort(v, hideAmounts)} />
                <Tooltip formatter={(v) => mfmt(v, hideAmounts)} />
                <Bar dataKey="thu" name="Thu nhập" fill={T.green} radius={[4, 4, 0, 0]} />
                <Bar dataKey="chi" name="Chi tiêu" fill={T.olive} radius={[4, 4, 0, 0]} />
              </BarChart>
            </div>
          </>
        ) : (
          <div style={{ width: "100%", height: chartUI.chartHeight }}>
            <ResponsiveContainer>
              <BarChart data={byDay} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={T.border} />
                <XAxis dataKey="day" tick={{ fontSize: chartUI.axisFont, fill: T.muted }} />
                <YAxis width={44} tick={{ fontSize: chartUI.axisFont, fill: T.muted }} tickFormatter={(v) => mShort(v, hideAmounts)} />
                <Tooltip formatter={(v) => mfmt(v, hideAmounts)} />
                <Legend wrapperStyle={{ fontSize: chartUI.legendFont, color: T.muted }} />
                <Bar dataKey="thu" name="Thu nhập" fill={T.green} radius={[4, 4, 0, 0]} />
                <Bar dataKey="chi" name="Chi tiêu" fill={T.olive} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div className={`grid gap-4 ${mobile ? "grid-cols-1" : "grid-cols-2"}`}>
        <div className="rounded-2xl bg-white p-4" ref={pieCardRef}>
          <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
            <h3 className="text-sm font-medium" style={{ color: T.ink }}>Phân bổ dòng tiền ra theo danh mục</h3>
            <span
              className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full"
              style={{
                color: unallocatedBudget < 0 ? T.rust : T.green,
                background: unallocatedBudget < 0 ? T.rustSoft : T.greenSoft,
              }}
            >
              {unallocatedBudget < 0 ? "Ngân sách vượt thu nhập" : "Chưa phân bổ"}:
              <span className="font-semibold">{mfmt(Math.abs(unallocatedBudget), hideAmounts)}</span>
            </span>
          </div>
          {byCategory.length === 0 ? (
            <p className="text-sm py-10 text-center" style={{ color: T.muted }}>Chưa có dữ liệu dòng tiền tháng này.</p>
          ) : (
            <>
              <div style={{ width: "100%", height: chartUI.pieHeight }}>
                <ResponsiveContainer>
                  <PieChart>
                    <Pie
                      data={byCategory}
                      dataKey="value"
                      nameKey="name"
                      startAngle={90}
                      endAngle={-270}
                      innerRadius={55}
                      outerRadius={80}
                      paddingAngle={2}
                      label={(props) => {
                        const { cx, cy, outerRadius: r, index } = props;
                        const positions = buildPieLabelPositions(byCategory, cx, cy, r);
                        const item = positions[index];
                        if (!item) return null;
                        const isRight = item.x >= cx;
                        const bendX = isRight ? item.x - 10 : item.x + 10;
                        return (
                          <g>
                            <polyline
                              points={`${item.anchorX},${item.anchorY} ${bendX},${item.y} ${item.x},${item.y}`}
                              fill="none"
                              stroke={T.border}
                              strokeWidth={1}
                            />
                            <text
                              x={item.x + (isRight ? 4 : -4)}
                              y={item.y}
                              textAnchor={isRight ? "start" : "end"}
                              dominantBaseline="central"
                              fontSize={chartUI.pctFont}
                              fill={T.muted}
                            >
                              {`${item.pct}%`}
                            </text>
                          </g>
                        );
                      }}
                      labelLine={false}
                    >
                      {byCategory.map((entry, i) => (<Cell key={i} fill={entry.color} />))}
                    </Pie>
                    <Tooltip
                      formatter={(value, name, props) => [`${mfmt(value, hideAmounts)} • ${props.payload.pct}%`, props.payload.name]}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className={`grid gap-x-6 gap-y-2 mt-3 pt-3 ${mobile ? "grid-cols-1" : "grid-cols-2"}`} style={{ borderTop: `1px solid ${T.border}` }}>
                {byCategory.map((c, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: c.color }} />
                    <span className="truncate" style={{ color: T.ink }}>{c.name}</span>
                    <span className="ml-auto pl-2 shrink-0 tabular-nums" style={{ color: T.muted }}>{mfmt(c.value, hideAmounts)}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <div
          className="rounded-2xl bg-white p-4 flex flex-col"
          style={pieCardHeight ? { height: pieCardHeight } : undefined}
        >
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium" style={{ color: T.ink }}>Xếp hạng danh mục chi tiêu</h3>
            {byCategoryDrill.length > 0 && (
              <button
                type="button"
                onClick={() =>
                  setExpandedRankCats((prev) =>
                    prev.size === byCategoryDrill.length ? new Set() : new Set(byCategoryDrill.map((c) => c.name))
                  )
                }
                className="text-xs font-medium shrink-0"
                style={{ color: T.green }}
              >
                {expandedRankCats.size === byCategoryDrill.length ? "Thu gọn tất cả" : "Mở rộng tất cả"}
              </button>
            )}
          </div>
          <div
            className="flex flex-col gap-4 overflow-y-auto pr-1 flex-1"
            style={{ minHeight: 0, justifyContent: byCategoryDrill.length > 0 ? "flex-start" : "flex-start" }}
          >
            {byCategoryDrill.map((c) => {
              const pct = totalExpense ? Math.round((c.value / totalExpense) * 100) : 0;
              const isOpen = expandedRankCats.has(c.name);
              return (
                <div key={c.name}>
                  <button type="button" onClick={() => toggleRankCat(c.name)} className="w-full text-left">
                    <div className="flex items-center gap-2 mb-1.5">
                      {isOpen ? <ChevronDown size={13} style={{ color: T.muted, flexShrink: 0 }} /> : <ChevronRight size={13} style={{ color: T.muted, flexShrink: 0 }} />}
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: c.color }} />
                      <span className="text-sm flex-1 truncate font-medium" style={{ color: T.ink }}>{c.name}</span>
                      <span className="text-xs font-medium shrink-0" style={{ color: T.muted }}>{pct}%</span>
                      <span className="text-sm font-medium shrink-0" style={{ color: T.ink }}>{mfmt(c.value, hideAmounts)}</span>
                    </div>
                    <div className="h-2 rounded-full overflow-hidden" style={{ background: T.page }}>
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: c.color }} />
                    </div>
                  </button>
                  {isOpen && (
                    <div className="mt-3 pl-4 space-y-3" style={{ borderLeft: `2px solid ${T.border}` }}>
                      {c.subs.map((s) => {
                        const subPct = c.value ? Math.round((s.value / c.value) * 100) : 0;
                        return (
                          <div key={s.name} className="pl-3">
                            <div className="flex items-center gap-2 mb-1.5">
                              <span className="text-xs flex-1 truncate" style={{ color: T.muted }}>{s.name}</span>
                              <span className="text-xs font-medium shrink-0" style={{ color: T.ink }}>{mfmt(s.value, hideAmounts)}</span>
                            </div>
                            <div className="h-1.5 rounded-full overflow-hidden" style={{ background: T.page }}>
                              <div className="h-full rounded-full" style={{ width: `${subPct}%`, background: c.color, opacity: 0.55 }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
            {byCategoryDrill.length === 0 && <p className="text-sm" style={{ color: T.muted }}>Chưa có dữ liệu.</p>}
          </div>
        </div>
      </div>

      <div className="rounded-2xl bg-white p-4">
        <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
          <h3 className="text-sm font-medium" style={{ color: T.ink }}>Ngân sách so với thực chi — {monthLabel(month)}</h3>
          <span
            className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full"
            style={{
              color: unallocatedBudget < 0 ? T.rust : T.green,
              background: unallocatedBudget < 0 ? T.rustSoft : T.greenSoft,
            }}
          >
            {unallocatedBudget < 0 ? "Ngân sách vượt thu nhập" : "Chưa phân bổ"}:
            <span className="font-semibold">{mfmt(Math.abs(unallocatedBudget), hideAmounts)}</span>
          </span>
        </div>
        {budgetVsActual.length === 0 ? (
          <p className="text-sm py-10 text-center" style={{ color: T.muted }}>Chưa đặt hạn mức ngân sách cho danh mục nào trong tháng này.</p>
        ) : (
          <div style={{ width: "100%", height: chartUI.chartHeight }}>
            <ResponsiveContainer>
              <BarChart data={budgetVsActual} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={T.border} />
                <XAxis dataKey="name" tick={{ fontSize: chartUI.categoryAxisFont, fill: T.muted }} interval={0} angle={chartUI.xAngle} textAnchor="end" height={chartUI.xHeight} />
                <YAxis width={44} domain={[0, budgetChartMax]} tick={{ fontSize: chartUI.axisFont, fill: T.muted, fontFamily: "'Inter', system-ui, sans-serif" }} tickFormatter={(v) => mShort(v, hideAmounts)} />
                <Tooltip formatter={(v) => mfmt(v, hideAmounts)} />
                <Legend wrapperStyle={{ fontSize: chartUI.legendFont, color: T.muted, fontFamily: "'Inter', system-ui, sans-serif" }} />
                <Bar dataKey="Hạn mức" fill={T.sage} radius={[4, 4, 0, 0]}>
                  <LabelList dataKey="Hạn mức" position="top" formatter={(v) => mShort(v, hideAmounts)} style={{ fontSize: chartUI.labelFont, fill: T.muted, fontFamily: "'Inter', system-ui, sans-serif" }} />
                </Bar>
                <Bar dataKey="Đã chi" fill={T.rust} radius={[4, 4, 0, 0]}>
                  <LabelList dataKey="Đã chi" position="top" formatter={(v) => mShort(v, hideAmounts)} style={{ fontSize: chartUI.labelFont, fill: T.rust, fontFamily: "'Inter', system-ui, sans-serif" }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------- Tab 2: Cash flow tree ----------
function TreeStyles() {
  return (
    <style>{`
      .fin-tree, .fin-tree ul { display:flex; justify-content:center; }
      .fin-tree ul { padding-top:24px; position:relative; }
      .fin-tree li { list-style:none; position:relative; padding:24px 10px 0 10px; display:flex; flex-direction:column; align-items:center; }
      .fin-tree li::before, .fin-tree li::after { content:''; position:absolute; top:0; right:50%; width:50%; height:24px; border-top:2px solid ${T.border}; }
      .fin-tree li::after { right:auto; left:50%; border-left:2px solid ${T.border}; }
      .fin-tree li:only-child::before, .fin-tree li:only-child::after { display:none; }
      .fin-tree li:only-child { padding-top:0; }
      .fin-tree li:first-child::before, .fin-tree li:last-child::after { border:0 none; }
      .fin-tree ul ul::before { content:''; position:absolute; top:0; left:50%; width:0; height:24px; border-left:2px solid ${T.border}; }
    `}</style>
  );
}

function NodeBox({ children, className = "", style }) {
  return <div className={`rounded-xl px-3 py-2 text-left min-w-[140px] ${className}`} style={style}>{children}</div>;
}

function CashFlowTab({ transactions, month, budgets, viewMode = "web", hideAmounts, cumulativeUnallocated, carryOverBalance = 0 }) {
  const txMonth = useMemo(() => transactions.filter((t) => t.date.startsWith(month)), [transactions, month]);
  const totalIncome = txMonth.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0);
  const totalExpense = txMonth.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0);
  // Tổng "nguồn tiền vào" hiển thị ở gốc cây = thu nhập thật của tháng này CỘNG số dư mang
  // sang từ cuối tháng trước (carry-over) — chỉ là con số hiển thị, KHÔNG cộng vào số dư ví thật.
  const totalIncomeWithCarryOver = totalIncome + carryOverBalance;
  const mb = budgets[month] || { total: null, categories: {} };

  const incomeByCat = useMemo(() => {
    const map = {};
    txMonth.filter((t) => t.type === "income").forEach((t) => { map[t.category] = (map[t.category] || 0) + t.amount; });
    const list = Object.entries(map).map(([name, value]) => ({ name, value }));
    // Nhánh ẢO đại diện cho số dư còn lại từ tháng trước — đây CHỈ LÀ CƠ CHẾ HIỂN THỊ để tổng
    // "dòng tiền vào" của tháng phản ánh đúng số tiền thực sự đang sẵn có, KHÔNG phải một
    // giao dịch thật và không được ghi vào fin_transactions / không cộng vào walletBalances.
    if (carryOverBalance !== 0) {
      list.unshift({
        name: carryOverBalance >= 0 ? "Số dư tháng trước" : "Nợ tháng trước",
        value: carryOverBalance,
        isCarryOver: true,
      });
    }
    return list;
  }, [txMonth, carryOverBalance]);

  // TRƯỚC (cũ): "Chưa phân bổ" = thu nhập tháng này − tổng ngân sách đã lập cho tháng này.
  // SAU (mới): dùng "Chưa phân bổ" LŨY KẾ (kiểu YNAB) do App tính sẵn — khớp với OverviewTab
  // và BudgetTab, xem computeCumulativeUnallocated ở đầu file.
  const unallocated = cumulativeUnallocated;

  const expenseByCat = useMemo(() => {
    const map = {};
    // Khởi tạo từ TẤT CẢ danh mục đã lập ngân sách cho tháng này (kể cả khi chưa chi đồng nào) —
    // để "Dòng tiền ra" luôn phản ánh đầy đủ kế hoạch ngân sách, không chỉ những gì đã thực chi.
    // Danh mục chưa chi gì sẽ hiện với "còn lại" = đúng bằng hạn mức đã đặt.
    Object.keys(mb.categories).forEach((name) => {
      map[name] = { name, value: 0, items: [] };
    });
    txMonth.filter((t) => t.type === "expense").forEach((t) => {
      if (!map[t.category]) map[t.category] = { name: t.category, value: 0, items: [] };
      map[t.category].value += t.amount;
      map[t.category].items.push(t);
    });
    Object.values(map).forEach((c) => {
      c.items.sort((a, b) => a.date.localeCompare(b.date));
      // Gộp các khoản chi trong cùng danh mục theo NGÀY — bấm vào danh mục sẽ ra danh sách
      // ngày (gọn hơn nhiều so với liệt kê từng khoản lẻ), bấm tiếp vào 1 ngày mới xem chi
      // tiết các khoản trong đúng ngày đó.
      const byDayMap = {};
      c.items.forEach((it) => {
        if (!byDayMap[it.date]) byDayMap[it.date] = { date: it.date, items: [], total: 0 };
        byDayMap[it.date].items.push(it);
        byDayMap[it.date].total += it.amount;
      });
      c.itemsByDay = Object.values(byDayMap).sort((a, b) => a.date.localeCompare(b.date));
    });
    // Sắp xếp theo hạn mức ngân sách giảm dần trước (ổn định kể cả với danh mục chưa phát sinh chi
    // tiêu nào), rồi mới tới số đã chi cho các danh mục không có ngân sách (phát sinh ngoài kế hoạch).
    const list = Object.values(map).sort((a, b) => {
      const budgetA = mb.categories[a.name];
      const budgetB = mb.categories[b.name];
      if (budgetA != null && budgetB != null) return budgetB - budgetA;
      if (budgetA != null) return -1;
      if (budgetB != null) return 1;
      return b.value - a.value;
    });
    // Dòng tiền ra luôn phải bằng dòng tiền vào: phần thu nhập chưa chi tiêu (hoặc chi vượt thu nhập)
    // luôn xuất hiện như một danh mục lv1, và tự động co lại khi bạn ghi thêm chi tiêu.
    list.push({ name: "Chưa phân bổ", value: unallocated, items: [], itemsByDay: [], isUnallocated: true });
    return list;
  }, [txMonth, unallocated, mb]);

  const [expanded, setExpanded] = useState(() => new Set());
  const toggle = (name) => setExpanded((prev) => { const next = new Set(prev); next.has(name) ? next.delete(name) : next.add(name); return next; });
  // Cấp 2: ngày nào đang được mở rộng bên trong 1 danh mục — key dạng "TênDanhMục::YYYY-MM-DD"
  // để cùng 1 ngày ở 2 danh mục khác nhau không bị đụng trạng thái mở/đóng của nhau.
  const [expandedDays, setExpandedDays] = useState(() => new Set());
  const toggleDay = (key) => setExpandedDays((prev) => { const next = new Set(prev); next.has(key) ? next.delete(key) : next.add(key); return next; });
  useEffect(() => { setExpanded(new Set()); setExpandedDays(new Set()); }, [month]);

  if (viewMode === "app") {
    return (
      <div className="space-y-4">
        <div className="rounded-2xl bg-white p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium" style={{ color: T.ink }}>Dòng tiền vào</h3>
            <span className="text-sm font-semibold" style={{ color: T.green }}>{mfmt(totalIncomeWithCarryOver, hideAmounts)}</span>
          </div>
          {totalIncomeWithCarryOver === 0 ? (
            <p className="text-sm text-center py-6" style={{ color: T.muted }}>Chưa ghi nhận thu nhập nào trong tháng này.</p>
          ) : (
            <div className="space-y-2">
              {incomeByCat.map((c) => (
                <div
                  key={c.name}
                  className="flex items-center justify-between rounded-xl px-3 py-2.5"
                  style={c.isCarryOver ? { border: `1.5px dashed ${T.olive}`, background: T.oliveSoft } : { background: T.greenSoft }}
                >
                  <span className="text-sm" style={{ color: c.isCarryOver ? T.olive : T.green }}>{c.name}</span>
                  <span className="text-sm font-semibold" style={{ color: T.ink }}>{mfmt(c.isCarryOver ? Math.abs(c.value) : c.value, hideAmounts)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-2xl bg-white p-4">
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-sm font-medium" style={{ color: T.ink }}>Dòng tiền ra</h3>
            <span className="text-sm font-semibold" style={{ color: T.rust }}>{mfmt(totalExpense, hideAmounts)}</span>
          </div>
          {totalIncomeWithCarryOver === 0 && totalExpense === 0 ? (
            <p className="text-sm text-center py-6" style={{ color: T.muted }}>Chưa ghi nhận dòng tiền nào trong tháng này.</p>
          ) : (
            <div className="space-y-2.5">
              {expenseByCat.map((c) => {
                if (c.isUnallocated) {
                  const isNegative = c.value < 0;
                  const uColor = isNegative ? T.rust : "#B8B29A";
                  return (
                    <div key={c.name} className="flex items-center justify-between rounded-xl px-3 py-2.5" style={{ border: `1px solid ${T.border}`, borderLeft: `4px solid ${uColor}` }}>
                      <span className="text-sm" style={{ color: T.muted }}>{isNegative ? "Ngân sách vượt thu nhập" : "Chưa phân bổ"}</span>
                      <span className="text-sm font-semibold" style={{ color: isNegative ? T.rust : T.ink }}>{mfmt(Math.abs(c.value), hideAmounts)}</span>
                    </div>
                  );
                }
                const isOpen = expanded.has(c.name);
                const color = colorFor(c.name);
                const catBudget = mb.categories[c.name];
                const remaining = catBudget != null ? catBudget - c.value : null;
                return (
                  <div key={c.name} className="rounded-xl overflow-hidden" style={{ border: `1px solid ${T.border}`, borderLeft: `4px solid ${color}` }}>
                    <button onClick={() => toggle(c.name)} className="w-full flex items-center justify-between px-3 py-2.5 text-left">
                      <div className="flex items-center gap-1.5 min-w-0">
                        {isOpen ? <ChevronDown size={13} style={{ color: T.muted }} /> : <ChevronRight size={13} style={{ color: T.muted }} />}
                        <span className="text-sm truncate" style={{ color: T.ink }}>{c.name}</span>
                      </div>
                      <div className="text-right shrink-0">
                        {catBudget != null && <p className="text-[11px]" style={{ color: T.muted }}>hạn mức {mfmt(catBudget, hideAmounts)}</p>}
                        <p className="text-sm font-semibold" style={{ color: remaining != null && remaining < 0 ? T.rust : T.ink }}>
                          {mfmt(remaining != null ? remaining : c.value, hideAmounts)}
                        </p>
                      </div>
                    </button>
                    {isOpen && (
                      <div className="px-3 pb-2.5 space-y-1.5" style={{ borderTop: `1px solid ${T.border}` }}>
                        {c.itemsByDay.length === 0 ? (
                          <p className="text-xs pt-1.5" style={{ color: T.muted }}>Chưa có khoản chi nào trong danh mục này.</p>
                        ) : (
                          c.itemsByDay.map((day) => {
                            const dayKey = `${c.name}::${day.date}`;
                            const dayOpen = expandedDays.has(dayKey);
                            return (
                              <div key={day.date} className="pt-1.5">
                                <button type="button" onClick={() => toggleDay(dayKey)} className="w-full flex items-center justify-between text-xs">
                                  <span className="flex items-center gap-1" style={{ color: T.muted }}>
                                    {dayOpen ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                                    Ngày {day.date.slice(8, 10)} · {day.items.length} khoản
                                  </span>
                                  <span className="font-medium" style={{ color: T.ink }}>{mfmt(day.total, hideAmounts)}</span>
                                </button>
                                {dayOpen && (
                                  <div className="mt-1.5 pl-4 space-y-1.5" style={{ borderLeft: `2px solid ${T.border}` }}>
                                    {day.items.map((it) => (
                                      <div key={it.id} className="flex items-center justify-between text-xs pl-2">
                                        <span style={{ color: T.muted }}>{it.subcategory || "—"}</span>
                                        <span style={{ color: T.ink }}>{mfmt(it.amount, hideAmounts)}</span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            );
                          })
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <TreeStyles />

      <div className="rounded-2xl bg-white p-5 overflow-x-auto">
        <div className="mb-4">
          <h3 className="text-sm font-medium" style={{ color: T.ink }}>Dòng tiền vào — {monthLabel(month)}</h3>
        </div>
        {totalIncomeWithCarryOver === 0 ? (
          <p className="text-sm text-center py-8" style={{ color: T.muted }}>Chưa ghi nhận thu nhập nào trong tháng này.</p>
        ) : (
          <div className="fin-tree min-w-max mx-auto" style={{ transform: "scaleY(-1)" }}>
            <ul><li>
              <NodeBox className="min-w-[170px]" style={{ background: T.green, color: "#fff", transform: "scaleY(-1)" }}>
                <p className="text-xs opacity-90">Tổng thu nhập</p>
                <p className="font-semibold">{mfmt(totalIncomeWithCarryOver, hideAmounts)}</p>
              </NodeBox>
              <ul>
                {incomeByCat.map((c) => (
                  <li key={c.name}>
                    <NodeBox
                      style={
                        c.isCarryOver
                          ? { background: T.oliveSoft, border: `1.5px dashed ${T.olive}`, transform: "scaleY(-1)" }
                          : { background: T.greenSoft, transform: "scaleY(-1)" }
                      }
                    >
                      <p className="text-xs" style={{ color: c.isCarryOver ? T.olive : T.green }}>{c.name}</p>
                      <p className="text-sm font-semibold" style={{ color: T.ink }}>{mfmt(c.isCarryOver ? Math.abs(c.value) : c.value, hideAmounts)}</p>
                    </NodeBox>
                  </li>
                ))}
              </ul>
            </li></ul>
          </div>
        )}
      </div>

      <div className="rounded-2xl bg-white p-5 overflow-x-auto">
        <div className="mb-4">
          <h3 className="text-sm font-medium" style={{ color: T.ink }}>Dòng tiền ra — {monthLabel(month)}</h3>
        </div>
        {totalIncomeWithCarryOver === 0 && totalExpense === 0 ? (
          <p className="text-sm text-center py-8" style={{ color: T.muted }}>Chưa ghi nhận dòng tiền nào trong tháng này.</p>
        ) : (
          <div className="fin-tree min-w-max mx-auto">
            <ul><li>
              <NodeBox className="min-w-[170px]" style={{ background: T.rust, color: "#fff" }}>
                <p className="text-xs opacity-90">Tổng dòng tiền ra</p>
                <p className="font-semibold">{mfmt(totalIncomeWithCarryOver, hideAmounts)}</p>
              </NodeBox>
              <ul>
                {expenseByCat.map((c) => {
                  if (c.isUnallocated) {
                    const isNegative = c.value < 0;
                    const uColor = isNegative ? T.rust : "#B8B29A";
                    return (
                      <li key={c.name}>
                        <NodeBox className="bg-white" style={{ border: `1px solid ${T.border}`, borderLeft: `4px solid ${uColor}` }}>
                          <p className="text-xs" style={{ color: T.muted }}>{isNegative ? "Ngân sách vượt thu nhập" : "Chưa phân bổ"}</p>
                          <p className="text-lg font-semibold mt-0.5" style={{ color: isNegative ? T.rust : T.ink }}>{mfmt(Math.abs(c.value), hideAmounts)}</p>
                        </NodeBox>
                      </li>
                    );
                  }
                  const isOpen = expanded.has(c.name);
                  const color = colorFor(c.name);
                  const catBudget = mb.categories[c.name];
                  const remaining = catBudget != null ? catBudget - c.value : null;
                  return (
                    <li key={c.name}>
                      <button onClick={() => toggle(c.name)} className="block">
                        <NodeBox className="bg-white transition-colors" style={{ border: `1px solid ${T.border}`, borderLeft: `4px solid ${color}` }}>
                          {catBudget != null && (
                            <p className="text-[11px] italic" style={{ color: T.muted }}>{mfmt(catBudget, hideAmounts)}</p>
                          )}
                          <div className="flex items-center gap-1 mt-0.5">
                            {isOpen ? <ChevronDown size={13} style={{ color: T.muted }} /> : <ChevronRight size={13} style={{ color: T.muted }} />}
                            <p className="text-xs" style={{ color: T.muted }}>{c.name}</p>
                          </div>
                          <p className="text-lg font-semibold mt-0.5" style={{ color: remaining != null ? (remaining < 0 ? T.rust : T.ink) : T.ink }}>
                            {mfmt(remaining != null ? remaining : c.value, hideAmounts)}
                          </p>
                        </NodeBox>
                      </button>

                      {isOpen && (
                        <div className="mt-3 pl-5 border-l-2 text-left" style={{ borderColor: T.border }}>
                          {c.itemsByDay.length === 0 ? (
                            <p className="text-xs" style={{ color: T.muted }}>Chưa có khoản chi nào trong danh mục này.</p>
                          ) : (
                            c.itemsByDay.map((day) => {
                              const dayKey = `${c.name}::${day.date}`;
                              const dayOpen = expandedDays.has(dayKey);
                              return (
                                <div key={day.date} className="relative pl-5 pt-2 first:pt-0">
                                  <span className="absolute left-[-1px] top-5 w-5 h-px" style={{ background: T.border }} />
                                  <button type="button" onClick={() => toggleDay(dayKey)} className="block">
                                    <NodeBox className="w-full max-w-xs bg-white transition-colors" style={{ border: `1px solid ${T.border}` }}>
                                      <div className="flex items-center gap-1">
                                        {dayOpen ? <ChevronDown size={12} style={{ color: T.muted }} /> : <ChevronRight size={12} style={{ color: T.muted }} />}
                                        <p className="text-[11px] font-medium" style={{ color: T.ink }}>Ngày {day.date.slice(8, 10)}</p>
                                        <span className="text-[10px] ml-auto" style={{ color: T.muted }}>{day.items.length} khoản</span>
                                      </div>
                                      <p className="text-xs font-semibold mt-0.5" style={{ color: T.ink }}>{mfmt(day.total, hideAmounts)}</p>
                                    </NodeBox>
                                  </button>

                                  {dayOpen && (
                                    <div className="mt-2 pl-5 border-l-2 text-left" style={{ borderColor: T.border }}>
                                      {day.items.map((it) => (
                                        <div key={it.id} className="relative pl-5 pt-2 first:pt-0">
                                          <span className="absolute left-[-1px] top-5 w-5 h-px" style={{ background: T.border }} />
                                          <NodeBox className="w-full max-w-xs" style={{ background: T.page }}>
                                            <p className="text-xs font-medium truncate" style={{ color: T.ink }}>{it.subcategory || "—"}</p>
                                            <p className="text-xs" style={{ color: T.muted }}>{mfmt(it.amount, hideAmounts)}</p>
                                          </NodeBox>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              );
                            })
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </li></ul>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------- Tab: Budget (lập ngân sách) ----------
// Panel chuyển ngân sách qua lại giữa 2 danh mục (VD: Mua sắm còn dư 84k -> chuyển thẳng
// sang Di chuyển), thay vì phải xoá hạn mức cũ -> chờ về "Chưa phân bổ" -> rồi lập lại hạn
// mức mới cho danh mục kia. Số tiền tối đa được phép chuyển đi = phần "còn lại" (hạn mức
// đã lập trừ đi số đã chi) của danh mục nguồn — phần đã chi rồi thì không thể chuyển đi nữa.
function TransferBudgetModal({ open, fromName, maxAmount, targetOptions, hideAmounts, onConfirm, onCancel }) {
  const [amount, setAmount] = useState("");
  const [to, setTo] = useState("");
  useEffect(() => {
    if (open) { setAmount(""); setTo(""); }
  }, [open, fromName]);
  if (!open) return null;

  const formatAmount = (raw) => (raw ? Number(raw).toLocaleString("vi-VN") : "");
  const amountNum = Number(amount) || 0;
  const exceeds = amount !== "" && amountNum > maxAmount;
  const canSubmit = amountNum > 0 && !exceeds && !!to;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(32,38,31,0.45)" }}
      onClick={onCancel}
    >
      <div
        className="rounded-2xl bg-white p-5 w-full max-w-sm"
        style={{ boxShadow: "0 16px 40px rgba(32,38,31,0.25)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-sm font-semibold mb-1 ff-serif flex items-center gap-1.5" style={{ color: T.ink, fontSize: 16 }}>
          <ArrowLeftRight size={15} style={{ color: T.green }} /> Chuyển ngân sách
        </h3>
        <p className="text-xs mb-4 leading-relaxed" style={{ color: T.muted }}>
          Từ <span className="font-medium" style={{ color: T.ink }}>{fromName}</span> — khả dụng để chuyển:{" "}
          <span className="font-semibold" style={{ color: maxAmount > 0 ? T.green : T.rust }}>{mfmt(Math.max(maxAmount, 0), hideAmounts)}</span>
        </p>

        {maxAmount <= 0 ? (
          <p className="text-xs mb-4" style={{ color: T.muted }}>
            Danh mục này không còn khoản dư nào để chuyển đi (đã chi hết hoặc vượt hạn mức).
          </p>
        ) : (
          <div className="space-y-3">
            <div>
              <label className="text-xs mb-1 block" style={{ color: T.muted }}>Số tiền chuyển</label>
              <div className="relative">
                <input
                  type="text" inputMode="numeric" value={formatAmount(amount)}
                  onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))}
                  placeholder="0" className="w-full rounded-lg border pl-3 pr-9 py-2 text-sm focus:outline-none"
                  style={{ borderColor: exceeds ? T.rust : T.border, color: T.ink, background: T.card }}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs" style={{ color: T.muted }}>đ</span>
              </div>
              {exceeds && <p className="text-[11px] mt-1" style={{ color: T.rust }}>Vượt quá số tiền khả dụng.</p>}
            </div>
            <div>
              <label className="text-xs mb-1 block" style={{ color: T.muted }}>Chuyển sang danh mục</label>
              <SelectWithDelete value={to} onChange={setTo} options={targetOptions} placeholder="— Chọn danh mục đích —" />
              {targetOptions.length === 0 && (
                <p className="text-[11px] mt-1.5" style={{ color: T.muted }}>Chưa có danh mục nào khác đang được lập ngân sách để chuyển đến.</p>
              )}
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2 mt-5">
          <button type="button" onClick={onCancel} className="rounded-lg border px-3.5 py-2 text-sm font-medium" style={{ borderColor: T.border, color: T.muted, background: T.card }}>
            Hủy
          </button>
          {maxAmount > 0 && (
            <button
              type="button"
              disabled={!canSubmit}
              onClick={() => onConfirm({ amount: amountNum, to })}
              className="rounded-lg px-3.5 py-2 text-sm font-medium text-white disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
              style={{ background: T.green }}
            >
              <ArrowLeftRight size={14} /> Chuyển
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// Lịch sử các lượt "chuyển ngân sách" giữa 2 danh mục trong tháng đang xem — hiển thị gọn bên
// dưới danh sách ngân sách theo danh mục, giống cách "Lịch sử chuyển đổi tiền mặt ⇄ tài khoản"
// hiển thị bên dưới nhật ký ở tab "Ghi chép thu chi". Dùng chung cho cả giao diện Web lẫn App —
// chỉ khác chiều cao tối đa hiển thị trước khi cuộn (App thấp hơn cho vừa màn hình điện thoại).
function BudgetTransferHistory({ transfers, onDelete, hideAmounts, mobile }) {
  const list = transfers || [];
  const maxHeight = mobile ? 220 : 300;
  return (
    <div className="rounded-2xl bg-white p-4">
      <div className="flex items-center gap-1.5 mb-2.5">
        <ArrowLeftRight size={13} style={{ color: T.muted }} />
        <h3 className="text-xs font-medium" style={{ color: T.ink }}>Lịch sử chuyển ngân sách</h3>
      </div>
      {list.length === 0 ? (
        <p className="text-xs py-2" style={{ color: T.muted }}>Chưa có lượt chuyển ngân sách nào trong tháng này.</p>
      ) : (
        <div className={`space-y-2 overflow-y-auto pr-1 ${mobile ? "" : ""}`} style={{ maxHeight }}>
          {list.map((t, idx) => (
            <div
              key={t.id}
              className={`flex items-center gap-2 text-xs ${mobile ? "flex-wrap" : ""}`}
              style={idx < list.length - 1 ? { paddingBottom: 8, borderBottom: `1px solid ${T.border}` } : undefined}
            >
              <span className="shrink-0 ff-mono" style={{ color: T.muted }}>
                {t.date ? `Ngày ${t.date.slice(8, 10)}` : ""}
              </span>
              <span className={`flex items-center gap-1.5 min-w-0 ${mobile ? "w-full order-3 mt-0.5" : "flex-1"}`}>
                <span className="truncate" style={{ color: T.rust }}>{t.from}</span>
                <ArrowLeftRight size={10} style={{ color: T.muted, flexShrink: 0 }} />
                <span className="truncate" style={{ color: T.green }}>{t.to}</span>
              </span>
              <span className="font-semibold shrink-0 ml-auto" style={{ color: T.ink }}>{mfmt(t.amount, hideAmounts)}</span>
              {onDelete && (
                <button onClick={() => onDelete(t.id)} title="Hoàn tác lượt chuyển này" className="shrink-0 p-1 rounded-md" style={{ color: T.muted }}>
                  <Trash2 size={12} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function BudgetTab({ budgets, month, categories, transactions, hideAmounts, viewMode = "web", onAddExpenseCategory, onUpsertBudget, onDeleteBudget, onDeleteCategory, cumulativeUnallocated, budgetTransfers, onTransferBudget, onDeleteBudgetTransfer }) {
  const mobile = viewMode === "app";
  // Dùng chung đúng 1 bộ lọc tháng của toàn app (ở sidebar/thanh trên) — không còn bộ chọn
  // tháng riêng cho tab này nữa, tránh gây rối vì có tới 2 nơi lọc tháng cùng lúc.
  const budgetMonth = month;

  const txMonth = useMemo(() => transactions.filter((t) => t.date.startsWith(budgetMonth)), [transactions, budgetMonth]);
  const totalIncome = useMemo(() => txMonth.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0), [txMonth]);
  const txExpenseMonth = useMemo(() => txMonth.filter((t) => t.type === "expense"), [txMonth]);
  const spentByCategory = useMemo(() => {
    const map = {};
    txExpenseMonth.forEach((t) => { map[t.category] = (map[t.category] || 0) + t.amount; });
    return map;
  }, [txExpenseMonth]);

  const mb = budgets[budgetMonth] || { total: null, categories: {} };
  const inputStyle = { borderColor: T.border, color: T.ink, background: T.card };
  const formatAmount = (raw) => (raw ? Number(raw).toLocaleString("vi-VN") : "");
  const digitsOnly = (v) => v.replace(/\D/g, "");

  // Bấm "Sửa" trên một dòng ngân sách (thường nằm phía dưới, sau khi đã cuộn xuống xem danh
  // sách) sẽ tự cuộn màn hình lên tới đúng ô form chỉnh sửa ở trên — khỏi phải tự kéo lên lại.
  const catFormRef = useRef(null);
  const scrollToCatForm = () => {
    requestAnimationFrame(() => catFormRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  // Ngân sách tổng của tháng luôn bằng đúng tổng thu nhập tháng đó (khớp với tab "Trực quan dòng tiền"),
  // không còn là con số đặt tay tách biệt — toàn bộ thu nhập là "chiếc bánh" cần phân bổ.
  const totalCatBudget = useMemo(() => Object.values(mb.categories).reduce((s, v) => s + v, 0), [mb]);
  // TRƯỚC (cũ): unallocatedNow = totalIncome(tháng này) − totalCatBudget(tháng này) — reset mỗi tháng.
  // SAU (mới): unallocatedNow = "Chưa phân bổ" LŨY KẾ (kiểu YNAB) tính tới hết tháng này, được
  // App tính sẵn và truyền xuống — cộng dồn phần dư/âm từ các tháng trước.
  const unallocatedNow = cumulativeUnallocated;
  // "Sẵn có để phân bổ" cho tháng này = phần chưa phân bổ lũy kế HIỆN TẠI cộng lại đúng phần
  // đã lập ngân sách trong tháng này (vì unallocatedNow đã trừ phần đó rồi) — tức là tổng số
  // tiền có thể phân bổ TRƯỚC khi lập ngân sách của tháng này.
  const availableToAllocate = unallocatedNow + totalCatBudget;
  const pctAllocated = availableToAllocate > 0
    ? Math.min(100, Math.round((totalCatBudget / availableToAllocate) * 100))
    : (totalCatBudget > 0 ? 100 : 0);

  // ---- category (lv1) budgets ----
  const [catForm, setCatForm] = useState({ category: "", amount: "" });
  const [editingCat, setEditingCat] = useState(null);
  const [addingNewCat, setAddingNewCat] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const budgetedCats = Object.keys(mb.categories);
  const availableCats = categories.expense.map((c) => c.name).filter((n) => !budgetedCats.includes(n) || n === editingCat);

  // Số tiền TỐI ĐA được phép gõ vào ô "Hạn mức" cho danh mục đang chọn: chính là số "Chưa
  // phân bổ" hiện tại, CỘNG THÊM số tiền đã lỡ gán cho ĐÚNG danh mục đang sửa (nếu có) — vì
  // số đó đã bị trừ khỏi "Chưa phân bổ" rồi, cần cộng lại tạm thời để biết "room" thật sự khi
  // đổi sang một con số mới cho danh mục này (không tính ngân sách của các danh mục khác).
  const maxAllowedAmount = useMemo(() => {
    const addBack = editingCat && mb.categories[editingCat] != null ? mb.categories[editingCat] : 0;
    return unallocatedNow + addBack;
  }, [unallocatedNow, editingCat, mb]);
  const catAmountNum = Number(catForm.amount) || 0;
  const catAmountExceedsMax = catForm.amount !== "" && catAmountNum > maxAllowedAmount;

  useEffect(() => { setCatForm({ category: "", amount: "" }); setEditingCat(null); setAddingNewCat(false); setNewCatName(""); setTransferFrom(null); }, [budgetMonth]);

  const confirmNewCat = async () => {
    const name = newCatName.trim();
    if (!name) return;
    if (!categories.expense.some((c) => c.name === name)) {
      await onAddExpenseCategory(name);
    }
    setCatForm((f) => ({ ...f, category: name }));
    setAddingNewCat(false); setNewCatName("");
  };

  const submitCatBudget = async (e) => {
    e.preventDefault();
    if (!catForm.category || !catForm.amount) return;
    // Chặn cứng: không cho lưu nếu hạn mức vượt quá số tiền thật sự sẵn có (xem maxAllowedAmount).
    if (catAmountExceedsMax) return;
    // Nếu đang sửa và người dùng đã đổi sang danh mục khác, xoá ngân sách cũ (theo tên cũ)
    // trước khi lưu ngân sách mới dưới tên danh mục vừa chọn — tránh để lại 2 dòng ngân sách.
    if (editingCat && editingCat !== catForm.category) {
      await onDeleteBudget(budgetMonth, editingCat);
    }
    await onUpsertBudget(budgetMonth, catForm.category, Number(catForm.amount));
    setCatForm({ category: "", amount: "" });
    setEditingCat(null);
  };
  const startEditCat = (name) => { setEditingCat(name); setCatForm({ category: name, amount: String(mb.categories[name]) }); scrollToCatForm(); };
  const cancelEditCat = () => { setEditingCat(null); setCatForm({ category: "", amount: "" }); };
  const removeCatBudget = async (name) => {
    await onDeleteBudget(budgetMonth, name);
    if (editingCat === name) cancelEditCat();
  };

  // ---- Chuyển ngân sách qua lại giữa 2 danh mục (VD: Mua sắm còn dư -> Di chuyển) ----
  // Thay vì phải: xoá hạn mức cũ -> chờ về "Chưa phân bổ" -> lập lại hạn mức mới cho danh
  // mục kia, giờ chỉ cần bấm nút chuyển đổi ngay trên từng dòng ngân sách.
  const [transferFrom, setTransferFrom] = useState(null);
  const openTransfer = (name) => setTransferFrom(name);
  const closeTransfer = () => setTransferFrom(null);
  // Số tiền tối đa được phép chuyển đi = phần "còn lại" của danh mục nguồn (hạn mức đã lập
  // trừ đi số đã chi thực tế) — phần đã chi rồi thì không thể chuyển đi được nữa.
  const transferMaxAmount = transferFrom != null
    ? (mb.categories[transferFrom] || 0) - (spentByCategory[transferFrom] || 0)
    : 0;
  const transferTargetOptions = transferFrom != null
    ? budgetedCats.filter((n) => n !== transferFrom).map((n) => ({ value: n, label: n }))
    : [];
  const confirmTransfer = async ({ amount, to }) => {
    const from = transferFrom;
    if (!from || !to || amount <= 0) return;
    if (amount > transferMaxAmount) return;
    await onTransferBudget(budgetMonth, from, to, amount);
    closeTransfer();
  };

  // Lịch sử chuyển ngân sách CHỈ của tháng đang xem (mỗi lượt chuyển gắn với đúng 1 tháng).
  const monthBudgetTransfers = useMemo(
    () => (budgetTransfers || []).filter((t) => t.month === budgetMonth),
    [budgetTransfers, budgetMonth]
  );

  // Xoá hẳn 1 danh mục chi tiêu ngay từ trong dropdown chọn danh mục (dấu X) — cùng kiểu thao
  // tác với tab "Ghi chép thu chi". Nếu danh mục đó đang có hạn mức ngân sách cho tháng này,
  // xoá luôn dòng ngân sách đó trước (tránh để lại ngân sách "mồ côi" không còn danh mục).
  // Các khoản thu/chi đã ghi trước đó KHÔNG bị ảnh hưởng — chỉ là tên đó không còn để chọn nữa.
  // Dùng panel xác nhận riêng của app (ConfirmModal) thay vì window.confirm() của trình duyệt.
  const [confirmDeleteCat, setConfirmDeleteCat] = useState(null);
  const handleDeleteCategory = (name) => {
    if (!onDeleteCategory) return;
    setConfirmDeleteCat(name);
  };
  const performDeleteCategory = async () => {
    const name = confirmDeleteCat;
    setConfirmDeleteCat(null);
    if (!name) return;
    if (mb.categories[name] != null) await onDeleteBudget(budgetMonth, name);
    await onDeleteCategory("expense", name);
    if (catForm.category === name) setCatForm((f) => ({ ...f, category: "" }));
    if (editingCat === name) cancelEditCat();
  };

  return (
    <div className="space-y-5">
      <div className="rounded-2xl bg-white p-5">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <h3 className="text-sm font-medium" style={{ color: T.ink }}>Ngân sách và chưa phân bổ — {monthLabel(budgetMonth)}</h3>
        </div>

        <div>
          {availableToAllocate <= 0 && (
            <p className="text-xs mb-3" style={{ color: T.muted }}>
              Số tiền sẵn có để phân bổ (tính lũy kế từ trước tới nay) hiện đang bằng 0 hoặc âm — bạn vẫn có thể lập hạn mức ngân sách và ghi chép chi tiêu bình thường, phần dưới sẽ hiển thị là "Vượt thu nhập" cho đến khi có thêm thu nhập mới hoặc giảm bớt ngân sách ở danh mục khác để bù lại.
            </p>
          )}
          <div className="flex items-baseline justify-between flex-wrap gap-2 mb-2">
            <div>
              <p className="text-xs" style={{ color: T.muted }}>Đã lập ngân sách</p>
              <p className="text-lg font-semibold ff-serif" style={{ color: T.ink }}>{mfmt(totalCatBudget, hideAmounts)}</p>
            </div>
            <div className="text-right">
              <p className="text-xs" style={{ color: T.muted }}>{unallocatedNow < 0 ? "Vượt thu nhập" : "Chưa phân bổ"}</p>
              <p className="text-lg font-semibold ff-serif" style={{ color: unallocatedNow < 0 ? T.rust : T.ink }}>{mfmt(Math.abs(unallocatedNow), hideAmounts)}</p>
            </div>
          </div>
          <div className="h-3 rounded-full overflow-hidden flex" style={{ background: T.page }}>
            <div className="h-full" style={{ width: `${pctAllocated}%`, background: unallocatedNow < 0 ? T.rust : T.green }} />
            {unallocatedNow >= 0 && <div className="h-full" style={{ width: `${100 - pctAllocated}%`, background: T.border }} />}
          </div>
        </div>
      </div>

      <div className="rounded-2xl bg-white p-5">
        <h3 className="text-sm font-medium mb-3" style={{ color: T.ink }}>Ngân sách theo danh mục — {monthLabel(budgetMonth)}</h3>

        <form onSubmit={submitCatBudget} ref={catFormRef} className="mb-5">
          <div className={mobile ? "grid grid-cols-1 gap-3" : "flex flex-wrap gap-3 items-end"}>
            <div className={mobile ? "w-full" : "flex-1 min-w-[220px]"}>
              <label className="text-xs mb-1 block" style={{ color: T.muted }}>Danh mục</label>
              {!addingNewCat ? (
                <SelectWithDelete
                  value={catForm.category}
                  onChange={(v) => setCatForm((f) => ({ ...f, category: v }))}
                  options={availableCats.map((n) => ({ value: n, label: n }))}
                  placeholder="— Chọn danh mục —"
                  onDeleteOption={onDeleteCategory ? handleDeleteCategory : undefined}
                  deleteTitle="Xoá danh mục này"
                  onAddNew={() => setAddingNewCat(true)}
                />
              ) : (
                <div className="flex gap-2">
                  <input autoFocus value={newCatName} onChange={(e) => setNewCatName(e.target.value)}
                    placeholder="Ví dụ: Sức khỏe" className="flex-1 rounded-lg border px-3 py-2 text-sm focus:outline-none" style={inputStyle}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); confirmNewCat(); } }} />
                  <button type="button" onClick={confirmNewCat} className="rounded-lg px-2 text-white" style={{ background: T.green }}><Check size={16} /></button>
                  <button type="button" onClick={() => { setAddingNewCat(false); setNewCatName(""); }}
                    className="rounded-lg border px-2" style={{ borderColor: T.border, color: T.muted }}><X size={16} /></button>
                </div>
              )}
            </div>
            <div className={mobile ? "w-full" : "flex-1 min-w-[180px]"}>
              <label className="text-xs mb-1 block" style={{ color: T.muted }}>Hạn mức</label>
              <div className="relative">
                <input type="text" inputMode="numeric" value={formatAmount(catForm.amount)}
                  onChange={(e) => setCatForm((f) => ({ ...f, amount: digitsOnly(e.target.value) }))}
                  placeholder="0" className="w-full rounded-lg border pl-3 pr-9 py-2 text-sm focus:outline-none" style={catAmountExceedsMax ? { ...inputStyle, borderColor: T.rust } : inputStyle} />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs" style={{ color: T.muted }}>đ</span>
              </div>
            </div>
            <button type="submit" disabled={catAmountExceedsMax} className={`rounded-lg px-4 py-2 text-white text-sm font-medium flex items-center justify-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed ${mobile ? "w-full" : ""}`} style={{ background: T.ink }}>
              {editingCat ? <Check size={14} /> : <Plus size={14} />} {editingCat ? "Lưu" : "Thêm"}
            </button>
            {editingCat && (
              <button type="button" onClick={cancelEditCat} className={`rounded-lg border px-4 py-2 text-sm ${mobile ? "w-full" : ""}`} style={{ borderColor: T.border, color: T.muted }}>Hủy</button>
            )}
          </div>

          <p className="text-[11px] mt-1.5" style={{ color: catAmountExceedsMax ? T.rust : T.muted }}>
            {catAmountExceedsMax
              ? `Vượt quá số tiền sẵn có — tối đa ${mfmt(Math.max(maxAllowedAmount, 0), hideAmounts)}.`
              : `Sẵn có tối đa: ${mfmt(Math.max(maxAllowedAmount, 0), hideAmounts)}`}
          </p>
        </form>

        <div className="space-y-3">
          {budgetedCats.length === 0 && <p className="text-sm" style={{ color: T.muted }}>Chưa có danh mục nào được đặt hạn mức.</p>}
          {budgetedCats.map((name) => {
            const budget = mb.categories[name];
            const spent = spentByCategory[name] || 0;
            const remaining = budget - spent;
            const over = spent > budget;
            const pctSpent = budget ? Math.min(100, Math.round((spent / budget) * 100)) : 0;
            const color = colorFor(name);
            return (
              <div
                key={name}
                className="p-3 rounded-xl"
                style={
                  over
                    ? { border: `1.5px solid ${T.rust}`, borderLeft: `4px solid ${T.rust}`, background: T.rustSoft }
                    : { border: `1px solid ${T.border}`, borderLeft: `4px solid ${color}` }
                }
              >
                <div className="flex items-center justify-between gap-3 mb-2">
                  <p className="text-sm font-medium truncate flex items-center gap-1.5" style={{ color: T.ink }}>
                    {over && <AlertTriangle size={14} style={{ color: T.rust, flexShrink: 0 }} />}
                    {name} - <span className="italic" style={{ color: T.ink }}>{mfmt(budget, hideAmounts)}</span>
                  </p>
                  <div className="flex items-center gap-1 shrink-0">
                    {over && (
                      <span className="text-[10px] font-semibold px-2 py-1 rounded-full whitespace-nowrap" style={{ background: T.rust, color: "#fff" }}>
                        Vượt ngân sách
                      </span>
                    )}
                    {budgetedCats.length > 1 && (
                      <button onClick={() => openTransfer(name)} title="Chuyển ngân sách sang danh mục khác" className="p-1.5 rounded-md" style={{ color: T.muted }}><ArrowLeftRight size={13} /></button>
                    )}
                    <button onClick={() => startEditCat(name)} className="p-1.5 rounded-md" style={{ color: T.muted }}><Pencil size={13} /></button>
                    <button onClick={() => removeCatBudget(name)} className="p-1.5 rounded-md" style={{ color: T.muted }}><Trash2 size={13} /></button>
                  </div>
                </div>
                <div className="flex items-baseline justify-between gap-2 mb-1.5">
                  <p className="text-xs" style={{ color: T.muted }}>Đã chi <span className="font-semibold" style={{ color: over ? T.rust : T.ink }}>{mfmt(spent, hideAmounts)}</span></p>
                  <p className="text-xs" style={{ color: T.muted }}>
                    {over ? "Vượt" : "Còn lại"} <span className="font-semibold" style={{ color: over ? T.rust : T.ink }}>{mfmt(Math.abs(remaining), hideAmounts)}</span>
                  </p>
                </div>
                <div className="h-2.5 rounded-full overflow-hidden flex" style={{ background: T.page }}>
                  <div className="h-full" style={{ width: `${pctSpent}%`, background: over ? T.rust : color }} />
                  {!over && <div className="h-full" style={{ width: `${100 - pctSpent}%`, background: T.border }} />}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <BudgetTransferHistory
        transfers={monthBudgetTransfers}
        onDelete={onDeleteBudgetTransfer}
        hideAmounts={hideAmounts}
        mobile={mobile}
      />

      <TransferBudgetModal
        open={transferFrom != null}
        fromName={transferFrom}
        maxAmount={transferMaxAmount}
        targetOptions={transferTargetOptions}
        hideAmounts={hideAmounts}
        onConfirm={confirmTransfer}
        onCancel={closeTransfer}
      />

      <ConfirmModal
        open={!!confirmDeleteCat}
        title="Xoá danh mục"
        message={`Xoá danh mục "${confirmDeleteCat}"? Các khoản đã ghi trước đó sẽ không bị ảnh hưởng, chỉ là danh mục này sẽ không còn để chọn nữa.`}
        onConfirm={performDeleteCategory}
        onCancel={() => setConfirmDeleteCat(null)}
      />
    </div>
  );
}

// ---------- Tab 3: Entry log ----------
const NEW_OPTION = "__new__";

// Dropdown tuỳ biến thay cho <select> gốc — cho phép có nút "X" xoá ngay bên cạnh mỗi lựa
// chọn (danh mục / chi tiết), vì <select> gốc của trình duyệt không thể chèn nút bấm vào
// từng dòng. Dùng khi danh sách càng ngày càng dài, cần xoá bớt danh mục không cần nữa.
function SelectWithDelete({ value, onChange, options, placeholder, disabled, onDeleteOption, deleteTitle, addNewLabel, onAddNew }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  useEffect(() => {
    if (!open) return;
    const onDocPointerDown = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onDocPointerDown);
    return () => document.removeEventListener("mousedown", onDocPointerDown);
  }, [open]);

  const inputStyle = { borderColor: T.border, color: T.ink, background: T.card };
  const selected = options.find((o) => o.value === value);

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen((o) => !o)}
        className="w-full rounded-lg border px-3 py-2 text-sm text-left flex items-center justify-between gap-2 disabled:opacity-50"
        style={inputStyle}
      >
        <span className="truncate" style={{ color: selected ? T.ink : T.muted }}>{selected ? selected.label : placeholder}</span>
        <ChevronDown size={14} style={{ color: T.muted, flexShrink: 0, transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />
      </button>

      {open && (
        <div
          className="absolute z-20 left-0 right-0 mt-1 rounded-lg overflow-hidden"
          style={{ background: T.card, border: `1px solid ${T.border}`, boxShadow: "0 8px 24px rgba(32,38,31,0.14)" }}
        >
          <div className="max-h-60 overflow-y-auto">
            <button
              type="button"
              onClick={() => { onChange(""); setOpen(false); }}
              className="w-full text-left px-3 py-2 text-sm"
              style={{ color: T.muted, background: !value ? T.page : "transparent" }}
            >
              {placeholder}
            </button>
            {options.map((o) => (
              <div key={o.value} className="flex items-center" style={{ background: value === o.value ? T.page : "transparent" }}>
                <button
                  type="button"
                  onClick={() => { onChange(o.value); setOpen(false); }}
                  className="flex-1 min-w-0 text-left px-3 py-2 text-sm truncate"
                  style={{ color: T.ink }}
                >
                  {o.label}
                </button>
                {onDeleteOption && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onDeleteOption(o.value); }}
                    title={deleteTitle || "Xoá"}
                    className="shrink-0 w-8 h-full flex items-center justify-center"
                    style={{ color: T.muted }}
                  >
                    <X size={13} />
                  </button>
                )}
              </div>
            ))}
            {options.length === 0 && (
              <p className="px-3 py-2 text-xs" style={{ color: T.muted }}>Chưa có lựa chọn nào.</p>
            )}
          </div>
          {onAddNew && (
            <button
              type="button"
              onClick={() => { onAddNew(); setOpen(false); }}
              className="w-full text-left px-3 py-2 text-sm font-medium"
              style={{ color: T.green, borderTop: `1px solid ${T.border}` }}
            >
              {addNewLabel || "+ Thêm danh mục mới"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function EntryTab({
  transactions, month, categories, budgets, viewMode = "web", hideAmounts,
  onAddTransaction, onUpdateTransaction, onDeleteTransaction, onAddIncomeCategory, onAddSubcategory,
  onDeleteCategory, onDeleteSubcategory,
  walletBalances, walletTransfers, onAddWalletTransfer, onDeleteWalletTransfer,
}) {
  const mobile = viewMode === "app";
  const emptyForm = { type: "expense", category: "", subcategory: "", amount: "", date: todayISO(), paymentMethod: "bank" };
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [addingNewCategory, setAddingNewCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [addingNewSub, setAddingNewSub] = useState(false);
  const [newSubName, setNewSubName] = useState("");
  const [logDateFrom, setLogDateFrom] = useState("");
  const [logDateTo, setLogDateTo] = useState("");
  const [logTypeFilter, setLogTypeFilter] = useState("all"); // "all" | "income" | "expense"
  const [logSearch, setLogSearch] = useState("");

  // ---- Căn chiều cao cột phải (Nhật ký + Lịch sử chuyển đổi) khớp với cột trái (Form + Chuyển
  // đổi ví), CHỈ áp dụng cho bản web. Đo chiều cao thật của cột trái (leftColRef), phần tiêu đề
  // + bộ lọc cố định phía trên nhật ký (journalHeaderRef), và chiều cao THẬT của thẻ "Lịch sử
  // chuyển đổi" (historyCardRef — thẻ này tự đo và khoá chiều cao vừa khít 5 dòng, xem
  // WalletTransferHistory) bằng ResizeObserver, rồi suy ra chiều cao còn lại dành cho vùng cuộn
  // của nhật ký, sao cho: journalHeader + journalScroll + GAP + chiều cao thẻ lịch sử = chiều cao
  // cột trái — tức là cạnh dưới của "Lịch sử chuyển đổi" luôn ngang bằng cạnh dưới của cột trái.
  const leftColRef = useRef(null);
  const journalHeaderRef = useRef(null);
  const historyCardRef = useRef(null);
  const [journalListHeight, setJournalListHeight] = useState(null);
  useEffect(() => {
    if (mobile) return; // bản app: không chỉnh gì, giữ nguyên hành vi cũ
    if (typeof ResizeObserver === "undefined") return;
    const leftEl = leftColRef.current;
    const headerEl = journalHeaderRef.current;
    if (!leftEl || !headerEl) return;
    const recompute = () => {
      const leftHeight = leftEl.offsetHeight;
      const headerHeight = headerEl.offsetHeight;
      const historyHeight = historyCardRef.current?.offsetHeight || WALLET_HISTORY_FALLBACK_HEIGHT;
      if (leftHeight > 0) {
        const available = leftHeight - headerHeight - COLUMN_GAP - historyHeight;
        setJournalListHeight(Math.max(available, 160));
      }
    };
    const ro = new ResizeObserver(recompute);
    ro.observe(leftEl);
    ro.observe(headerEl);
    if (historyCardRef.current) ro.observe(historyCardRef.current);
    recompute();
    return () => ro.disconnect();
  }, [mobile]);

  // Bấm "Sửa" trên một khoản ghi (thường nằm phía dưới, sau khi đã cuộn xuống xem nhật ký)
  // sẽ tự cuộn màn hình lên tới đúng form chỉnh sửa ở trên — khỏi phải tự kéo lên lại.
  const entryFormRef = useRef(null);
  const scrollToEntryForm = () => {
    requestAnimationFrame(() => entryFormRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  const txMonth = useMemo(() => transactions.filter((t) => t.date.startsWith(month)).sort((a, b) => b.date.localeCompare(a.date)), [transactions, month]);
  const logFilterMaxDate = useMemo(() => { const end = monthEnd(month); const today = todayISO(); return end < today ? end : today; }, [month]);
  useEffect(() => { setLogDateFrom(""); setLogDateTo(""); setLogSearch(""); }, [month]);
  // Chuẩn hoá chuỗi để tìm kiếm không phân biệt hoa/thường và không phân biệt dấu tiếng Việt
  // (VD: gõ "ca phe" vẫn tìm ra "Cà phê").
  const normalizeSearch = (s) =>
    (s || "")
      .toString()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/đ/g, "d");
  const logSearchTrimmed = logSearch.trim();
  const logSearchNormalized = normalizeSearch(logSearchTrimmed);
  const logSearchDigits = logSearchTrimmed.replace(/\D/g, "");
  const filteredLogTx = useMemo(
    () =>
      txMonth.filter((t) => {
        if (!((!logDateFrom || t.date >= logDateFrom) && (!logDateTo || t.date <= logDateTo) && (logTypeFilter === "all" || t.type === logTypeFilter))) {
          return false;
        }
        if (!logSearchNormalized) return true;
        // Tìm theo từ khoá của danh mục (lv1) hoặc chi tiết (lv2)
        const textMatch =
          normalizeSearch(t.category).includes(logSearchNormalized) ||
          normalizeSearch(t.subcategory || "").includes(logSearchNormalized);
        // Tìm theo số tiền — chỉ áp dụng khi từ khoá có chứa chữ số
        const amountMatch = logSearchDigits.length > 0 && String(t.amount).includes(logSearchDigits);
        return textMatch || amountMatch;
      }),
    [txMonth, logDateFrom, logDateTo, logTypeFilter, logSearchNormalized, logSearchDigits]
  );
  // Xuất ĐÚNG danh sách đang hiển thị trong Nhật ký (đã áp dụng bộ lọc loại/khoảng ngày/tìm
  // kiếm hiện tại) ra file CSV — mở được bằng Excel / Google Sheets để tự phân tích, theo dõi.
  const exportJournalCsv = () => {
    if (filteredLogTx.length === 0) return;
    const header = ["Ngày", "Loại", "Danh mục", "Chi tiết", "Số tiền (đ)", "Hình thức"];
    const rows = filteredLogTx.map((t) => [
      t.date,
      t.type === "income" ? "Thu nhập" : "Chi tiêu",
      t.category,
      t.subcategory || "",
      t.amount,
      t.paymentMethod === "cash" ? "Tiền mặt" : "Chuyển khoản",
    ]);
    downloadCsv(`nhat-ky-thu-chi_${month}.csv`, header, rows);
  };
  const txByDay = useMemo(() => {
    const groups = [];
    const index = {};
    filteredLogTx.forEach((t) => {
      if (!(t.date in index)) { index[t.date] = groups.length; groups.push({ date: t.date, items: [] }); }
      groups[index[t.date]].items.push(t);
    });
    return groups;
  }, [filteredLogTx]);
  // Danh mục chi tiêu chỉ lấy từ những danh mục ĐÃ được lập ngân sách cho tháng đang chọn
  // (tạo/quản lý danh mục giờ thực hiện ở tab "Lập ngân sách"); thu nhập vẫn dùng danh mục có sẵn.
  const budgetedExpenseNames = useMemo(() => Object.keys((budgets[month] || {}).categories || {}), [budgets, month]);
  const activeCategories = form.type === "income"
    ? categories.income
    : categories.expense.filter((c) => budgetedExpenseNames.includes(c.name));
  const selectedCat = activeCategories.find((c) => c.name === form.category);
  const subOptions = selectedCat ? selectedCat.subs : [];

  const resetForm = () => {
    setForm({ ...emptyForm, date: month + "-" + todayISO().slice(8, 10) });
    setEditingId(null);
    setAddingNewCategory(false); setNewCategoryName("");
    setAddingNewSub(false); setNewSubName("");
  };
  const startEdit = (t) => {
    setEditingId(t.id);
    setForm({ type: t.type, category: t.category, subcategory: t.subcategory, amount: String(t.amount), date: t.date, paymentMethod: t.paymentMethod === "cash" ? "cash" : "bank" });
    setAddingNewCategory(false); setNewCategoryName("");
    setAddingNewSub(false); setNewSubName("");
    scrollToEntryForm();
  };
  const removeTx = (id) => onDeleteTransaction(id);

  const confirmNewCategory = async () => {
    const name = newCategoryName.trim();
    if (!name) return;
    if (!categories.income.some((c) => c.name === name)) {
      await onAddIncomeCategory(name);
    }
    setForm((f) => ({ ...f, category: name, subcategory: "" }));
    setAddingNewCategory(false); setNewCategoryName("");
  };

  const confirmNewSub = async () => {
    const name = newSubName.trim();
    if (!name || !form.category) return;
    await onAddSubcategory(form.type, form.category, name);
    setForm((f) => ({ ...f, subcategory: name }));
    setAddingNewSub(false); setNewSubName("");
  };

  // Xoá 1 danh mục / chi tiết ngay từ trong dropdown — vì danh sách càng ngày càng dài.
  // Có hỏi xác nhận trước vì đây là thao tác không thể hoàn tác (các khoản đã ghi trước đó
  // vẫn giữ nguyên, không bị xoá theo — chỉ là tên đó không còn xuất hiện để chọn nữa).
  // Dùng chung 1 panel xác nhận (ConfirmModal) cho cả 2 trường hợp danh mục / chi tiết, thay
  // vì window.confirm() mặc định của trình duyệt.
  const [confirmDeleteItem, setConfirmDeleteItem] = useState(null); // { kind: "category" | "subcategory", name } | null
  const handleDeleteCategory = (name) => {
    if (!onDeleteCategory) return;
    setConfirmDeleteItem({ kind: "category", name });
  };
  const handleDeleteSubcategory = (name) => {
    if (!onDeleteSubcategory || !form.category) return;
    setConfirmDeleteItem({ kind: "subcategory", name });
  };
  const performConfirmedDelete = async () => {
    const item = confirmDeleteItem;
    setConfirmDeleteItem(null);
    if (!item) return;
    if (item.kind === "category") {
      await onDeleteCategory(form.type, item.name);
      if (form.category === item.name) setForm((f) => ({ ...f, category: "", subcategory: "" }));
    } else {
      await onDeleteSubcategory(form.type, form.category, item.name);
      if (form.subcategory === item.name) setForm((f) => ({ ...f, subcategory: "" }));
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.category || !form.amount || !form.date) return;
    if (form.date > todayISO()) return;
    if (insufficientWallet) return;
    const record = { type: form.type, date: form.date, category: form.category, subcategory: form.subcategory, amount: Number(form.amount), paymentMethod: form.paymentMethod === "cash" ? "cash" : "bank" };
    if (editingId) await onUpdateTransaction(editingId, record);
    else await onAddTransaction(record);
    resetForm();
  };
  // Khi ghi một khoản CHI, không được phép vượt quá số dư hiện có của đúng ví (tiền mặt / tài
  // khoản) đang chọn — tránh để ví bị âm. Nếu đang SỬA một khoản chi cũ dùng CÙNG ví, cộng lại
  // đúng số tiền cũ vào "số dư khả dụng" trước khi so sánh, vì số tiền cũ đó đã bị trừ vào ví rồi.
  const originalTx = editingId ? transactions.find((t) => t.id === editingId) : null;
  const walletKey = form.paymentMethod === "cash" ? "cash" : "bank";
  const availableInWallet = useMemo(() => {
    if (!walletBalances) return Infinity;
    let base = walletBalances[walletKey];
    if (originalTx && originalTx.type === "expense" && (originalTx.paymentMethod === "cash" ? "cash" : "bank") === walletKey) {
      base += originalTx.amount;
    }
    return base;
  }, [walletBalances, walletKey, originalTx]);
  const insufficientWallet = form.type === "expense" && !!walletBalances && Number(form.amount) > availableInWallet;
  // Chỉ hợp lệ khi có đủ danh mục, số tiền, và ngày — phần chi tiết (subcategory) không bắt buộc.
  const canSubmit = !!form.category && !!form.amount && Number(form.amount) > 0 && !!form.date && form.date <= todayISO() && !insufficientWallet;

  const inputStyle = { borderColor: T.border, color: T.ink, background: T.card };
  const formatAmount = (raw) => (raw ? Number(raw).toLocaleString("vi-VN") : "");
  const handleAmountChange = (e) => {
    const digits = e.target.value.replace(/\D/g, "");
    setForm((f) => ({ ...f, amount: digits }));
  };

  return (
    <div className={`grid gap-5 items-start ${mobile ? "grid-cols-1" : "grid-cols-5"}`}>
      <div ref={leftColRef} className={mobile ? "space-y-4" : "col-span-2 space-y-4"}>
      <form onSubmit={submit} ref={entryFormRef} className="rounded-2xl bg-white p-5 h-fit space-y-4">
        <h3 className="text-sm font-medium" style={{ color: T.ink }}>{editingId ? "Sửa khoản ghi" : "Ghi thu / chi mới"}</h3>

        <div className="flex rounded-lg overflow-hidden text-sm" style={{ border: `1px solid ${T.border}` }}>
          {["expense", "income"].map((t) => (
            <button type="button" key={t} onClick={() => { setForm((f) => ({ ...f, type: t, category: "", subcategory: "" })); setAddingNewCategory(false); setAddingNewSub(false); }}
              className="flex-1 py-2 font-medium transition-colors"
              style={form.type === t ? { background: t === "income" ? T.green : T.rust, color: "#fff" } : { background: "#fff", color: T.muted }}>
              {t === "income" ? "Thu nhập" : "Chi tiêu"}
            </button>
          ))}
        </div>

        <div>
          <label className="text-xs mb-1 block" style={{ color: T.muted }}>Hình thức</label>
          <div className="flex rounded-lg overflow-hidden text-sm" style={{ border: `1px solid ${T.border}` }}>
            {[
              { key: "bank", label: "Chuyển khoản", icon: Landmark },
              { key: "cash", label: "Tiền mặt", icon: Banknote },
            ].map((opt) => {
              const Icon = opt.icon;
              const active = form.paymentMethod === opt.key;
              return (
                <button type="button" key={opt.key} onClick={() => setForm((f) => ({ ...f, paymentMethod: opt.key }))}
                  className="flex-1 py-2 font-medium transition-colors flex items-center justify-center gap-1.5"
                  style={active ? { background: T.ink, color: "#fff" } : { background: "#fff", color: T.muted }}>
                  <Icon size={13} /> {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label className="text-xs mb-1 block" style={{ color: T.muted }}>Danh mục</label>
          {!addingNewCategory ? (
            <SelectWithDelete
              value={form.category}
              onChange={(v) => setForm((f) => ({ ...f, category: v, subcategory: "" }))}
              options={activeCategories.map((c) => ({ value: c.name, label: c.name }))}
              placeholder="— Chọn danh mục —"
              onDeleteOption={onDeleteCategory ? handleDeleteCategory : undefined}
              deleteTitle="Xoá danh mục này"
              onAddNew={form.type === "income" ? () => setAddingNewCategory(true) : undefined}
            />
          ) : (
            <div className="flex gap-2">
              <input autoFocus value={newCategoryName} onChange={(e) => setNewCategoryName(e.target.value)}
                placeholder="Ví dụ: Cho thuê nhà" className="flex-1 rounded-lg border px-3 py-2 text-sm focus:outline-none" style={inputStyle}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); confirmNewCategory(); } }} />
              <button type="button" onClick={confirmNewCategory} className="rounded-lg px-2 text-white" style={{ background: T.green }}><Check size={16} /></button>
              <button type="button" onClick={() => { setAddingNewCategory(false); setNewCategoryName(""); }}
                className="rounded-lg border px-2" style={{ borderColor: T.border, color: T.muted }}><X size={16} /></button>
            </div>
          )}
          {form.type === "expense" && activeCategories.length === 0 && (
            <p className="text-xs mt-1.5" style={{ color: T.muted }}>Chưa có danh mục nào được lập ngân sách cho tháng này. Vào tab "Lập ngân sách" để thêm danh mục trước.</p>
          )}
        </div>

        <div>
          <label className="text-xs mb-1 block" style={{ color: T.muted }}>Chi tiết</label>
          {!addingNewSub ? (
            <SelectWithDelete
              value={form.subcategory}
              disabled={!form.category}
              onChange={(v) => setForm((f) => ({ ...f, subcategory: v }))}
              options={subOptions.map((s) => ({ value: s, label: s }))}
              placeholder={form.category ? "— Chọn chi tiết (không bắt buộc) —" : "— Chọn danh mục trước —"}
              onDeleteOption={onDeleteSubcategory ? handleDeleteSubcategory : undefined}
              deleteTitle="Xoá chi tiết này"
              onAddNew={form.category ? () => setAddingNewSub(true) : undefined}
            />
          ) : (
            <div className="flex gap-2">
              <input autoFocus value={newSubName} onChange={(e) => setNewSubName(e.target.value)}
                placeholder="Ví dụ: Mua giày" className="flex-1 rounded-lg border px-3 py-2 text-sm focus:outline-none" style={inputStyle}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); confirmNewSub(); } }} />
              <button type="button" onClick={confirmNewSub} className="rounded-lg px-2 text-white" style={{ background: T.green }}><Check size={16} /></button>
              <button type="button" onClick={() => { setAddingNewSub(false); setNewSubName(""); }}
                className="rounded-lg border px-2" style={{ borderColor: T.border, color: T.muted }}><X size={16} /></button>
            </div>
          )}
        </div>

        <div>
          <label className="text-xs mb-1 block" style={{ color: T.muted }}>Số tiền</label>
          <div className="relative">
            <input
              type="text" inputMode="numeric" value={formatAmount(form.amount)} onChange={handleAmountChange}
              placeholder="0" className="w-full rounded-lg border pl-3 pr-9 py-2 text-sm focus:outline-none" style={inputStyle} />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs" style={{ color: T.muted }}>đ</span>
          </div>
          {insufficientWallet && (
            <p className="text-[11px] mt-1.5" style={{ color: T.rust }}>
              {walletKey === "cash" ? "Ví tiền mặt" : "Tài khoản ngân hàng"} không đủ số dư — hiện chỉ còn {mfmt(availableInWallet, hideAmounts)}.
            </p>
          )}
        </div>

        <div>
          <label className="text-xs mb-1 block" style={{ color: T.muted }}>Ngày</label>
          <input type="date" value={form.date} max={todayISO()}
            onChange={(e) => {
              const v = e.target.value;
              setForm((f) => ({ ...f, date: v > todayISO() ? todayISO() : v }));
            }}
            className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none" style={inputStyle} />
        </div>

        <div className="flex gap-2 pt-1">
          <button type="submit" disabled={!canSubmit} className="flex-1 rounded-lg text-white text-sm font-medium py-2.5 flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed" style={{ background: T.ink }}>
            <Check size={15} /> {editingId ? "Lưu thay đổi" : "Lưu khoản ghi"}
          </button>
          {editingId && (<button type="button" onClick={resetForm} className="rounded-lg border px-3 text-sm" style={{ borderColor: T.border, color: T.muted }}>Hủy</button>)}
        </div>
      </form>

      <WalletTransferPanel walletBalances={walletBalances} onAddWalletTransfer={onAddWalletTransfer} hideAmounts={hideAmounts} mobile={mobile} />
      </div>

      <div className={mobile ? "space-y-4" : "col-span-3 space-y-4"}>
      <div className="rounded-2xl bg-white overflow-hidden">
        <div ref={journalHeaderRef} className="p-4" style={{ borderBottom: `1px solid ${T.border}` }}>
          <div className="flex items-center justify-between gap-2 mb-3">
            <h3 className="text-sm font-medium" style={{ color: T.ink }}>Nhật ký {monthLabel(month)}</h3>
            {/* Nút xuất CSV CHỈ hiện ở bản Web — vì file tải về sẽ nằm gọn trong thư mục
                "Downloads" của trình duyệt máy tính. Trên "app" (mobile), trình duyệt di động
                không có nơi lưu trữ file rõ ràng để người dùng dễ tìm lại, nên ẩn nút này đi. */}
            {!mobile && (
              <button
                type="button"
                onClick={exportJournalCsv}
                disabled={filteredLogTx.length === 0}
                title="Xuất file CSV (mở bằng Excel/Google Sheets) để tự phân tích, theo dõi"
                className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ borderColor: T.border, color: T.ink, background: T.card }}
              >
                <Download size={13} /> Xuất CSV
              </button>
            )}
          </div>
          <div className="relative mb-2.5">
            <Search size={14} style={{ color: T.muted, position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }} />
            <input
              type="text"
              value={logSearch}
              onChange={(e) => setLogSearch(e.target.value)}
              placeholder="Tìm theo danh mục, chi tiết hoặc số tiền..."
              className="w-full rounded-lg border pl-8 pr-8 py-2 text-sm focus:outline-none"
              style={{ borderColor: T.border, color: T.ink, background: T.card }}
            />
            {logSearch && (
              <button
                type="button"
                onClick={() => setLogSearch("")}
                aria-label="Xoá tìm kiếm"
                className="absolute"
                style={{ right: 8, top: "50%", transform: "translateY(-50%)", color: T.muted }}
              >
                <X size={14} />
              </button>
            )}
          </div>
          <div className={`flex gap-2 ${mobile ? "flex-col" : "items-center justify-between flex-wrap"}`}>
            <div className={`inline-flex rounded-full p-0.5 gap-0.5 ${mobile ? "w-full" : ""}`} style={{ background: "#E4E7DC" }}>
              {[
                { key: "all", label: "Tất cả" },
                { key: "income", label: "Thu nhập" },
                { key: "expense", label: "Chi tiêu" },
              ].map((opt) => (
                <button
                  key={opt.key}
                  onClick={() => setLogTypeFilter(opt.key)}
                  className={`text-xs font-semibold px-2.5 py-1.5 rounded-full whitespace-nowrap ${mobile ? "flex-1" : ""}`}
                  style={{
                    border: "none", cursor: "pointer",
                    background: logTypeFilter === opt.key ? T.ink : "transparent",
                    color: logTypeFilter === opt.key ? "#fff" : T.muted,
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <div className={`flex items-center gap-1.5 text-xs ${mobile ? "w-full" : ""}`} style={{ color: T.muted }}>
              <span className="shrink-0">Từ</span>
              <input
                type="date"
                value={logDateFrom}
                min={`${month}-01`}
                max={logDateTo || logFilterMaxDate}
                onChange={(e) => setLogDateFrom(e.target.value > logFilterMaxDate ? logFilterMaxDate : e.target.value)}
                className={`rounded-lg border px-2 py-1 text-xs focus:outline-none ${mobile ? "flex-1 min-w-0" : ""}`}
                style={{ borderColor: T.border, color: T.ink, background: T.card }}
              />
              <span className="shrink-0">đến</span>
              <input
                type="date"
                value={logDateTo}
                min={logDateFrom || `${month}-01`}
                max={logFilterMaxDate}
                onChange={(e) => setLogDateTo(e.target.value > logFilterMaxDate ? logFilterMaxDate : e.target.value)}
                className={`rounded-lg border px-2 py-1 text-xs focus:outline-none ${mobile ? "flex-1 min-w-0" : ""}`}
                style={{ borderColor: T.border, color: T.ink, background: T.card }}
              />
            </div>
          </div>
        </div>
        {viewMode === "app" ? (
          <div className="p-3 space-y-4" style={{ maxHeight: MOBILE_JOURNAL_MAX_HEIGHT, overflowY: "auto" }}>
            {txByDay.length === 0 && (
              <p className="text-sm text-center py-10" style={{ color: T.muted }}>
                {logSearchTrimmed ? "Không tìm thấy khoản ghi nào phù hợp." : "Chưa có khoản ghi nào trong khoảng thời gian này."}
              </p>
            )}
            {txByDay.map((g) => (
              <div key={g.date}>
                <div className="flex items-center justify-between px-1 mb-2">
                  <h4 className="text-sm font-semibold ff-serif" style={{ color: T.ink }}>{dayLabel(g.date)}</h4>
                  <span className="text-xs" style={{ color: T.muted }}>{g.items.length} khoản</span>
                </div>
                <div className="space-y-2.5">
                  {g.items.map((t) => (
                    <div key={t.id} className="rounded-2xl bg-white p-3.5">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-medium min-w-0 truncate flex-1" style={{ color: T.ink }}>
                          {t.category}{t.subcategory ? ` · ${t.subcategory}` : ""}
                        </p>
                        <div className="flex items-center gap-1 shrink-0">
                          <button onClick={() => startEdit(t)} className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ border: `1px solid ${T.border}`, color: T.muted }}><Pencil size={13} /></button>
                          <button onClick={() => removeTx(t.id)} className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ border: `1px solid ${T.border}`, color: T.muted }}><Trash2 size={13} /></button>
                        </div>
                      </div>
                      <div className="h-1 rounded-full mt-3 mb-2.5" style={{ background: t.type === "income" ? T.green : T.rust, opacity: 0.85, width: "100%" }} />
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold" style={{ color: t.type === "income" ? T.green : T.rust }}>
                          {t.type === "income" ? "+" : "-"}{mfmt(t.amount, hideAmounts)}
                        </p>
                        <PaymentMethodBadge method={t.paymentMethod} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ height: journalListHeight || 560, overflowY: "auto" }}>
            {filteredLogTx.length === 0 && (
              <p className="text-sm text-center py-10" style={{ color: T.muted }}>
                {logSearchTrimmed ? "Không tìm thấy khoản ghi nào phù hợp." : "Chưa có khoản ghi nào trong khoảng thời gian này."}
              </p>
            )}
            {filteredLogTx.map((t) => (
              <div key={t.id} className="flex items-center gap-3 px-4 py-3" style={{ borderBottom: `1px solid ${T.border}` }}>
                <span className="w-1.5 h-8 rounded-full shrink-0" style={{ background: t.type === "income" ? T.green : T.rust }} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate" style={{ color: T.ink }}>{t.category}{t.subcategory ? ` · ${t.subcategory}` : ""}</p>
                  <p className="text-xs" style={{ color: T.muted }}>{t.date}</p>
                </div>
                <PaymentMethodBadge method={t.paymentMethod} />
                <p className="text-sm font-semibold shrink-0" style={{ color: t.type === "income" ? T.green : T.rust }}>
                  {t.type === "income" ? "+" : "-"}{mfmt(t.amount, hideAmounts)}
                </p>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => startEdit(t)} className="p-1.5 rounded-md" style={{ color: T.muted }}><Pencil size={14} /></button>
                  <button onClick={() => removeTx(t.id)} className="p-1.5 rounded-md" style={{ color: T.muted }}><Trash2 size={14} /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <WalletTransferHistory walletTransfers={walletTransfers} onDeleteWalletTransfer={onDeleteWalletTransfer} hideAmounts={hideAmounts} mobile={mobile} containerRef={historyCardRef} />
      </div>

      <ConfirmModal
        open={!!confirmDeleteItem}
        title={confirmDeleteItem?.kind === "subcategory" ? "Xoá chi tiết" : "Xoá danh mục"}
        message={
          confirmDeleteItem?.kind === "subcategory"
            ? `Xoá chi tiết "${confirmDeleteItem?.name}"? Các khoản đã ghi trước đó sẽ không bị ảnh hưởng.`
            : `Xoá danh mục "${confirmDeleteItem?.name}"? Các khoản đã ghi trước đó sẽ không bị ảnh hưởng, chỉ là danh mục này sẽ không còn để chọn nữa.`
        }
        onConfirm={performConfirmedDelete}
        onCancel={() => setConfirmDeleteItem(null)}
      />
    </div>
  );
}

// ---------- Ví tiền: badge hình thức thanh toán + panel chuyển đổi tiền mặt <-> ngân hàng ----------
function PaymentMethodBadge({ method }) {
  const isCash = method === "cash";
  const Icon = isCash ? Banknote : Landmark;
  return (
    <span
      className="inline-flex items-center gap-1 text-[10.5px] font-semibold px-2 py-1 rounded-full shrink-0"
      style={{ background: isCash ? T.oliveSoft : T.greenSoft, color: isCash ? T.olive : T.green }}
    >
      <Icon size={11} /> {isCash ? "Tiền mặt" : "Chuyển khoản"}
    </span>
  );
}

// Panel nhỏ để "rút tiền mặt" / "nộp tiền vào tài khoản" — chuyển đổi qua lại giữa 2 ví,
// không đổi tổng số dư. Đặt ngay dưới form "Ghi thu / chi mới".
function WalletTransferPanel({ walletBalances, onAddWalletTransfer, hideAmounts, mobile }) {
  const [direction, setDirection] = useState("bank_to_cash"); // rút tiền mặt (mặc định) hoặc nộp vào tài khoản
  const [amount, setAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);
  if (!walletBalances) return null;

  const inputStyle = { borderColor: T.border, color: T.ink, background: T.card };
  const formatAmount = (raw) => (raw ? Number(raw).toLocaleString("vi-VN") : "");
  const amountNum = Number(amount) || 0;
  const sourceBalance = direction === "bank_to_cash" ? walletBalances.bank : walletBalances.cash;
  const insufficientFunds = amountNum > sourceBalance;
  const canSubmit = amountNum > 0 && !insufficientFunds;

  const submit = async (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    await onAddWalletTransfer({ direction, amount: amountNum });
    setSubmitting(false);
    setAmount("");
  };

  return (
    <div className="rounded-2xl bg-white p-4">
      <div className="flex items-center gap-1.5 mb-3">
        <ArrowLeftRight size={14} style={{ color: T.muted }} />
        <h3 className="text-sm font-medium" style={{ color: T.ink }}>Chuyển đổi Tiền mặt ⇄ Tài khoản</h3>
      </div>

      <div className={`grid gap-2 mb-3 ${mobile ? "grid-cols-2" : "grid-cols-2"}`}>
        <div className="rounded-xl px-3 py-2.5" style={{ background: T.oliveSoft }}>
          <p className="text-[11px] flex items-center gap-1" style={{ color: T.olive }}><Banknote size={11} /> Tiền mặt</p>
          <p className="text-sm font-semibold mt-0.5" style={{ color: T.ink }}>{mfmt(walletBalances.cash, hideAmounts)}</p>
        </div>
        <div className="rounded-xl px-3 py-2.5" style={{ background: T.greenSoft }}>
          <p className="text-[11px] flex items-center gap-1" style={{ color: T.green }}><Landmark size={11} /> Tài khoản</p>
          <p className="text-sm font-semibold mt-0.5" style={{ color: T.ink }}>{mfmt(walletBalances.bank, hideAmounts)}</p>
        </div>
      </div>

      <form onSubmit={submit} className="space-y-2.5">
        <div className="flex rounded-lg overflow-hidden text-xs" style={{ border: `1px solid ${T.border}` }}>
          <button type="button" onClick={() => setDirection("bank_to_cash")}
            className="flex-1 py-2 font-medium transition-colors flex items-center justify-center gap-1"
            style={direction === "bank_to_cash" ? { background: T.ink, color: "#fff" } : { background: "#fff", color: T.muted }}>
            <Landmark size={12} /> → <Banknote size={12} /> Rút tiền mặt
          </button>
          <button type="button" onClick={() => setDirection("cash_to_bank")}
            className="flex-1 py-2 font-medium transition-colors flex items-center justify-center gap-1"
            style={direction === "cash_to_bank" ? { background: T.ink, color: "#fff" } : { background: "#fff", color: T.muted }}>
            <Banknote size={12} /> → <Landmark size={12} /> Nộp vào TK
          </button>
        </div>
        <div className="relative">
          <input
            type="text" inputMode="numeric" value={formatAmount(amount)}
            onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))}
            placeholder="Số tiền chuyển đổi" className="w-full rounded-lg border pl-3 pr-9 py-2 text-sm focus:outline-none" style={inputStyle} />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs" style={{ color: T.muted }}>đ</span>
        </div>
        {insufficientFunds && (
          <p className="text-[11px]" style={{ color: T.rust }}>Ví nguồn không đủ tiền — hiện chỉ còn {mfmt(sourceBalance, hideAmounts)}, không thể chuyển đổi số tiền lớn hơn.</p>
        )}
        <button type="submit" disabled={!canSubmit || submitting}
          className="w-full rounded-lg text-white text-sm font-medium py-2 flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ background: T.ink }}>
          <ArrowLeftRight size={13} /> Xác nhận chuyển đổi
        </button>
      </form>
    </div>
  );
}

// Lịch sử các lượt chuyển đổi tiền mặt <-> tài khoản — hiển thị gọn bên dưới nhật ký tháng.
// Trên bản web: chiều cao thẻ này CỐ ĐỊNH (tự đo, vừa khít 5 dòng) — càng chuyển đổi nhiều thì
// danh sách bên trong tự cuộn dọc, thẻ không phình cao thêm nữa (khớp với cách "Nhật ký" cuộn).
// Trên bản app: giữ nguyên hành vi cũ (chỉ hiện 8 lượt gần nhất, không cuộn) — không đụng tới.
function WalletTransferHistory({ walletTransfers, onDeleteWalletTransfer, hideAmounts, mobile, containerRef }) {
  // Số dòng tối đa hiển thị đủ trước khi phải cuộn — bản app giữ đúng kích thước như hiện tại
  // (8 dòng), bản web là 5 dòng.
  const MAX_VISIBLE_ROWS = mobile ? 8 : 5;
  // Khoảng cách giữa các dòng, khớp với class "space-y-1.5" (0.375rem = 6px).
  const ROW_GAP = 6;
  // Padding dưới của thẻ, khớp với class "p-4" (1rem = 16px).
  const PADDING_BOTTOM = 16;

  const cardRef = useRef(null);
  const listRef = useRef(null);
  const rowRef = useRef(null);
  const [fixedHeight, setFixedHeight] = useState(null);

  // Không cắt bớt dữ liệu nữa — hiển thị TẤT CẢ, thẻ giữ chiều cao cố định (vừa khít
  // MAX_VISIBLE_ROWS dòng) và tự cuộn bên trong nếu có nhiều lượt chuyển đổi hơn.
  const recent = walletTransfers || [];

  // Đo trực tiếp trên DOM đã render (tiêu đề + 1 dòng mẫu) để suy ra chiều cao "vừa khít N
  // dòng" — luôn khớp chính xác với font/kích thước thật đang hiển thị, thay vì đoán một con
  // số cố định. Chiều cao này sau khi tính xong sẽ được GIỮ CỐ ĐỊNH: nếu có nhiều hơn
  // MAX_VISIBLE_ROWS lượt chuyển đổi, phần danh sách bên trong tự cuộn thay vì làm thẻ phình
  // cao thêm (áp dụng cho cả bản web lẫn bản app).
  useLayoutEffect(() => {
    const card = cardRef.current;
    const list = listRef.current;
    const row = rowRef.current;
    if (!card || !list || !row) return;
    const recompute = () => {
      const headerBlockHeight = list.getBoundingClientRect().top - card.getBoundingClientRect().top;
      const rowHeight = row.getBoundingClientRect().height;
      if (rowHeight <= 0) return;
      const target =
        headerBlockHeight +
        rowHeight * MAX_VISIBLE_ROWS +
        ROW_GAP * (MAX_VISIBLE_ROWS - 1) +
        PADDING_BOTTOM;
      setFixedHeight(Math.round(target));
    };
    recompute();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(recompute);
    ro.observe(row);
    ro.observe(card);
    return () => ro.disconnect();
  }, [mobile, MAX_VISIBLE_ROWS, recent.length > 0]);

  if (!walletTransfers) return null;

  return (
    <div
      ref={(el) => { cardRef.current = el; if (containerRef) containerRef.current = el; }}
      className="rounded-2xl bg-white p-4 flex flex-col"
      style={{ height: fixedHeight || WALLET_HISTORY_FALLBACK_HEIGHT }}
    >
      <div className="flex items-center gap-1.5 mb-2.5 shrink-0">
        <ArrowLeftRight size={13} style={{ color: T.muted }} />
        <h3 className="text-xs font-medium" style={{ color: T.ink }}>Lịch sử chuyển đổi tiền mặt ⇄ tài khoản</h3>
      </div>
      {recent.length === 0 ? (
        <p className="text-xs py-2" style={{ color: T.muted }}>Chưa có lượt chuyển đổi nào.</p>
      ) : (
        <div ref={listRef} className="space-y-1.5 flex-1 min-h-0 overflow-y-auto pr-1">
          {recent.map((w, idx) => {
            const toCash = w.direction === "bank_to_cash";
            const isLast = idx === recent.length - 1;
            return (
              <div
                key={w.id}
                ref={idx === 0 ? rowRef : undefined}
                className="flex items-center gap-2 text-xs"
                style={!isLast ? { paddingBottom: 6, borderBottom: `1px solid ${T.border}` } : undefined}
              >
                <span className="shrink-0" style={{ color: T.muted }}>{w.date}</span>
                <span className="flex items-center gap-1 flex-1 min-w-0" style={{ color: T.ink }}>
                  {toCash ? <Landmark size={11} style={{ color: T.green }} /> : <Banknote size={11} style={{ color: T.olive }} />}
                  <ArrowLeftRight size={10} style={{ color: T.muted }} />
                  {toCash ? <Banknote size={11} style={{ color: T.olive }} /> : <Landmark size={11} style={{ color: T.green }} />}
                </span>
                <span className="font-semibold shrink-0" style={{ color: T.ink }}>{mfmt(w.amount, hideAmounts)}</span>
                {onDeleteWalletTransfer && (
                  <button onClick={() => onDeleteWalletTransfer(w.id)} className="shrink-0 p-1 rounded-md" style={{ color: T.muted }}>
                    <Trash2 size={12} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------- Lời chào theo khung giờ (buổi sáng / chiều / tối) ----------
function Greeting({ session, className = "", style }) {
  const [period, setPeriod] = useState(() => getGreetingPeriod());
  // Tự cập nhật lại mỗi phút, phòng trường hợp người dùng mở app xuyên qua mốc chuyển buổi
  // (VD: đang mở app từ 11h59 sáng sang 12h00 trưa) mà không cần tải lại trang.
  useEffect(() => {
    const id = setInterval(() => setPeriod(getGreetingPeriod()), 60 * 1000);
    return () => clearInterval(id);
  }, []);
  const { label, Icon, color } = period;
  return (
    <span className={`ff-sans inline-flex items-center gap-1.5 ${className}`} style={style}>
      <Icon size={16} style={{ color, flexShrink: 0 }} />
      <span className="italic">
        <span className="font-semibold" style={{ color: T.ink }}>{label}</span>,{" "}
        <span className="font-bold" style={{ color: T.ink }}>{displayNameOf(session)}</span>
      </span>
    </span>
  );
}

// ---------- Màn hình Đăng nhập / Đăng ký / Quên mật khẩu / Đặt lại mật khẩu ----------
function AuthScreen({ initialMode = "login" }) {
  const [mode, setMode] = useState(initialMode); // "login" | "register" | "forgot" | "reset"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const inputStyle = { borderColor: T.border, color: T.ink, background: T.card };
  const passwordInvalid = (mode === "register" || mode === "reset") && password !== "" && !isValidPassword(password);

  const resetMessages = () => { setError(""); setNotice(""); };

  const handleLogin = async (e) => {
    e.preventDefault();
    resetMessages();
    if (!isValidEmail(email) || !password) { setError("Vui lòng nhập đầy đủ email và mật khẩu."); return; }
    setSubmitting(true);
    const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
    setSubmitting(false);
    if (err) setError("Email hoặc mật khẩu không đúng.");
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    resetMessages();
    if (!isValidEmail(email)) { setError("Email không hợp lệ."); return; }
    if (!displayName.trim()) { setError("Vui lòng nhập tên hiển thị."); return; }
    if (!isValidPassword(password)) { setError(PASSWORD_RULE_HINT); return; }
    if (password !== confirmPassword) { setError("Mật khẩu nhập lại không khớp."); return; }
    setSubmitting(true);
    const { data, error: err } = await supabase.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
      options: { data: { display_name: displayName.trim() } },
    });
    setSubmitting(false);
    if (err) { setError(err.message || "Đăng ký thất bại."); return; }
    if (data.session) {
      // Dự án đã tắt xác nhận email -> đăng nhập được ngay.
      return;
    }
    setNotice("Đăng ký thành công! Vui lòng kiểm tra email để xác nhận tài khoản trước khi đăng nhập.");
    setMode("login");
  };

  const handleForgot = async (e) => {
    e.preventDefault();
    resetMessages();
    if (!isValidEmail(email)) { setError("Email không hợp lệ."); return; }
    setSubmitting(true);
    const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo: typeof window !== "undefined" ? window.location.origin : undefined,
    });
    setSubmitting(false);
    if (err) { setError(err.message || "Không gửi được email đặt lại mật khẩu."); return; }
    setNotice("Đã gửi email đặt lại mật khẩu. Vui lòng kiểm tra hộp thư (kể cả mục spam).");
  };

  // "Quên mật khẩu" -> tạo mật khẩu MỚI và GHI ĐÈ trực tiếp lên mật khẩu cũ (không có khái
  // niệm "cấp lại"/"chỉnh sửa" mật khẩu cũ) — người dùng bấm vào link trong email, Supabase tự
  // mở app ở đúng trạng thái "reset" (sự kiện PASSWORD_RECOVERY), rồi nhập mật khẩu mới ở đây.
  const handleResetSubmit = async (e) => {
    e.preventDefault();
    resetMessages();
    if (!isValidPassword(password)) { setError(PASSWORD_RULE_HINT); return; }
    if (password !== confirmPassword) { setError("Mật khẩu nhập lại không khớp."); return; }
    setSubmitting(true);
    const { error: err } = await supabase.auth.updateUser({ password });
    setSubmitting(false);
    if (err) { setError(err.message || "Không đặt lại được mật khẩu."); return; }
    setNotice("Đặt lại mật khẩu thành công! Bạn đã được đăng nhập bằng mật khẩu mới.");
  };

  const submitHandler = mode === "login" ? handleLogin : mode === "register" ? handleRegister : mode === "forgot" ? handleForgot : handleResetSubmit;

  return (
    <div className="ff-sans" style={{ minHeight: "100vh", background: T.page, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <FontImport />
      <div className="rounded-2xl bg-white p-6 w-full max-w-sm" style={{ boxShadow: "0 16px 40px rgba(32,38,31,0.14)" }}>
        <div className="mb-5 text-center">
          <div className="ff-serif" style={{ fontWeight: 700, fontSize: 22, color: T.ink }}>Sổ Tài Chính</div>
          <p className="text-xs mt-1" style={{ color: T.muted }}>
            {mode === "login" && "Đăng nhập để tiếp tục"}
            {mode === "register" && "Tạo tài khoản mới"}
            {mode === "forgot" && "Khôi phục mật khẩu"}
            {mode === "reset" && "Đặt mật khẩu mới"}
          </p>
        </div>

        {error && <div className="rounded-lg px-3 py-2 text-xs mb-3" style={{ background: T.rustSoft, color: T.rust }}>{error}</div>}
        {notice && <div className="rounded-lg px-3 py-2 text-xs mb-3" style={{ background: T.greenSoft, color: T.green }}>{notice}</div>}

        <form onSubmit={submitHandler} className="space-y-3">
          {mode !== "reset" && (
            <div>
              <label className="text-xs mb-1 block" style={{ color: T.muted }}>Email</label>
              <div className="relative">
                <Mail size={14} style={{ color: T.muted, position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }} />
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email"
                  placeholder="ban@vidu.com" className="w-full rounded-lg border pl-8 pr-3 py-2 text-sm focus:outline-none" style={inputStyle} />
              </div>
            </div>
          )}

          {mode === "register" && (
            <div>
              <label className="text-xs mb-1 block" style={{ color: T.muted }}>Tên hiển thị</label>
              <div className="relative">
                <UserCircle2 size={14} style={{ color: T.muted, position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }} />
                <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} autoComplete="name"
                  placeholder="Tên của bạn" className="w-full rounded-lg border pl-8 pr-3 py-2 text-sm focus:outline-none" style={inputStyle} />
              </div>
            </div>
          )}

          {mode !== "forgot" && (
            <div>
              <label className="text-xs mb-1 block" style={{ color: T.muted }}>{mode === "reset" ? "Mật khẩu mới" : "Mật khẩu"}</label>
              <div className="relative">
                <Lock size={14} style={{ color: T.muted, position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }} />
                <input type={showPw ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)}
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                  placeholder="••••••••" className="w-full rounded-lg border pl-8 pr-9 py-2 text-sm focus:outline-none"
                  style={passwordInvalid ? { ...inputStyle, borderColor: T.rust } : inputStyle} />
                <button type="button" onClick={() => setShowPw((v) => !v)} className="absolute" style={{ right: 8, top: "50%", transform: "translateY(-50%)", color: T.muted }}>
                  {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
              {(mode === "register" || mode === "reset") && (
                <p className="text-[11px] mt-1" style={{ color: passwordInvalid ? T.rust : T.muted }}>{PASSWORD_RULE_HINT}</p>
              )}
            </div>
          )}

          {(mode === "register" || mode === "reset") && (
            <div>
              <label className="text-xs mb-1 block" style={{ color: T.muted }}>Nhập lại mật khẩu</label>
              <input type={showPw ? "text" : "password"} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password" placeholder="••••••••" className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none" style={inputStyle} />
            </div>
          )}

          {mode === "login" && (
            <div className="text-right">
              <button type="button" onClick={() => { resetMessages(); setMode("forgot"); }} className="text-xs font-medium" style={{ color: T.green }}>
                Quên mật khẩu?
              </button>
            </div>
          )}

          <button type="submit" disabled={submitting} className="w-full rounded-lg text-white text-sm font-medium py-2.5 flex items-center justify-center gap-1.5 disabled:opacity-50" style={{ background: T.ink }}>
            {submitting && <Loader2 size={14} className="animate-spin" />}
            {mode === "login" && "Đăng nhập"}
            {mode === "register" && "Đăng ký"}
            {mode === "forgot" && "Gửi email đặt lại mật khẩu"}
            {mode === "reset" && "Lưu mật khẩu mới"}
          </button>
        </form>

        {mode !== "reset" && (
          <p className="text-xs text-center mt-4" style={{ color: T.muted }}>
            {mode === "login" ? (
              <>Chưa có tài khoản?{" "}
                <button onClick={() => { resetMessages(); setMode("register"); }} className="font-semibold" style={{ color: T.green }}>Đăng ký</button>
              </>
            ) : (
              <>Đã có tài khoản?{" "}
                <button onClick={() => { resetMessages(); setMode("login"); }} className="font-semibold" style={{ color: T.green }}>Đăng nhập</button>
              </>
            )}
          </p>
        )}
      </div>
    </div>
  );
}

// ---------- Sidebar (web) — cùng khuôn với sidebar app "Việc Của Tôi" ----------
function Sidebar({ tab, setTab, tabs, txCountThisMonth, month, setMonth, viewMode, onViewChange, hideAmounts, onHideAmountsChange }) {
  return (
    <aside style={{ width: 220, flexShrink: 0, display: "flex", flexDirection: "column", gap: 18 }}>
      <div>
        <div className="ff-serif" style={{ fontWeight: 700, fontSize: 22, color: T.ink }}>Sổ Tài Chính</div>
        <div style={{ fontSize: 12, color: T.muted, marginTop: 2 }}>Quản lý thu chi cá nhân</div>
      </div>

      <nav style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {tabs.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className="ff-sans"
              style={{
                display: "flex", alignItems: "center", gap: 10, border: "none", cursor: "pointer",
                textAlign: "left", padding: "10px 14px", borderRadius: "10px 10px 0 0",
                background: active ? T.card : "transparent", color: active ? T.ink : T.muted,
                fontWeight: 600, fontSize: 13.5,
                boxShadow: active ? "0 1px 2px rgba(32,38,31,0.08)" : "none",
              }}
            >
              <Icon size={16} strokeWidth={2.3} style={{ color: active ? T.green : T.muted }} />
              {t.label}
            </button>
          );
        })}
      </nav>

      <div>
        <div style={{ fontSize: 11, color: T.muted, marginBottom: 6, fontWeight: 600 }}>BỘ LỌC &amp; GIAO DIỆN</div>
        <MonthPicker value={month} onChange={setMonth} className="w-full" />
        <div className="flex gap-1.5 mt-2">
          {IS_DEV && <ViewToggle value={viewMode} onChange={onViewChange} />}
          <AmountVisibilityToggle hidden={hideAmounts} onChange={onHideAmountsChange} full={!IS_DEV} />
        </div>
      </div>
    </aside>
  );
}

// ---------- Tab: Người dùng (chỉ admin thấy) ----------
// Danh sách toàn bộ tài khoản đã đăng ký (email, thời điểm tạo, đã xác nhận email chưa),
// cho phép admin: xác nhận email hộ (dành cho app thử nghiệm, người dùng gõ nhầm/không bấm
// link xác nhận), cấp/thu hồi quyền admin cho tài khoản khác, và xoá hẳn 1 tài khoản (kèm
// toàn bộ dữ liệu thu/chi của họ, nhờ "on delete cascade" trong schema). Toàn bộ thao tác đi
// qua các hàm RPC "security definer" (xem schema.sql) — hàm tự kiểm tra quyền admin ngay
// trong Postgres, nên không ai giả mạo được dù có đọc được code phía client.
// Vòng tròn avatar chữ cái đầu — màu suy ra từ email, giống cách "colorFor" tô màu danh mục,
// để mỗi người dùng có 1 màu ổn định, dễ phân biệt khi danh sách dài ra.
function UserAvatar({ email, size = 36 }) {
  const letter = (email || "?").trim().charAt(0).toUpperCase();
  const color = colorFor(email || "");
  return (
    <div
      className="rounded-full flex items-center justify-center shrink-0 font-semibold"
      style={{ width: size, height: size, background: `${color}22`, color, fontSize: size * 0.4 }}
    >
      {letter}
    </div>
  );
}

// Thẻ số liệu ở đầu tab — tổng số tài khoản / số đã xác nhận / số đang chờ xác nhận / số admin.
// Cùng khuôn với KpiCard đang dùng ở tab "Tổng quan" (viền trái màu, giá trị lớn ff-mono),
// để nhìn đồng bộ với phần còn lại của app.
function UserStatCard({ icon: Icon, label, value, accent }) {
  return (
    <div className="rounded-2xl bg-white p-4 h-full" style={{ borderLeft: `3px solid ${accent}` }}>
      <div className="flex items-center gap-2 mb-2">
        <Icon size={15} style={{ color: accent }} />
      </div>
      <p className="text-2xl font-medium ff-mono" style={{ color: T.ink }}>{value}</p>
      <p className="text-xs mt-0.5" style={{ color: T.muted }}>{label}</p>
    </div>
  );
}

function UsersTab({ currentUserId, viewMode = "web" }) {
  const mobile = viewMode === "app";
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState("");
  const [actionErr, setActionErr] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null); // { id, email } | null
  const [roleFilter, setRoleFilter] = useState("all"); // "all" | "user" | "admin"
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 5;

  const load = useCallback(async () => {
    setLoading(true);
    setLoadErr("");
    const { data, error } = await supabase.rpc("list_all_profiles");
    if (error) { setLoadErr(error.message); setLoading(false); return; }
    setRows(data || []);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const runAction = async (id, fn) => {
    setActionErr("");
    setBusyId(id);
    const { error } = await fn();
    if (error) setActionErr(error.message);
    else await load();
    setBusyId(null);
  };

  const confirmEmail = (id) => runAction(id, () => supabase.rpc("confirm_user_email", { target_user_id: id }));
  const toggleAdmin = (id, role) => runAction(id, () => supabase.rpc("set_user_role", { target_user_id: id, new_role: role === "admin" ? "user" : "admin" }));
  const performDelete = async () => {
    const target = confirmDelete;
    setConfirmDelete(null);
    if (target) await runAction(target.id, () => supabase.rpc("delete_user_account", { target_user_id: target.id }));
  };

  // Định dạng gọn: "9 Thg 4, 2026 · 15:44" thay vì chuỗi mặc định dài dòng của trình duyệt.
  const fmtDate = (iso) => {
    if (!iso) return "—";
    const d = new Date(iso);
    return `${dayLabel(localISODate(d))} · ${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
  };

  const confirmedCount = rows.filter((u) => !!u.email_confirmed_at).length;
  const pendingCount = rows.length - confirmedCount;
  const adminCount = rows.filter((u) => u.role === "admin").length;

  // Chuẩn hoá chuỗi để tìm không phân biệt hoa/thường và không phân biệt dấu tiếng Việt
  // (VD: gõ "thang" vẫn tìm ra "Thắng") — cùng cách EntryTab đang xử lý ô tìm kiếm nhật ký.
  const normalizeSearch = (s) =>
    (s || "").toString().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d");
  const searchNormalized = normalizeSearch(search.trim());

  const filteredRows = useMemo(() => {
    return rows.filter((u) => {
      if (roleFilter !== "all" && u.role !== roleFilter) return false;
      if (!searchNormalized) return true;
      return (
        normalizeSearch(u.email).includes(searchNormalized) ||
        normalizeSearch(u.display_name || "").includes(searchNormalized)
      );
    });
  }, [rows, roleFilter, searchNormalized]);

  useEffect(() => { setPage(1); }, [roleFilter, searchNormalized]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const pageSafe = Math.min(page, totalPages);
  const pagedRows = filteredRows.slice((pageSafe - 1) * PAGE_SIZE, pageSafe * PAGE_SIZE);

  return (
    <div className="space-y-4">
      {actionErr && (
        <div className="rounded-lg px-3 py-2 text-xs flex items-center gap-1.5" style={{ background: T.rustSoft, color: T.rust }}>
          <AlertTriangle size={13} className="shrink-0" /> {actionErr}
        </div>
      )}

      {!loading && !loadErr && rows.length > 0 && (
        <div className={`grid gap-3 items-stretch ${mobile ? "grid-cols-2" : "grid-cols-4"}`}>
          <UserStatCard icon={Users} label="Tổng tài khoản" value={rows.length} accent={T.green} />
          <UserStatCard icon={MailCheck} label="Đã xác nhận email" value={confirmedCount} accent={T.sage} />
          <UserStatCard icon={Mail} label="Chờ xác nhận" value={pendingCount} accent={pendingCount > 0 ? T.olive : T.muted} />
          <UserStatCard icon={ShieldCheck} label="Quản trị viên" value={adminCount} accent={T.rust} />
        </div>
      )}

      <div className="rounded-2xl bg-white p-4">
        <div className={mobile ? "space-y-2.5 mb-3" : "flex items-center justify-between gap-2 mb-3"}>
          <h3 className="text-sm font-medium flex items-center gap-1.5 shrink-0" style={{ color: T.ink }}>
            <Users size={15} style={{ color: T.green }} /> Danh sách người dùng
          </h3>
          <div className={mobile ? "space-y-2" : "flex items-center gap-2"}>
            <div className="relative">
              <Search size={13} style={{ color: T.muted, position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)" }} />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Tìm theo tên hoặc email..."
                className={`rounded-lg border pl-7 pr-7 py-1.5 text-xs focus:outline-none ${mobile ? "w-full" : ""}`}
                style={{ borderColor: T.border, color: T.ink, background: T.card, width: mobile ? undefined : 200 }}
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  aria-label="Xoá tìm kiếm"
                  className="absolute"
                  style={{ right: 7, top: "50%", transform: "translateY(-50%)", color: T.muted }}
                >
                  <X size={12} />
                </button>
              )}
            </div>
            <div className={`inline-flex rounded-full p-0.5 gap-0.5 ${mobile ? "w-full" : ""}`} style={{ background: "#E4E7DC" }}>
              {[
                { key: "all", label: "Tất cả" },
                { key: "user", label: "User" },
                { key: "admin", label: "Admin" },
              ].map((opt) => (
                <button
                  key={opt.key}
                  onClick={() => setRoleFilter(opt.key)}
                  className={`text-xs font-semibold px-2.5 py-1.5 rounded-full whitespace-nowrap ${mobile ? "flex-1" : ""}`}
                  style={{
                    border: "none", cursor: "pointer",
                    background: roleFilter === opt.key ? T.ink : "transparent",
                    color: roleFilter === opt.key ? "#fff" : T.muted,
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-10" style={{ color: T.muted }}>
            <Loader2 size={16} className="animate-spin" /> <span className="text-sm">Đang tải danh sách...</span>
          </div>
        ) : loadErr ? (
          <p className="text-sm py-8 text-center" style={{ color: T.rust }}>Lỗi: {loadErr}</p>
        ) : filteredRows.length === 0 ? (
          <p className="text-sm py-8 text-center" style={{ color: T.muted }}>
            {rows.length === 0 ? "Chưa có tài khoản nào." : "Không có tài khoản nào khớp bộ lọc."}
          </p>
        ) : (
          <div className="space-y-2.5">
            {pagedRows.map((u) => {
              const isSelf = u.id === currentUserId;
              const isAdminRow = u.role === "admin";
              const confirmed = !!u.email_confirmed_at;
              const isBusy = busyId === u.id;
              return (
                <div
                  key={u.id}
                  className="rounded-xl p-3.5 transition-colors"
                  style={{ border: `1px solid ${T.border}`, background: "#fff" }}
                >
                  <div className={`flex gap-3 ${mobile ? "flex-col" : "items-center justify-between"}`}>
                    <div className="flex items-start gap-3 min-w-0">
                      <UserAvatar email={u.email} />
                      <div className="min-w-0 pt-0.5">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <p className="text-sm font-semibold truncate" style={{ color: T.ink }}>
                            {u.display_name || u.email}
                          </p>
                          {isSelf && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full" style={{ background: T.oliveSoft, color: T.olive }}>
                              Bạn
                            </span>
                          )}
                          {isAdminRow ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full" style={{ background: T.rustSoft, color: T.rust }}>
                              <ShieldCheck size={10} /> Admin
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full" style={{ background: T.page, color: T.muted }}>
                              <UserCircle2 size={10} /> User
                            </span>
                          )}
                        </div>
                        {u.display_name && (
                          <p className="text-xs truncate mt-0.5" style={{ color: T.muted }}>{u.email}</p>
                        )}
                        <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
                          <span
                            className="inline-flex items-center gap-1 text-[10.5px] font-medium px-2 py-0.5 rounded-full"
                            style={confirmed ? { background: T.greenSoft, color: T.green } : { background: T.oliveSoft, color: T.olive }}
                          >
                            {confirmed ? <MailCheck size={10} /> : <Mail size={10} />}
                            {confirmed ? "Đã xác nhận email" : "Chưa xác nhận email"}
                          </span>
                        </div>
                        <div className="mt-2 space-y-1.5 pl-2" style={{ borderLeft: `2px solid ${T.border}` }}>
                          <div className={mobile ? "text-[11px]" : "flex items-center gap-1.5 text-[11px]"}>
                            <span className="shrink-0 block" style={{ color: T.muted, minWidth: mobile ? "auto" : 118 }}>Tham gia</span>
                            <span className="ff-mono block" style={{ color: T.ink }}>{fmtDate(u.created_at)}</span>
                          </div>
                          {u.last_sign_in_at && (
                            <div className={mobile ? "text-[11px]" : "flex items-center gap-1.5 text-[11px]"}>
                              <span className="shrink-0 block" style={{ color: T.muted, minWidth: mobile ? "auto" : 118 }}>Đăng nhập gần nhất</span>
                              <span className="ff-mono block" style={{ color: T.ink }}>{fmtDate(u.last_sign_in_at)}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className={`flex items-center gap-1.5 shrink-0 ${mobile ? "flex-wrap pl-[48px]" : ""}`}>
                      {!confirmed && (
                        <button
                          disabled={isBusy} onClick={() => confirmEmail(u.id)}
                          title="Xác nhận email hộ người dùng"
                          className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium disabled:opacity-40 transition-colors"
                          style={{ borderColor: T.green, color: T.green, background: T.card }}
                        >
                          {isBusy ? <Loader2 size={13} className="animate-spin" /> : <MailCheck size={13} />} Xác nhận email
                        </button>
                      )}
                      {!isSelf && (
                        <button
                          disabled={isBusy} onClick={() => toggleAdmin(u.id, u.role)}
                          title={isAdminRow ? "Thu hồi quyền admin" : "Cấp quyền admin"}
                          className="w-8 h-8 rounded-lg border flex items-center justify-center disabled:opacity-40 transition-colors"
                          style={{ borderColor: T.border, color: T.ink, background: T.card }}
                        >
                          {isAdminRow ? <ShieldOff size={14} /> : <ShieldCheck size={14} />}
                        </button>
                      )}
                      {!isSelf && (
                        <button
                          disabled={isBusy} onClick={() => setConfirmDelete({ id: u.id, email: u.email })}
                          title="Xoá tài khoản"
                          className="w-8 h-8 rounded-lg border flex items-center justify-center disabled:opacity-40 transition-colors"
                          style={{ borderColor: T.border, color: T.rust, background: T.card }}
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {!loading && !loadErr && filteredRows.length > PAGE_SIZE && (
          <div className={`flex items-center justify-between gap-2 mt-4 pt-3 ${mobile ? "flex-col" : ""}`} style={{ borderTop: `1px solid ${T.border}` }}>
            <p className="text-xs" style={{ color: T.muted }}>
              Trang {pageSafe}/{totalPages} · {filteredRows.length} tài khoản
            </p>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={pageSafe <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="rounded-lg border px-2.5 py-1.5 text-xs font-medium disabled:opacity-40"
                style={{ borderColor: T.border, color: T.ink, background: T.card }}
              >
                Trước
              </button>
              <button
                type="button"
                disabled={pageSafe >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="rounded-lg border px-2.5 py-1.5 text-xs font-medium disabled:opacity-40"
                style={{ borderColor: T.border, color: T.ink, background: T.card }}
              >
                Sau
              </button>
            </div>
          </div>
        )}
      </div>

      <ConfirmModal
        open={!!confirmDelete}
        title="Xoá tài khoản"
        message={`Xoá vĩnh viễn tài khoản "${confirmDelete?.email}"? Toàn bộ dữ liệu thu chi của tài khoản này sẽ bị xoá theo và không thể khôi phục.`}
        onConfirm={performDelete}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  );
}

// ---------- App ----------
export default function App() {
  const [month, setMonth] = useState(THIS_MONTH);
  const [transactions, setTransactions] = useState([]);
  const [categories, setCategories] = useState({ income: [], expense: [] });
  const [budgets, setBudgets] = useState({});
  const [walletTransfers, setWalletTransfers] = useState([]);
  const [budgetTransfers, setBudgetTransfers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [tab, setTab] = useState("overview");
  const [viewMode, setViewMode] = useState(() => detectDevice());
  const [hideAmounts, setHideAmounts] = useState(false);
  const manualOverride = useRef(false);

  useEffect(() => {
    const onResize = () => { if (!manualOverride.current) setViewMode(detectDevice()); };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const handleViewChange = (v) => { manualOverride.current = true; setViewMode(v); };

  // ---------- Đăng nhập / phiên đăng nhập (24h) ----------
  const [session, setSession] = useState(null);
  const [authReady, setAuthReady] = useState(false); // đã xác định xong có phiên hay không
  const [authScreenMode, setAuthScreenMode] = useState("login"); // ép về "reset" khi có link đặt lại mật khẩu

  // ---- Profile của chính người đang đăng nhập (để biết có phải admin không) ----
  const [myProfile, setMyProfile] = useState(null);
  const isAdmin = myProfile?.role === "admin";
  const fetchMyProfile = useCallback(async (uid) => {
    if (!supabase || !uid) { setMyProfile(null); return; }
    const { data, error } = await supabase.from("profiles").select("*").eq("id", uid).single();
    if (!error) setMyProfile(data);
  }, []);

  // Nếu mốc "đăng nhập lúc" đã lưu quá 24 giờ -> tự đăng xuất, buộc nhập lại thông tin.
  const enforceSessionExpiry = useCallback((sess) => {
    if (!sess) return sess;
    const loginAt = Number(localStorage.getItem(SESSION_LOGIN_AT_KEY) || 0);
    if (!loginAt) {
      // Phiên có sẵn nhưng chưa từng ghi mốc thời gian (VD: vừa bật tính năng này) -> ghi nhận từ bây giờ.
      localStorage.setItem(SESSION_LOGIN_AT_KEY, String(Date.now()));
      return sess;
    }
    if (Date.now() - loginAt > SESSION_MAX_AGE_MS) {
      localStorage.removeItem(SESSION_LOGIN_AT_KEY);
      supabase.auth.signOut();
      return null;
    }
    return sess;
  }, []);

  useEffect(() => {
    if (!supabase) { setAuthReady(true); return; }
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(enforceSessionExpiry(data.session));
      setAuthReady(true);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((event, newSession) => {
      if (event === "SIGNED_IN") localStorage.setItem(SESSION_LOGIN_AT_KEY, String(Date.now()));
      if (event === "SIGNED_OUT") localStorage.removeItem(SESSION_LOGIN_AT_KEY);
      if (event === "PASSWORD_RECOVERY") setAuthScreenMode("reset");
      setSession(newSession);
      setAuthReady(true);
    });
    // Kiểm tra định kỳ để tự đăng xuất đúng lúc 24h trôi qua, kể cả khi người dùng cứ để app
    // mở liên tục trên màn hình mà không thao tác gì (không đợi tới lần load trang tiếp theo).
    const interval = setInterval(() => {
      setSession((cur) => (cur ? enforceSessionExpiry(cur) : cur));
    }, 5 * 60 * 1000);
    return () => { mounted = false; listener?.subscription?.unsubscribe?.(); clearInterval(interval); };
  }, [enforceSessionExpiry]);

  const handleLogout = async () => {
    localStorage.removeItem(SESSION_LOGIN_AT_KEY);
    await supabase.auth.signOut();
  };

  // Đọc TOÀN BỘ dữ liệu thật từ Supabase (4 bảng: fin_categories, fin_subcategories,
  // fin_transactions, fin_budgets) và ghép lại thành state dùng cho UI.
  const fetchAll = useCallback(async () => {
    if (!supabase) {
      setLoadError("Chưa cấu hình Supabase: thiếu VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY trong biến môi trường.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError(null);

    const [catRes, subRes, txRes, budgetRes, transferRes, budgetTransferRes] = await Promise.all([
      supabase.from("fin_categories").select("*"),
      supabase.from("fin_subcategories").select("*"),
      supabase.from("fin_transactions").select("*").order("date", { ascending: false }),
      supabase.from("fin_budgets").select("*"),
      supabase.from("fin_wallet_transfers").select("*").order("date", { ascending: false }).order("created_at", { ascending: false }),
      supabase.from("fin_budget_transfers").select("*").order("date", { ascending: false }).order("created_at", { ascending: false }),
    ]);
    const err = catRes.error || subRes.error || txRes.error || budgetRes.error || transferRes.error || budgetTransferRes.error;
    if (err) {
      setLoadError(err.message);
      setLoading(false);
      return;
    }
    setCategories(mapCategoriesFromRows(catRes.data, subRes.data));
    setTransactions((txRes.data || []).map(mapTransactionRow));
    setBudgets(mapBudgetsFromRows(budgetRes.data));
    setWalletTransfers((transferRes.data || []).map(mapWalletTransferRow));
    setBudgetTransfers((budgetTransferRes.data || []).map(mapBudgetTransferRow));
    setLoading(false);
  }, []);

  useEffect(() => {
    if (session) {
      fetchAll();
      fetchMyProfile(session.user.id);
    } else {
      // Đã đăng xuất (hoặc chưa đăng nhập) -> xoá sạch dữ liệu đang giữ trên UI, tránh lộ dữ
      // liệu tài chính của phiên trước cho lần đăng nhập kế tiếp trên cùng thiết bị.
      setTransactions([]); setCategories({ income: [], expense: [] }); setBudgets({});
      setWalletTransfers([]); setBudgetTransfers([]); setLoading(false);
      setMyProfile(null);
    }
  }, [session, fetchAll, fetchMyProfile]);

  /* ---------- handlers: mỗi hàm cập nhật UI ngay, rồi đồng bộ với Supabase ---------- */
  const addTransaction = async (record) => {
    if (!supabase) { setLoadError("Chưa cấu hình Supabase — không thể lưu khoản ghi."); return; }
    if (record.type === "expense") {
      const walletKey = record.paymentMethod === "cash" ? "cash" : "bank";
      if (record.amount > walletBalances[walletKey]) {
        alert(`${walletKey === "cash" ? "Ví tiền mặt" : "Tài khoản ngân hàng"} không đủ số dư để ghi khoản chi này.`);
        return;
      }
    }
    const { data, error } = await supabase
      .from("fin_transactions")
      .insert({
        type: record.type,
        date: record.date,
        category: record.category,
        subcategory: record.subcategory || null,
        amount: record.amount,
        payment_method: record.paymentMethod === "cash" ? "cash" : "bank",
      })
      .select().single();
    if (error) { setLoadError(error.message); return; }
    setTransactions((prev) => [mapTransactionRow(data), ...prev]);
  };
  const updateTransaction = async (id, record) => {
    if (record.type === "expense") {
      const walletKey = record.paymentMethod === "cash" ? "cash" : "bank";
      const original = transactions.find((t) => t.id === id);
      let available = walletBalances[walletKey];
      if (original && original.type === "expense" && (original.paymentMethod === "cash" ? "cash" : "bank") === walletKey) {
        available += original.amount;
      }
      if (record.amount > available) {
        alert(`${walletKey === "cash" ? "Ví tiền mặt" : "Tài khoản ngân hàng"} không đủ số dư để lưu thay đổi này.`);
        return;
      }
    }
    setTransactions((prev) => prev.map((t) => (t.id === id ? { ...t, ...record } : t)));
    if (!supabase) return;
    const { error } = await supabase
      .from("fin_transactions")
      .update({
        type: record.type,
        date: record.date,
        category: record.category,
        subcategory: record.subcategory || null,
        amount: record.amount,
        payment_method: record.paymentMethod === "cash" ? "cash" : "bank",
      })
      .eq("id", id);
    if (error) setLoadError(error.message);
  };
  const deleteTransaction = async (id) => {
    setTransactions((prev) => prev.filter((t) => t.id !== id));
    if (!supabase) return;
    const { error } = await supabase.from("fin_transactions").delete().eq("id", id);
    if (error) setLoadError(error.message);
  };

  // Chuyển đổi qua lại giữa tiền mặt và tài khoản ngân hàng (VD: rút tiền mặt từ ATM,
  // hoặc nộp tiền mặt vào tài khoản). Không làm thay đổi TỔNG số dư — chỉ tái phân bổ
  // giữa 2 "ví", nên không cần ghi thêm 1 khoản thu/chi nào cả.
  const addWalletTransfer = async ({ direction, amount, note }) => {
    if (!amount || amount <= 0) return;
    // Chặn chuyển đổi vượt quá số dư thực có của ví nguồn (không để ví nào bị âm).
    const sourceBalance = direction === "bank_to_cash" ? walletBalances.bank : walletBalances.cash;
    if (amount > sourceBalance) {
      alert("Ví nguồn không đủ tiền để thực hiện chuyển đổi này.");
      return;
    }
    if (!supabase) { setLoadError("Chưa cấu hình Supabase — không thể lưu lượt chuyển đổi."); return; }
    const payload = { date: todayISO(), direction, amount, note: note || null };
    const { data, error } = await supabase.from("fin_wallet_transfers").insert(payload).select().single();
    if (error) { setLoadError(error.message); return; }
    setWalletTransfers((prev) => [mapWalletTransferRow(data), ...prev]);
  };
  const deleteWalletTransfer = async (id) => {
    setWalletTransfers((prev) => prev.filter((w) => w.id !== id));
    if (!supabase) return;
    const { error } = await supabase.from("fin_wallet_transfers").delete().eq("id", id);
    if (error) setLoadError(error.message);
  };

  const addCategory = async (type, name) => {
    if (!supabase) { setLoadError("Chưa cấu hình Supabase — không thể thêm danh mục."); return; }
    const position = categories[type].length;
    const { data, error } = await supabase.from("fin_categories").insert({ type, name, position }).select().single();
    if (error) { setLoadError(error.message); return; }
    setCategories((prev) => ({ ...prev, [type]: [...prev[type], { id: data.id, name: data.name, subs: [] }] }));
  };
  const addIncomeCategory = (name) => addCategory("income", name);
  const addExpenseCategory = (name) => addCategory("expense", name);

  const addSubcategory = async (type, categoryName, subName) => {
    const cat = categories[type].find((c) => c.name === categoryName);
    if (!cat) return;
    setCategories((prev) => ({
      ...prev,
      [type]: prev[type].map((c) => (c.name === categoryName ? { ...c, subs: [...c.subs, subName] } : c)),
    }));
    if (!supabase || !cat.id) return;
    const { error } = await supabase.from("fin_subcategories").insert({ category_id: cat.id, name: subName, position: cat.subs.length });
    if (error) setLoadError(error.message);
  };

  // Xoá hẳn 1 danh mục (kéo theo mọi "chi tiết" con của nó, nhờ ràng buộc "on delete cascade"
  // trong schema.sql) — chỉ xoá khỏi danh sách để chọn, KHÔNG đụng tới các khoản thu/chi đã
  // ghi trước đó (fin_transactions lưu tên bằng text, không phải khoá ngoại tới fin_categories).
  const deleteCategory = async (type, name) => {
    const cat = categories[type].find((c) => c.name === name);
    if (!cat) return;
    setCategories((prev) => ({ ...prev, [type]: prev[type].filter((c) => c.name !== name) }));
    if (!supabase || !cat.id) return;
    const { error } = await supabase.from("fin_categories").delete().eq("id", cat.id);
    if (error) setLoadError(error.message);
  };

  // Xoá 1 "chi tiết" (subcategory) con trong 1 danh mục — cũng không đụng tới các khoản
  // thu/chi đã ghi trước đó.
  const deleteSubcategory = async (type, categoryName, subName) => {
    const cat = categories[type].find((c) => c.name === categoryName);
    if (!cat) return;
    setCategories((prev) => ({
      ...prev,
      [type]: prev[type].map((c) => (c.name === categoryName ? { ...c, subs: c.subs.filter((s) => s !== subName) } : c)),
    }));
    if (!supabase || !cat.id) return;
    const { error } = await supabase.from("fin_subcategories").delete().eq("category_id", cat.id).eq("name", subName);
    if (error) setLoadError(error.message);
  };

  const upsertBudget = async (budgetMonth, category, amount) => {
    setBudgets((prev) => {
      const cur = prev[budgetMonth] || { total: null, categories: {} };
      return { ...prev, [budgetMonth]: { ...cur, categories: { ...cur.categories, [category]: amount } } };
    });
    if (!supabase) return;
    const { error } = await supabase.from("fin_budgets").upsert({ month: budgetMonth, category, amount }, { onConflict: "user_id,month,category" });
    if (error) setLoadError(error.message);
  };
  const deleteBudget = async (budgetMonth, category) => {
    setBudgets((prev) => {
      const cur = prev[budgetMonth] || { total: null, categories: {} };
      const nextCats = { ...cur.categories };
      delete nextCats[category];
      return { ...prev, [budgetMonth]: { ...cur, categories: nextCats } };
    });
    if (!supabase) return;
    const { error } = await supabase.from("fin_budgets").delete().eq("month", budgetMonth).eq("category", category);
    if (error) setLoadError(error.message);
  };

  // Chuyển ngân sách qua lại giữa 2 danh mục trong CÙNG một tháng (VD: dời phần hạn mức còn
  // dư của "Mua sắm" sang "Di chuyển") — cập nhật cả 2 dòng ngân sách, đồng thời ghi lại 1
  // dòng lịch sử vào fin_budget_transfers để hiển thị ở "Lịch sử chuyển ngân sách".
  const transferBudget = async (budgetMonth, fromCategory, toCategory, amount) => {
    if (!amount || amount <= 0) return;
    const cur = budgets[budgetMonth] || { total: null, categories: {} };
    const newFromBudget = (cur.categories[fromCategory] || 0) - amount;
    const newToBudget = (cur.categories[toCategory] || 0) + amount;
    await upsertBudget(budgetMonth, fromCategory, newFromBudget);
    await upsertBudget(budgetMonth, toCategory, newToBudget);
    if (!supabase) { setLoadError("Chưa cấu hình Supabase — không thể lưu lịch sử chuyển ngân sách."); return; }
    const payload = { month: budgetMonth, date: todayISO(), from_category: fromCategory, to_category: toCategory, amount };
    const { data, error } = await supabase.from("fin_budget_transfers").insert(payload).select().single();
    if (error) { setLoadError(error.message); return; }
    setBudgetTransfers((prev) => [mapBudgetTransferRow(data), ...prev]);
  };

  // Xoá 1 dòng lịch sử chuyển ngân sách = HOÀN TÁC lượt chuyển đó: cộng lại đúng số tiền cho
  // danh mục nguồn, trừ lại cho danh mục đích. Nếu danh mục đích đã bị giảm xuống dưới số này
  // (do có chỉnh sửa khác sau đó), chặn ở 0 để không vi phạm ràng buộc "amount >= 0".
  const deleteBudgetTransferRecord = async (id) => {
    const record = budgetTransfers.find((t) => t.id === id);
    setBudgetTransfers((prev) => prev.filter((t) => t.id !== id));
    if (record) {
      const cur = budgets[record.month] || { total: null, categories: {} };
      const restoredFrom = (cur.categories[record.from] || 0) + record.amount;
      const restoredTo = Math.max((cur.categories[record.to] || 0) - record.amount, 0);
      await upsertBudget(record.month, record.from, restoredFrom);
      await upsertBudget(record.month, record.to, restoredTo);
    }
    if (!supabase) return;
    const { error } = await supabase.from("fin_budget_transfers").delete().eq("id", id);
    if (error) setLoadError(error.message);
  };

  const tabs = [
    { id: "overview", label: "Tổng quan", shortLabel: "Tổng quan", icon: LayoutGrid },
    { id: "flow", label: "Trực quan dòng tiền", shortLabel: "Dòng tiền", icon: GitBranch },
    { id: "entry", label: "Ghi chép thu chi", shortLabel: "Ghi chép", icon: NotebookPen },
    { id: "budget", label: "Lập ngân sách", shortLabel: "Ngân sách", icon: Target },
    ...(isAdmin ? [{ id: "users", label: "Người dùng", shortLabel: "Người dùng", icon: Users }] : []),
  ];
  const currentTabLabel = tabs.find((t) => t.id === tab)?.label;
  const txCountThisMonth = transactions.filter((t) => t.date.startsWith(month)).length;

  // Số dư tiền mặt / tài khoản ngân hàng — tính LŨY KẾ từ trước tới nay (không giới hạn
  // theo tháng đang lọc), vì đây là số dư thực tế đang có trong ví/tài khoản, giống hệt
  // cách một cuốn sổ quỹ thật hoạt động. Tổng 2 số này luôn khớp đúng bằng tổng số dư
  // (tổng thu - tổng chi) tính từ trước đến nay — các lượt "chuyển đổi" chỉ tái phân bổ
  // giữa 2 ví, không làm thay đổi tổng số dư.
  const walletBalances = useMemo(() => {
    let cash = 0;
    let total = 0;
    transactions.forEach((t) => {
      const signed = t.type === "income" ? t.amount : -t.amount;
      total += signed;
      if (t.paymentMethod === "cash") cash += signed;
    });
    walletTransfers.forEach((w) => {
      if (w.direction === "cash_to_bank") cash -= w.amount;
      else cash += w.amount;
    });
    return { cash, bank: total - cash, total };
  }, [transactions, walletTransfers]);

  // "Chưa phân bổ" LŨY KẾ (kiểu YNAB) tính tới hết tháng đang xem — dùng chung cho cả 3 tab
  // (Tổng quan, Trực quan dòng tiền, Lập ngân sách) để 3 nơi luôn khớp nhau tuyệt đối.
  // Xem giải thích công thức đầy đủ ở hàm computeCumulativeUnallocated phía đầu file.
  const cumulativeUnallocated = useMemo(
    () => computeCumulativeUnallocated(transactions, budgets, month),
    [transactions, budgets, month]
  );

  // Số dư còn lại từ CUỐI THÁNG TRƯỚC (carry-over) — dùng để cộng hiển thị vào "Tổng thu nhập
  // tháng" (KPI + tab Trực quan dòng tiền), cho thấy đúng tổng "nguồn tiền" đang sẵn có tính
  // đến hiện tại. Đây CHỈ LÀ CON SỐ HIỂN THỊ, suy ra từ các giao dịch đã có — hoàn toàn không
  // ghi thêm giao dịch nào và không làm thay đổi walletBalances/số dư ví thật.
  const carryOverBalance = useMemo(
    () => computeCumulativeBalanceUpTo(transactions, monthEnd(prevMonthOf(month))),
    [transactions, month]
  );

  // ---- Chặn toàn bộ nội dung tài chính lại phía sau màn hình đăng nhập ----
  // Chỉ khi có "session" (đã đăng nhập hợp lệ, còn hạn trong 24h) thì mới render dữ liệu — nhờ
  // vậy dữ liệu KHÔNG được yêu cầu / KHÔNG hiển thị nếu chưa đăng nhập, kể cả trong 1 nhịp render.
  if (!authReady) {
    return (
      <div className="ff-sans" style={{ minHeight: "100vh", background: T.page, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <FontImport />
        <Loader2 size={22} className="animate-spin" style={{ color: T.muted }} />
      </div>
    );
  }
  if (!session) {
    return <AuthScreen initialMode={authScreenMode} />;
  }

  const statusBanner =
    loading || loadError ? (
      <div
        className="ff-sans"
        style={{
          padding: "8px 12px", borderRadius: 8, marginBottom: 14, fontSize: 12, fontWeight: 600,
          background: loadError ? T.rustSoft : T.greenSoft, color: loadError ? T.rust : T.green,
        }}
      >
        {loadError ? `Lỗi kết nối Supabase: ${loadError}` : "Đang tải dữ liệu từ Supabase..."}
      </div>
    ) : null;

  const content = (
    <>
      {statusBanner}
      {/* Giữ cả 4 tab luôn được mount sẵn, chỉ ẩn/hiện bằng CSS (display) thay vì mount/unmount
          mỗi lần chuyển tab. Trước đây mount/unmount liên tục khiến ResizeObserver đo chiều cao
          ở tab "Tổng quan" bị khởi tạo lại từ đầu mỗi lần quay lại tab đó, có lúc lỡ nhịp đo và
          hiện bảng xếp hạng dài tràn lan cho tới khi tải lại cả trang mới hết. */}
      <div style={{ display: tab === "overview" ? "block" : "none" }}>
        <OverviewTab transactions={transactions} month={month} budgets={budgets} hideAmounts={hideAmounts} viewMode={viewMode === "app" ? "app" : "web"} walletBalances={walletBalances} isActive={tab === "overview"} cumulativeUnallocated={cumulativeUnallocated} carryOverBalance={carryOverBalance} />
      </div>
      <div style={{ display: tab === "flow" ? "block" : "none" }}>
        <CashFlowTab transactions={transactions} month={month} budgets={budgets} viewMode={viewMode === "app" ? "app" : "web"} hideAmounts={hideAmounts} cumulativeUnallocated={cumulativeUnallocated} carryOverBalance={carryOverBalance} />
      </div>
      <div style={{ display: tab === "budget" ? "block" : "none" }}>
        <BudgetTab
          budgets={budgets} month={month} categories={categories} transactions={transactions} hideAmounts={hideAmounts}
          viewMode={viewMode === "app" ? "app" : "web"}
          onAddExpenseCategory={addExpenseCategory} onUpsertBudget={upsertBudget} onDeleteBudget={deleteBudget}
          onDeleteCategory={deleteCategory}
          cumulativeUnallocated={cumulativeUnallocated}
          budgetTransfers={budgetTransfers}
          onTransferBudget={transferBudget}
          onDeleteBudgetTransfer={deleteBudgetTransferRecord}
        />
      </div>
      <div style={{ display: tab === "entry" ? "block" : "none" }}>
        <EntryTab
          transactions={transactions} month={month} categories={categories} budgets={budgets}
          viewMode={viewMode === "app" ? "app" : "web"} hideAmounts={hideAmounts}
          onAddTransaction={addTransaction} onUpdateTransaction={updateTransaction} onDeleteTransaction={deleteTransaction}
          onAddIncomeCategory={addIncomeCategory} onAddSubcategory={addSubcategory}
          onDeleteCategory={deleteCategory} onDeleteSubcategory={deleteSubcategory}
          walletBalances={walletBalances} walletTransfers={walletTransfers}
          onAddWalletTransfer={addWalletTransfer} onDeleteWalletTransfer={deleteWalletTransfer}
        />
      </div>
      {isAdmin && (
        <div style={{ display: tab === "users" ? "block" : "none" }}>
          <UsersTab currentUserId={session.user.id} viewMode={viewMode === "app" ? "app" : "web"} />
        </div>
      )}
    </>
  );

  // ---------- Khung mobile ----------
  // Trên điện thoại thật (kể cả PWA standalone lẫn tab Safari), hiển thị TRÀN MÀN HÌNH,
  // không còn khung/viền/bóng đổ giả lập điện thoại — vì bản thân màn hình đã là điện thoại rồi.
  // Khung mockup (viền đen bo tròn) chỉ giữ lại khi xem thử "App" trên trình duyệt máy tính, cho dễ hình dung.
  if (viewMode !== "web") {
    const realDevice = isRealMobileDevice();

    const header = (
      <div style={{ padding: realDevice ? "calc(env(safe-area-inset-top, 0px) + 12px) 16px 10px" : "16px 16px 10px" }}>
        <div className="flex items-center justify-between">
          <div>
            <div className="ff-serif" style={{ fontWeight: 700, fontSize: 17, color: T.ink }}>Sổ Tài Chính</div>
          </div>
          <div className="flex items-center gap-1.5">
            {IS_DEV && <IconViewToggle value={viewMode} onChange={handleViewChange} />}
            <button
              type="button" onClick={handleLogout} aria-label="Đăng xuất"
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ background: T.card, border: `1px solid ${T.border}`, color: T.rust }}
            >
              <LogOut size={15} />
            </button>
          </div>
        </div>
        <Greeting session={session} className="text-xs block mt-1.5" style={{ color: T.muted }} />
        <div className="flex items-center justify-between mt-3 gap-2">
          <MonthPicker value={month} onChange={setMonth} className="text-xs px-2 py-1" />
          <div className="flex items-center gap-2">
            {tab !== "overview" && (
              <span className="ff-mono" style={{ fontSize: 11, color: T.muted }}>{txCountThisMonth} khoản</span>
            )}
            <AmountVisibilityToggle hidden={hideAmounts} onChange={setHideAmounts} />
          </div>
        </div>
      </div>
    );

    const bottomNav = (
      <div style={{ display: "flex", borderTop: `1px solid ${T.border}`, background: T.card, padding: realDevice ? "8px 6px calc(env(safe-area-inset-bottom, 0px) + 8px)" : "8px 6px", gap: 4 }}>
        {tabs.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                flex: 1, border: "none", background: "transparent", cursor: "pointer",
                display: "flex", flexDirection: "column", alignItems: "center", gap: 3, padding: "6px 0",
                color: active ? T.green : T.muted,
              }}
            >
              <Icon size={18} strokeWidth={2.3} />
              <span className="ff-sans" style={{ fontSize: 10, fontWeight: 600 }}>{t.shortLabel || t.label}</span>
            </button>
          );
        })}
      </div>
    );

    if (realDevice) {
      return (
        <div className="ff-sans" style={{ position: "fixed", inset: 0, background: T.page, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <FontImport />
          {header}
          <div style={{ flex: 1, overflowY: "auto", padding: "6px 16px 16px" }}>{content}</div>
          {bottomNav}
        </div>
      );
    }

    // ---- Preview trên desktop: giữ khung bezel điện thoại giả lập, giống hệt app "Việc Của Tôi" ----
    return (
      <div className="ff-sans" style={{ minHeight: "100vh", background: T.page, display: "flex", justifyContent: "center", padding: "24px 12px" }}>
        <FontImport />
        <div
          style={{
            width: 380, maxWidth: "100%", background: T.page, borderRadius: 34,
            border: `8px solid ${T.ink}`, boxShadow: "0 12px 34px rgba(32,38,31,0.22)",
            overflow: "hidden", display: "flex", flexDirection: "column",
          }}
        >
          {header}
          <div style={{ height: 560, overflowY: "auto", padding: "6px 16px 16px" }}>{content}</div>
          {bottomNav}
        </div>
      </div>
    );
  }

  // ---------- Khung web: sidebar cố định, giống hệt app "Việc Của Tôi" ----------
  return (
    <div className="ff-sans" style={{ minHeight: "100vh", background: T.page, display: "flex", justifyContent: "center", padding: "28px 20px" }}>
      <FontImport />
      <div style={{ width: "100%", maxWidth: 1200, display: "flex", gap: 20 }}>
        <Sidebar
          tab={tab} setTab={setTab} tabs={tabs} txCountThisMonth={txCountThisMonth}
          month={month} setMonth={setMonth} viewMode={viewMode} onViewChange={handleViewChange}
          hideAmounts={hideAmounts} onHideAmountsChange={setHideAmounts}
        />
        <main style={{ flex: 1, minWidth: 0 }}>
          <div className="flex items-center justify-between flex-wrap gap-3" style={{ margin: "4px 0 18px" }}>
            <h2 className="ff-serif" style={{ fontWeight: 600, fontSize: 24, color: T.ink, margin: 0 }}>{currentTabLabel}</h2>
            <div className="flex items-center gap-3">
              <Greeting session={session} className="text-sm" style={{ color: T.muted }} />
              <button
                type="button"
                onClick={handleLogout}
                className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium"
                style={{ borderColor: T.border, color: T.rust, background: T.card }}
              >
                <LogOut size={13} /> Đăng xuất
              </button>
            </div>
          </div>
          {content}
        </main>
      </div>
    </div>
  );
}