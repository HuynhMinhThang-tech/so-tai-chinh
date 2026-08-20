import React, { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { createClient } from "@supabase/supabase-js";
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, LabelList,
} from "recharts";
import {
  Wallet, TrendingUp, TrendingDown, PiggyBank, ChevronDown, ChevronRight,
  Plus, Pencil, Trash2, LayoutGrid, GitBranch, NotebookPen, X, Check,
  Monitor, Smartphone, Target, Eye, EyeOff, Banknote, Landmark, ArrowLeftRight, AlertTriangle,
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
const monthEnd = (ym) => { const [y, m] = ym.split("-").map(Number); return new Date(y, m, 0).toISOString().slice(0, 10); };
const dayLabel = (iso) => { const [y, m, d] = iso.split("-"); return `${parseInt(d, 10)} Thg ${parseInt(m, 10)}, ${y}`; };

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
function mapBudgetsFromRows(rows) {
  const budgets = {};
  (rows || []).forEach((r) => {
    if (!budgets[r.month]) budgets[r.month] = { total: null, categories: {} };
    budgets[r.month].categories[r.category] = Number(r.amount);
  });
  return budgets;
}

// ---------- Small UI atoms ----------
function KpiCard({ icon: Icon, label, value, accent }) {
  return (
    <div className="rounded-2xl bg-white p-4" style={{ borderLeft: `3px solid ${accent}` }}>
      <div className="flex items-center gap-2 mb-2">
        <Icon size={15} style={{ color: accent }} />
      </div>
      <p className="text-2xl font-medium ff-mono" style={{ color: T.ink }}>{value}</p>
      <p className="text-xs mt-0.5" style={{ color: T.muted }}>{label}</p>
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

// ---------- Tab 1: Overview ----------
function OverviewTab({ transactions, month, budgets, hideAmounts, viewMode = "web", walletBalances }) {
  const mobile = viewMode === "app";
  // Kích thước chữ / góc nghiêng trục biểu đồ co giãn theo giao diện đang xem: ở "app"
  // (màn hình hẹp) chữ cần nhỏ hơn và nhãn trục X cần nghiêng nhiều hơn để không bị chật/đè chữ.
  const chartUI = {
    axisFont: mobile ? 9 : 11,
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
  const balance = totalIncome - totalExpense;

  const mb = budgets[month] || { total: null, categories: {} };

  // Phân bổ dòng tiền ra theo danh mục (lv1) — dùng SỐ NGÂN SÁCH đã đặt cho từng danh mục
  // (không phải số đã chi thực tế), cộng thêm "Chưa phân bổ" (thu nhập chưa được gán vào ngân sách nào).
  const byCategory = useMemo(() => {
    const budgetedCats = mb.categories || {};
    const totalBudgeted = Object.values(budgetedCats).reduce((s, v) => s + v, 0);
    // Nếu ngân sách đã lập vượt quá thu nhập (ví dụ lập trước ngân sách cho tháng chưa có thu nhập,
    // hoặc thu nhập tháng này thấp hơn dự kiến), lấy TỔNG NGÂN SÁCH làm mẫu số để chia tỷ lệ %,
    // để các lát cắt luôn cộng lại đúng 100%. Ngược lại (thu nhập >= ngân sách) vẫn lấy thu nhập làm mẫu số như cũ.
    const denom = totalBudgeted > totalIncome ? totalBudgeted : totalIncome;
    const list = Object.entries(budgetedCats).map(([name, value], i) => ({
      name, value, color: colorFor(name, i), pct: denom ? Math.round((value / denom) * 100) : 0,
    }));
    const unallocated = totalIncome - totalBudgeted;
    if (unallocated > 0) {
      list.push({ name: "Chưa phân bổ", value: unallocated, color: "#C9C4AE", pct: denom ? Math.round((unallocated / denom) * 100) : 0 });
    }
    list.sort((a, b) => b.value - a.value);
    return list;
  }, [mb, totalIncome]);

  // Xếp hạng theo danh mục chi tiết (lv1 - lv2), khoản nào dùng nhiều nhất
  const bySubCategory = useMemo(() => {
    const map = {};
    txMonth.filter((t) => t.type === "expense").forEach((t) => {
      const sub = t.subcategory || "Khác";
      const key = t.category + " · " + sub;
      if (!map[key]) map[key] = { key, category: t.category, subcategory: sub, value: 0, color: colorFor(t.category) };
      map[key].value += t.amount;
    });
    return Object.values(map).sort((a, b) => b.value - a.value);
  }, [txMonth]);

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
  const unallocatedBudget = useMemo(() => {
    const totalCatBudget = Object.values(mb.categories).reduce((s, v) => s + v, 0);
    return totalIncome - totalCatBudget;
  }, [mb, totalIncome]);

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

  return (
    <div className="space-y-5">
      <div className={`grid gap-3 ${mobile ? "grid-cols-1" : "grid-cols-3"}`}>
        <KpiCard icon={TrendingUp} label="Tổng thu nhập tháng" value={mfmt(totalIncome, hideAmounts)} accent={T.green} />
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
                margin={{ top: 8, right: 8, left: -4, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={T.border} />
                <XAxis dataKey="day" tick={{ fontSize: chartUI.axisFont, fill: T.muted }} />
                <YAxis width={34} tick={{ fontSize: chartUI.axisFont, fill: T.muted }} tickFormatter={(v) => (hideAmounts ? "***" : `${v / 1000000}tr`)} />
                <Tooltip formatter={(v) => mfmt(v, hideAmounts)} />
                <Bar dataKey="thu" name="Thu nhập" fill={T.green} radius={[4, 4, 0, 0]} />
                <Bar dataKey="chi" name="Chi tiêu" fill={T.olive} radius={[4, 4, 0, 0]} />
              </BarChart>
            </div>
          </>
        ) : (
          <div style={{ width: "100%", height: chartUI.chartHeight }}>
            <ResponsiveContainer>
              <BarChart data={byDay} margin={{ top: 8, right: 8, left: -4, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={T.border} />
                <XAxis dataKey="day" tick={{ fontSize: chartUI.axisFont, fill: T.muted }} />
                <YAxis width={34} tick={{ fontSize: chartUI.axisFont, fill: T.muted }} tickFormatter={(v) => (hideAmounts ? "***" : `${v / 1000000}tr`)} />
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
        <div className="rounded-2xl bg-white p-4">
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

        <div className="rounded-2xl bg-white p-4 flex flex-col">
          <h3 className="text-sm font-medium mb-3" style={{ color: T.ink }}>Xếp hạng danh mục chi tiêu</h3>
          <div className="space-y-3 overflow-y-auto pr-1 flex-1" style={{ minHeight: 0 }}>
            {bySubCategory.map((c) => {
              const pct = totalExpense ? Math.round((c.value / totalExpense) * 100) : 0;
              return (
                <div key={c.key}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: c.color }} />
                    <span className="text-sm flex-1 truncate" style={{ color: T.ink }}>
                      {c.category} <span style={{ color: T.muted }}>· {c.subcategory}</span>
                    </span>
                    <span className="text-xs font-medium shrink-0" style={{ color: T.muted }}>{pct}%</span>
                    <span className="text-sm font-medium shrink-0" style={{ color: T.ink }}>{mfmt(c.value, hideAmounts)}</span>
                  </div>
                  <div className="h-2 rounded-full overflow-hidden" style={{ background: T.page }}>
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: c.color }} />
                  </div>
                </div>
              );
            })}
            {bySubCategory.length === 0 && <p className="text-sm" style={{ color: T.muted }}>Chưa có dữ liệu.</p>}
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
              <BarChart data={budgetVsActual} margin={{ top: 10, right: 8, left: -4, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={T.border} />
                <XAxis dataKey="name" tick={{ fontSize: chartUI.axisFont, fill: T.muted }} interval={0} angle={chartUI.xAngle} textAnchor="end" height={chartUI.xHeight} />
                <YAxis width={34} domain={[0, budgetChartMax]} tick={{ fontSize: chartUI.axisFont, fill: T.muted, fontFamily: "'Inter', system-ui, sans-serif" }} tickFormatter={(v) => mShort(v, hideAmounts)} />
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

function CashFlowTab({ transactions, month, budgets, viewMode = "web", hideAmounts }) {
  const txMonth = useMemo(() => transactions.filter((t) => t.date.startsWith(month)), [transactions, month]);
  const totalIncome = txMonth.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0);
  const totalExpense = txMonth.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0);
  const mb = budgets[month] || { total: null, categories: {} };

  const incomeByCat = useMemo(() => {
    const map = {};
    txMonth.filter((t) => t.type === "income").forEach((t) => { map[t.category] = (map[t.category] || 0) + t.amount; });
    return Object.entries(map).map(([name, value]) => ({ name, value }));
  }, [txMonth]);

  // "Chưa phân bổ" dùng cùng công thức với biểu đồ "Phân bổ dòng tiền ra theo danh mục" và
  // "Ngân sách so với thực chi": thu nhập trừ đi tổng ngân sách đã gán cho các danh mục — để 3 nơi luôn khớp nhau.
  const totalCatBudget = useMemo(() => Object.values(mb.categories).reduce((s, v) => s + v, 0), [mb]);
  const unallocated = totalIncome - totalCatBudget;

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
    Object.values(map).forEach((c) => c.items.sort((a, b) => a.date.localeCompare(b.date)));
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
    list.push({ name: "Chưa phân bổ", value: unallocated, items: [], isUnallocated: true });
    return list;
  }, [txMonth, unallocated, mb]);

  const [expanded, setExpanded] = useState(() => new Set());
  const toggle = (name) => setExpanded((prev) => { const next = new Set(prev); next.has(name) ? next.delete(name) : next.add(name); return next; });

  if (viewMode === "app") {
    return (
      <div className="space-y-4">
        <div className="rounded-2xl bg-white p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium" style={{ color: T.ink }}>Dòng tiền vào</h3>
            <span className="text-sm font-semibold" style={{ color: T.green }}>{mfmt(totalIncome, hideAmounts)}</span>
          </div>
          {totalIncome === 0 ? (
            <p className="text-sm text-center py-6" style={{ color: T.muted }}>Chưa ghi nhận thu nhập nào trong tháng này.</p>
          ) : (
            <div className="space-y-2">
              {incomeByCat.map((c) => (
                <div key={c.name} className="flex items-center justify-between rounded-xl px-3 py-2.5" style={{ background: T.greenSoft }}>
                  <span className="text-sm" style={{ color: T.green }}>{c.name}</span>
                  <span className="text-sm font-semibold" style={{ color: T.ink }}>{mfmt(c.value, hideAmounts)}</span>
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
          {totalIncome === 0 && totalExpense === 0 ? (
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
                        {c.items.length === 0 ? (
                          <p className="text-xs pt-1.5" style={{ color: T.muted }}>Chưa có khoản chi nào trong danh mục này.</p>
                        ) : (
                          c.items.map((it) => (
                            <div key={it.id} className="flex items-center justify-between text-xs pt-1.5">
                              <span style={{ color: T.muted }}>Ngày {it.date.slice(8, 10)} · {it.subcategory || "—"}</span>
                              <span style={{ color: T.ink }}>{mfmt(it.amount, hideAmounts)}</span>
                            </div>
                          ))
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
        {totalIncome === 0 ? (
          <p className="text-sm text-center py-8" style={{ color: T.muted }}>Chưa ghi nhận thu nhập nào trong tháng này.</p>
        ) : (
          <div className="fin-tree min-w-max mx-auto" style={{ transform: "scaleY(-1)" }}>
            <ul><li>
              <NodeBox className="min-w-[170px]" style={{ background: T.green, color: "#fff", transform: "scaleY(-1)" }}>
                <p className="text-xs opacity-90">Tổng thu nhập</p>
                <p className="font-semibold">{mfmt(totalIncome, hideAmounts)}</p>
              </NodeBox>
              <ul>
                {incomeByCat.map((c) => (
                  <li key={c.name}>
                    <NodeBox style={{ background: T.greenSoft, transform: "scaleY(-1)" }}>
                      <p className="text-xs" style={{ color: T.green }}>{c.name}</p>
                      <p className="text-sm font-semibold" style={{ color: T.ink }}>{mfmt(c.value, hideAmounts)}</p>
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
        {totalIncome === 0 && totalExpense === 0 ? (
          <p className="text-sm text-center py-8" style={{ color: T.muted }}>Chưa ghi nhận dòng tiền nào trong tháng này.</p>
        ) : (
          <div className="fin-tree min-w-max mx-auto">
            <ul><li>
              <NodeBox className="min-w-[170px]" style={{ background: T.rust, color: "#fff" }}>
                <p className="text-xs opacity-90">Tổng dòng tiền ra</p>
                <p className="font-semibold">{mfmt(totalIncome, hideAmounts)}</p>
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
                          {c.items.length === 0 ? (
                            <p className="text-xs" style={{ color: T.muted }}>Chưa có khoản chi nào trong danh mục này.</p>
                          ) : (
                            c.items.map((it) => (
                              <div key={it.id} className="relative pl-5 pt-2 first:pt-0">
                                <span className="absolute left-[-1px] top-5 w-5 h-px" style={{ background: T.border }} />
                                <NodeBox className="w-full max-w-xs" style={{ background: T.page }}>
                                  <p className="text-[11px]" style={{ color: T.muted }}>Ngày {it.date.slice(8, 10)}</p>
                                  <p className="text-xs font-medium truncate" style={{ color: T.ink }}>{it.subcategory || "—"}</p>
                                  <p className="text-xs" style={{ color: T.muted }}>{mfmt(it.amount, hideAmounts)}</p>
                                </NodeBox>
                              </div>
                            ))
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
function BudgetTab({ budgets, month, categories, transactions, hideAmounts, viewMode = "web", onAddExpenseCategory, onUpsertBudget, onDeleteBudget }) {
  const mobile = viewMode === "app";
  // Tab này có bộ chọn tháng RIÊNG, tách biệt với bộ lọc tháng chung của toàn app,
  // để có thể lập ngân sách trước cho tháng sau mà không ảnh hưởng tháng đang xem ở các tab khác.
  const [budgetMonth, setBudgetMonth] = useState(month);

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

  // Ngân sách tổng của tháng luôn bằng đúng tổng thu nhập tháng đó (khớp với tab "Trực quan dòng tiền"),
  // không còn là con số đặt tay tách biệt — toàn bộ thu nhập là "chiếc bánh" cần phân bổ.
  const totalCatBudget = useMemo(() => Object.values(mb.categories).reduce((s, v) => s + v, 0), [mb]);
  const unallocatedNow = totalIncome - totalCatBudget;
  const pctAllocated = totalIncome > 0
    ? Math.min(100, Math.round((totalCatBudget / totalIncome) * 100))
    : (totalCatBudget > 0 ? 100 : 0);

  // ---- category (lv1) budgets ----
  const [catForm, setCatForm] = useState({ category: "", amount: "" });
  const [editingCat, setEditingCat] = useState(null);
  const [addingNewCat, setAddingNewCat] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const budgetedCats = Object.keys(mb.categories);
  const availableCats = categories.expense.map((c) => c.name).filter((n) => !budgetedCats.includes(n) || n === editingCat);

  useEffect(() => { setCatForm({ category: "", amount: "" }); setEditingCat(null); setAddingNewCat(false); setNewCatName(""); }, [budgetMonth]);

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
    // Nếu đang sửa và người dùng đã đổi sang danh mục khác, xoá ngân sách cũ (theo tên cũ)
    // trước khi lưu ngân sách mới dưới tên danh mục vừa chọn — tránh để lại 2 dòng ngân sách.
    if (editingCat && editingCat !== catForm.category) {
      await onDeleteBudget(budgetMonth, editingCat);
    }
    await onUpsertBudget(budgetMonth, catForm.category, Number(catForm.amount));
    setCatForm({ category: "", amount: "" });
    setEditingCat(null);
  };
  const startEditCat = (name) => { setEditingCat(name); setCatForm({ category: name, amount: String(mb.categories[name]) }); };
  const cancelEditCat = () => { setEditingCat(null); setCatForm({ category: "", amount: "" }); };
  const removeCatBudget = async (name) => {
    await onDeleteBudget(budgetMonth, name);
    if (editingCat === name) cancelEditCat();
  };

  return (
    <div className="space-y-5">
      <div className="rounded-2xl bg-white p-5">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <h3 className="text-sm font-medium" style={{ color: T.ink }}>Ngân sách và chưa phân bổ — {monthLabel(budgetMonth)}</h3>
          <MonthPicker value={budgetMonth} onChange={setBudgetMonth} className="text-xs px-2 py-1" />
        </div>

        <div>
          {totalIncome <= 0 && (
            <p className="text-xs mb-3" style={{ color: T.muted }}>
              Chưa có thu nhập nào được ghi nhận cho tháng này — bạn vẫn có thể lập hạn mức ngân sách và ghi chép chi tiêu bình thường, phần dưới sẽ hiển thị là "Ngân sách vượt thu nhập" cho đến khi có thu nhập được ghi nhận.
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
          <p className="text-xs mt-1.5" style={{ color: T.muted }}>Tổng thu nhập tháng này: {mfmt(totalIncome, hideAmounts)}</p>
        </div>
      </div>

      <div className="rounded-2xl bg-white p-5">
        <h3 className="text-sm font-medium mb-3" style={{ color: T.ink }}>Ngân sách theo danh mục — {monthLabel(budgetMonth)}</h3>

        <form onSubmit={submitCatBudget} className={mobile ? "grid grid-cols-1 gap-3 mb-5" : "flex flex-wrap gap-2 mb-5 items-end"}>
          <div className={mobile ? "w-full" : "flex-1 min-w-[160px]"}>
            <label className="text-xs mb-1 block" style={{ color: T.muted }}>Danh mục</label>
            {!addingNewCat ? (
              <select value={catForm.category}
                onChange={(e) => {
                  if (e.target.value === NEW_OPTION) { setAddingNewCat(true); return; }
                  setCatForm((f) => ({ ...f, category: e.target.value }));
                }}
                className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none disabled:opacity-60" style={inputStyle}>
                <option value="">— Chọn danh mục —</option>
                {availableCats.map((n) => (<option key={n} value={n}>{n}</option>))}
                <option value={NEW_OPTION}>+ Thêm danh mục mới</option>
              </select>
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
          <div className={mobile ? "w-full" : "w-40"}>
            <label className="text-xs mb-1 block" style={{ color: T.muted }}>Hạn mức</label>
            <div className="relative">
              <input type="text" inputMode="numeric" value={formatAmount(catForm.amount)}
                onChange={(e) => setCatForm((f) => ({ ...f, amount: digitsOnly(e.target.value) }))}
                placeholder="0" className="w-full rounded-lg border pl-3 pr-9 py-2 text-sm focus:outline-none" style={inputStyle} />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs" style={{ color: T.muted }}>đ</span>
            </div>
          </div>
          <button type="submit" className={`rounded-lg px-3 py-2 text-white text-sm font-medium flex items-center justify-center gap-1 ${mobile ? "w-full" : ""}`} style={{ background: T.ink }}>
            {editingCat ? <Check size={14} /> : <Plus size={14} />} {editingCat ? "Lưu" : "Thêm"}
          </button>
          {editingCat && (
            <button type="button" onClick={cancelEditCat} className={`rounded-lg border px-3 py-2 text-sm ${mobile ? "w-full" : ""}`} style={{ borderColor: T.border, color: T.muted }}>Hủy</button>
          )}
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
    </div>
  );
}

// ---------- Tab 3: Entry log ----------
const NEW_OPTION = "__new__";

function EntryTab({
  transactions, month, categories, budgets, viewMode = "web", hideAmounts,
  onAddTransaction, onUpdateTransaction, onDeleteTransaction, onAddIncomeCategory, onAddSubcategory,
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

  const txMonth = useMemo(() => transactions.filter((t) => t.date.startsWith(month)).sort((a, b) => b.date.localeCompare(a.date)), [transactions, month]);
  const logFilterMaxDate = useMemo(() => { const end = monthEnd(month); const today = todayISO(); return end < today ? end : today; }, [month]);
  useEffect(() => { setLogDateFrom(""); setLogDateTo(""); }, [month]);
  const filteredLogTx = useMemo(
    () =>
      txMonth.filter(
        (t) =>
          (!logDateFrom || t.date >= logDateFrom) &&
          (!logDateTo || t.date <= logDateTo) &&
          (logTypeFilter === "all" || t.type === logTypeFilter)
      ),
    [txMonth, logDateFrom, logDateTo, logTypeFilter]
  );
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
    <div className={`grid gap-5 ${mobile ? "grid-cols-1" : "grid-cols-5"}`}>
      <div className={mobile ? "space-y-4" : "col-span-2 space-y-4"}>
      <form onSubmit={submit} className="rounded-2xl bg-white p-5 h-fit space-y-4">
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
            <select
              value={form.category}
              onChange={(e) => {
                if (e.target.value === NEW_OPTION) { setAddingNewCategory(true); return; }
                setForm((f) => ({ ...f, category: e.target.value, subcategory: "" }));
              }}
              className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none" style={inputStyle}>
              <option value="">— Chọn danh mục —</option>
              {activeCategories.map((c) => (<option key={c.name} value={c.name}>{c.name}</option>))}
              {form.type === "income" && <option value={NEW_OPTION}>+ Thêm danh mục mới</option>}
            </select>
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
            <div className="space-y-2">
              <select
                value={form.subcategory}
                disabled={!form.category}
                onChange={(e) => {
                  if (e.target.value === NEW_OPTION) { setAddingNewSub(true); return; }
                  setForm((f) => ({ ...f, subcategory: e.target.value }));
                }}
                className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none disabled:opacity-50"
                style={inputStyle}>
                <option value="">{form.category ? "— Chọn chi tiết (không bắt buộc) —" : "— Chọn danh mục trước —"}</option>
                {subOptions.map((s) => (<option key={s} value={s}>{s}</option>))}
                {form.category && <option value={NEW_OPTION}>+ Thêm danh mục mới</option>}
              </select>
            </div>
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
        <div className="p-4" style={{ borderBottom: `1px solid ${T.border}` }}>
          <h3 className="text-sm font-medium mb-3" style={{ color: T.ink }}>Nhật ký {monthLabel(month)}</h3>
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
          <div className="p-3 space-y-4">
            {txByDay.length === 0 && <p className="text-sm text-center py-10" style={{ color: T.muted }}>Chưa có khoản ghi nào trong khoảng thời gian này.</p>}
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
          <div className="max-h-[560px] overflow-y-auto">
            {filteredLogTx.length === 0 && <p className="text-sm text-center py-10" style={{ color: T.muted }}>Chưa có khoản ghi nào trong khoảng thời gian này.</p>}
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

      <WalletTransferHistory walletTransfers={walletTransfers} onDeleteWalletTransfer={onDeleteWalletTransfer} hideAmounts={hideAmounts} mobile={mobile} />
      </div>
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
function WalletTransferHistory({ walletTransfers, onDeleteWalletTransfer, hideAmounts, mobile }) {
  if (!walletTransfers) return null;
  const recent = walletTransfers.slice(0, 8);
  return (
    <div className="rounded-2xl bg-white p-4">
      <div className="flex items-center gap-1.5 mb-2.5">
        <ArrowLeftRight size={13} style={{ color: T.muted }} />
        <h3 className="text-xs font-medium" style={{ color: T.ink }}>Lịch sử chuyển đổi tiền mặt ⇄ tài khoản</h3>
      </div>
      {recent.length === 0 ? (
        <p className="text-xs py-2" style={{ color: T.muted }}>Chưa có lượt chuyển đổi nào.</p>
      ) : (
        <div className="space-y-1.5">
          {recent.map((w) => {
            const toCash = w.direction === "bank_to_cash";
            return (
              <div key={w.id} className="flex items-center gap-2 text-xs">
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
              {t.id === "entry" && txCountThisMonth > 0 && (
                <span className="ff-mono" style={{ marginLeft: "auto", fontSize: 10.5, color: T.muted }}>{txCountThisMonth}</span>
              )}
            </button>
          );
        })}
      </nav>

      <div>
        <div style={{ fontSize: 11, color: T.muted, marginBottom: 6, fontWeight: 600 }}>BỘ LỌC &amp; GIAO DIỆN</div>
        <MonthPicker value={month} onChange={setMonth} className="w-full" />
        <div className="flex gap-1.5 mt-2">
          <ViewToggle value={viewMode} onChange={onViewChange} />
          <AmountVisibilityToggle hidden={hideAmounts} onChange={onHideAmountsChange} />
        </div>
      </div>
    </aside>
  );
}

// ---------- App ----------
export default function App() {
  const [month, setMonth] = useState(THIS_MONTH);
  const [transactions, setTransactions] = useState([]);
  const [categories, setCategories] = useState({ income: [], expense: [] });
  const [budgets, setBudgets] = useState({});
  const [walletTransfers, setWalletTransfers] = useState([]);
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

    const [catRes, subRes, txRes, budgetRes, transferRes] = await Promise.all([
      supabase.from("fin_categories").select("*"),
      supabase.from("fin_subcategories").select("*"),
      supabase.from("fin_transactions").select("*").order("date", { ascending: false }),
      supabase.from("fin_budgets").select("*"),
      supabase.from("fin_wallet_transfers").select("*").order("date", { ascending: false }).order("created_at", { ascending: false }),
    ]);
    const err = catRes.error || subRes.error || txRes.error || budgetRes.error || transferRes.error;
    if (err) {
      setLoadError(err.message);
      setLoading(false);
      return;
    }
    setCategories(mapCategoriesFromRows(catRes.data, subRes.data));
    setTransactions((txRes.data || []).map(mapTransactionRow));
    setBudgets(mapBudgetsFromRows(budgetRes.data));
    setWalletTransfers((transferRes.data || []).map(mapWalletTransferRow));
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

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

  const upsertBudget = async (budgetMonth, category, amount) => {
    setBudgets((prev) => {
      const cur = prev[budgetMonth] || { total: null, categories: {} };
      return { ...prev, [budgetMonth]: { ...cur, categories: { ...cur.categories, [category]: amount } } };
    });
    if (!supabase) return;
    const { error } = await supabase.from("fin_budgets").upsert({ month: budgetMonth, category, amount }, { onConflict: "month,category" });
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

  const tabs = [
    { id: "overview", label: "Tổng quan", shortLabel: "Tổng quan", icon: LayoutGrid },
    { id: "flow", label: "Trực quan dòng tiền", shortLabel: "Dòng tiền", icon: GitBranch },
    { id: "entry", label: "Ghi chép thu chi", shortLabel: "Ghi chép", icon: NotebookPen },
    { id: "budget", label: "Lập ngân sách", shortLabel: "Ngân sách", icon: Target },
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
      {tab === "overview" && <OverviewTab transactions={transactions} month={month} budgets={budgets} hideAmounts={hideAmounts} viewMode={viewMode === "app" ? "app" : "web"} walletBalances={walletBalances} />}
      {tab === "flow" && <CashFlowTab transactions={transactions} month={month} budgets={budgets} viewMode={viewMode === "app" ? "app" : "web"} hideAmounts={hideAmounts} />}
      {tab === "budget" && (
        <BudgetTab
          budgets={budgets} month={month} categories={categories} transactions={transactions} hideAmounts={hideAmounts}
          viewMode={viewMode === "app" ? "app" : "web"}
          onAddExpenseCategory={addExpenseCategory} onUpsertBudget={upsertBudget} onDeleteBudget={deleteBudget}
        />
      )}
      {tab === "entry" && (
        <EntryTab
          transactions={transactions} month={month} categories={categories} budgets={budgets}
          viewMode={viewMode === "app" ? "app" : "web"} hideAmounts={hideAmounts}
          onAddTransaction={addTransaction} onUpdateTransaction={updateTransaction} onDeleteTransaction={deleteTransaction}
          onAddIncomeCategory={addIncomeCategory} onAddSubcategory={addSubcategory}
          walletBalances={walletBalances} walletTransfers={walletTransfers}
          onAddWalletTransfer={addWalletTransfer} onDeleteWalletTransfer={deleteWalletTransfer}
        />
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
            <div style={{ fontSize: 11, color: T.muted, marginTop: 1 }}>{currentTabLabel}</div>
          </div>
          <IconViewToggle value={viewMode} onChange={handleViewChange} />
        </div>
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
          <h2 className="ff-serif" style={{ fontWeight: 600, fontSize: 24, color: T.ink, margin: "4px 0 18px" }}>{currentTabLabel}</h2>
          {content}
        </main>
      </div>
    </div>
  );
}