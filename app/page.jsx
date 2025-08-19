'use client';

import React, { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Crown, Trophy, RefreshCw, AlertTriangle } from "lucide-react";

/**
 * StakeAlban Leaderboard — JS (Next.js App Router)
 * Thjeshtuar për Vercel (pa shenja escape të rrezikshme).
 */

/* ---------------- Config ---------------- */
const EVENT_TITLE = "$1,900 LEADERBOARD";
const COUNTDOWN_START = { d: 30, h: 23, m: 59, s: 59 };
const EVENT_ENDS_AT = new Date(
  Date.now() +
    (((COUNTDOWN_START.d * 24 + COUNTDOWN_START.h) * 60 + COUNTDOWN_START.m) * 60 + COUNTDOWN_START.s) * 1000
);

// Prize schedule (Top 20) – total $1,900
const PRIZE_MAP = {
  1: 1000, 2: 250, 3: 100, 4: 50, 5: 50,
  6: 50, 7: 50, 8: 50, 9: 50, 10: 50,
  11: 20, 12: 20, 13: 20, 14: 20, 15: 20,
  16: 20, 17: 20, 18: 20, 19: 20, 20: 20
};

// Data mode
const DATA_MODE = "sheet"; // "sheet" | "mock"
const SHEET_CSV_URL =
  process.env.NEXT_PUBLIC_SHEET_CSV_URL ||
  "https://docs.google.com/spreadsheets/d/18ogZDflEflZrl2KYxr4ZlfXwOwoOV2itOTsHVO3Udyo/export?format=csv&gid=2077816179";

const SHEET_AUTO_REFRESH_MINUTES = 60;
const CORS_PROXIES = [
  (u) => "https://cors.isomorphic-git.org/" + u,
  (u) => "https://api.allorigins.win/raw?url=" + encodeURIComponent(u),
  (u) => "https://thingproxy.freeboard.io/fetch/" + u
];

/* ---------------- Utils ---------------- */
function normalizeSheetUrl(u) {
  try {
    const url = new URL(u);
    if (!url.hostname.includes("google") || !url.pathname.includes("/spreadsheets")) return u;
    // /spreadsheets/d/<id>/...
    const idMatch = url.pathname.match(/\/spreadsheets\/d\/([^/]+)/);
    const id = (idMatch && idMatch[1]) || url.searchParams.get("id");
    let gid = url.searchParams.get("gid") || undefined;
    const gidHashMatch = url.hash.match(/gid=([0-9]+)/);
    const gidFromHash = gidHashMatch ? gidHashMatch[1] : undefined;
    if (!gid && gidFromHash) gid = gidFromHash;
    if (!id) return u;
    const out = new URL("https://docs.google.com/spreadsheets/d/" + id + "/export");
    out.searchParams.set("format", "csv");
    if (gid) out.searchParams.set("gid", gid);
    return out.toString();
  } catch {
    return u;
  }
}

function formatUSD(n) {
  return "$ " + Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function maskUsername(name) {
  if (!name || name.length <= 3) return "***";
  const visible = name.slice(-3);
  const stars = "*".repeat(Math.max(3, name.length - 3));
  return stars + visible;
}

function useCountdown(to) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  const rem = Math.max(0, to.getTime() - now.getTime());
  const s = Math.floor(rem / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return { d, h, m, s: sec };
}

function toYouTubeEmbed(u) {
  try {
    const yt = new URL(u);
    if (yt.hostname.includes("youtube.com")) {
      if (yt.pathname.startsWith("/shorts/")) {
        const parts = yt.pathname.split("/").filter(Boolean);
        const id = parts[1] || parts[0];
        if (id) return "https://www.youtube.com/embed/" + id;
      }
      const v = yt.searchParams.get("v");
      if (v) return "https://www.youtube.com/embed/" + v;
    }
    if (yt.hostname.includes("youtu.be")) {
      const id = yt.pathname.replace("/", "");
      if (id) return "https://www.youtube.com/embed/" + id;
    }
  } catch {}
  return u;
}

/* ---------------- CSV helpers ---------------- */
function parseCSV(text) {
  const rows = [];
  let row = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];
    if (inQuotes) {
      if (ch === '"' && next === '"') { cur += '"'; i++; continue; }
      if (ch === '"') { inQuotes = false; continue; }
      cur += ch;
    } else {
      if (ch === '"') { inQuotes = true; continue; }
      if (ch === ",") { row.push(cur); cur = ""; continue; }
      if (ch === "\n") { row.push(cur); rows.push(row); row = []; cur = ""; continue; }
      if (ch === "\r") { continue; }
      cur += ch;
    }
  }
  row.push(cur);
  rows.push(row);
  return rows.filter((r) => r.length && r.join("").trim().length);
}

function detectColumns(header) {
  const H = header.map((h) => h.trim().toLowerCase());
  const find = (re) => H.findIndex((h) => re.test(h));
  return {
    iRank: find(/^(rank|place|position)$/),
    iUser: find(/^(username|user|player|name)$/),
    iWager: find(/^(wagered|wager|amount|total)$/)
  };
}

function coerceNumber(x) {
  return Number(String(x == null ? "" : x).replace(/[^0-9.\-]/g, ""));
}

/* ---------------- Mock Data ---------------- */
function makeMockRows(count = 25) {
  const base = Array.from({ length: count }).map((_, i) => {
    const rank = i + 1;
    const username = "player_" + String(rank).padStart(3, "0");
    const wagered = Math.max(500 + (count - i) * 12000 + Math.random() * 5000, 0);
    return { id: "u_" + rank, rank, username, wagered };
  });
  return base.sort((a, b) => b.wagered - a.wagered).map((r, i) => ({ ...r, rank: i + 1 }));
}

/* -------- CSV fetch with fallbacks (handles CORS) -------- */
async function fetchCSVWithFallbacks(url, signal) {
  const attempts = [url, ...CORS_PROXIES.map((fn) => fn(url))];
  let lastErr = null;
  for (const u of attempts) {
    try {
      const res = await fetch(u, { cache: "no-store", mode: "cors", referrerPolicy: "no-referrer", signal });
      if (!res.ok) { lastErr = new Error("HTTP " + res.status); continue; }
      const text = await res.text();
      const head = text.trim().slice(0, 64).toLowerCase();
      if (head.startsWith("<!doctype html") || head.startsWith("<html")) {
        lastErr = new Error("HTML payload (not CSV)");
        continue;
      }
      return text;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error("All fetch attempts failed");
}

async function fetchFromSheet(url) {
  const ac = new AbortController();
  const tm = setTimeout(() => ac.abort(), 8000);
  try {
    const normalized = normalizeSheetUrl(url);
    const text = await fetchCSVWithFallbacks(normalized, ac.signal);
    const rows = parseCSV(text);
    if (!rows.length) throw new Error("Empty sheet");
    const header = rows[0];
    const { iRank, iUser, iWager } = detectColumns(header);
    if (iRank < 0 || iUser < 0 || iWager < 0) throw new Error("Missing required columns");
    const out = rows
      .slice(1)
      .filter((r) => r.length)
      .map((r, i) => {
        const rank = coerceNumber(r[iRank] || i + 1);
        const username = String(r[iUser] || ("player_" + String(rank).padStart(3, "0")));
        const wagered = coerceNumber(r[iWager] || "0");
        return { id: "u_" + rank, rank, username, wagered };
      })
      .filter((r) => Number.isFinite(r.rank));
    return out.sort((a, b) => a.rank - b.rank);
  } finally {
    clearTimeout(tm);
  }
}

async function fetchLeaderboard() {
  if (DATA_MODE === "sheet" && SHEET_CSV_URL) {
    try {
      const rows = await fetchFromSheet(SHEET_CSV_URL);
      return { rows, modeUsed: "sheet" };
    } catch (e) {
      console.warn("Sheet fetch failed, using mock instead.", e);
      return { rows: makeMockRows(25), modeUsed: "mock" };
    }
  }
  await new Promise((r) => setTimeout(r, 150));
  return { rows: makeMockRows(25), modeUsed: "mock" };
}

/* ---------------- UI atoms ---------------- */
function Pill({ children }) {
  return (
    <div className="inline-flex items-center gap-2 px-4 py-1 rounded-lg bg-slate-800 text-slate-100 text-sm shadow-lg shadow-black/20">
      {children}
    </div>
  );
}

function RankBadge({ n }) {
  const cfg = {
    1: { grad: ["#E9D98B", "#C2A953"], stroke: "#b08a2e", text: "#0b1220" },
    2: { grad: ["#E5E9EF", "#BFC6D1"], stroke: "#8E9AA7", text: "#0b1220" },
    3: { grad: ["#E7B07A", "#B77A3E"], stroke: "#945e2f", text: "#ffffff" }
  };
  const g = cfg[n];
  const id = "rb-grad-" + n;
  return (
    <div className="absolute -top-7 left-1/2 -translate-x-1/2 drop-shadow-[0_2px_6px_rgba(0,0,0,0.45)] pointer-events-none">
      <svg width="72" height="40" viewBox="0 0 72 40" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={g.grad[0]} />
            <stop offset="100%" stopColor={g.grad[1]} />
          </linearGradient>
        </defs>
        <path d="M14 14 h12 a2 2 0 0 1 2 2 v4 a2 2 0 0 1 -2 2 h-12 l4 -4 z" fill="#0f172a" opacity="0.6" />
        <path d="M58 14 h-12 a2 2 0 0 0 -2 2 v4 a2 2 0 0 0 2 2 h12 l-4 -4 z" fill="#0f172a" opacity="0.6" />
        <polygon points="36,6 48,13 48,27 36,34 24,27 24,13" fill={"url(#" + id + ")"} stroke={g.stroke} strokeWidth="1.5" />
        <text x="36" y="20" textAnchor="middle" dominantBaseline="middle" fontWeight="800" fontSize="14" fill={g.text}>{n}</text>
      </svg>
    </div>
  );
}

function MessageBar({ intent = "warn", children }) {
  const classes =
    intent === "warn"
      ? "bg-amber-500/10 text-amber-300 border-amber-500/30"
      : "bg-sky-500/10 text-sky-300 border-sky-500/30";
  return (
    <div className={"mt-2 text-[11px] px-2 py-1 rounded border " + classes + " inline-flex items-center gap-2"}>
      {intent === "warn" ? <AlertTriangle className="h-3 w-3" /> : null}
      {children}
    </div>
  );
}

/* ---------------- Components ---------------- */
function StatBlock({ label, value }) {
  return (
    <div className="bg-slate-900/80 border border-slate-700 rounded-xl">
      <div className="py-5 px-6 text-center">
        <div className="text-4xl md:text-5xl font-extrabold leading-none text-white font-mono tracking-widest">{value}</div>
        <div className="text-[12px] text-slate-300 mt-2 uppercase tracking-wider">{label}</div>
      </div>
    </div>
  );
}

function Countdown({ endsAt }) {
  const { d, h, m, s } = useCountdown(endsAt);
  return (
    <div className="mx-auto w-full max-w-2xl grid grid-cols-4 gap-3">
      <StatBlock label="D" value={d} />
      <StatBlock label="H" value={h} />
      <StatBlock label="M" value={m} />
      <StatBlock label="S" value={s} />
    </div>
  );
}

function PodiumCard({ rank, user, amount, prize, big = false }) {
  return (
    <div className={"relative rounded-xl border border-slate-800 bg-slate-900/60 " + (big ? "p-8" : "p-6") + " text-center shadow-xl shadow-black/30"}>
      <RankBadge n={rank} />
      <div className="mx-auto h-14 w-14 rounded-full bg-slate-800 flex items-center justify-center text-slate-300 font-semibold">Stake</div>
      <div className="mt-3 text-lg font-semibold tracking-wide">{maskUsername(user)}</div>
      <div className="mt-1 text-slate-300 text-sm">{formatUSD(amount)}</div>
      <div className="mt-4">
        <Pill><span className="font-semibold">{formatUSD(prize)}</span> <Trophy className="h-4 w-4" /></Pill>
      </div>
    </div>
  );
}

function Table({ rows }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-800">
      <table className="w-full text-sm">
        <thead className="bg-slate-900">
          <tr>
            <th className="text-left px-4 py-3">Place</th>
            <th className="text-left px-4 py-3">Player</th>
            <th className="text-left px-4 py-3">Wagered</th>
            <th className="text-left px-4 py-3">Prize</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t border-slate-800">
              <td className="px-4 py-3 font-medium">{r.rank}</td>
              <td className="px-4 py-3">{maskUsername(r.username)}</td>
              <td className="px-4 py-3">{formatUSD(r.wagered)}</td>
              <td className="px-4 py-3">{PRIZE_MAP[r.rank] ? formatUSD(PRIZE_MAP[r.rank]) : ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function HomeSection({ onExplore }) {
  const bonusHref = "https://stake.com/?offer=alban&c=FSZxXU9g";
  return (
    <section className="max-w-6xl mx-auto px-4 py-16">
      <div className="text-center">
        <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight uppercase">
          THE BEST EXCLUSIVE
          <br />
          REWARDS & BONUSES
        </h1>
        <p className="mt-5 text-slate-300 max-w-2xl mx-auto">
          Claim exclusive bonuses, compete in leaderboards, participate in Giveaways and much more.
        </p>
        <div className="mt-8 flex justify-center">
          <button
            onClick={onExplore}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-blue-600 hover:bg-blue-500 text-white font-semibold shadow-lg shadow-blue-900/40 border border-blue-400/40"
          >
            <Trophy className="h-4 w-4" /> Explore Leaderboard
          </button>
        </div>
      </div>

      <div className="mt-16 grid md:grid-cols-3 gap-6">
        <div className="overflow-hidden border border-slate-800 bg-slate-900/70 rounded-xl">
          <div className="h-36 bg-gradient-to-b from-slate-600/20 to-slate-900/10 flex items-center justify-center">
            <div className="text-5xl font-extrabold text-white drop-shadow-[0_2px_6px_rgba(0,0,0,0.6)]">$21</div>
          </div>
          <div className="p-4">
            <div className="text-2xl text-center text-white font-semibold">FREE BONUS</div>
            <ul className="text-sm text-slate-300 space-y-2 mt-2">
              <li>✓ Sign up under code <b>"QuickTiming"</b></li>
              <li>✓ New users only</li>
              <li>✓ Contact us on Discord</li>
              <li>✓ Receive $21 for Free</li>
            </ul>
            <div className="mt-4">
              <a href={bonusHref} target="_blank" rel="noreferrer" className="block text-center w-full py-3 rounded-md bg-blue-600 hover:bg-blue-500 border border-blue-400/40 font-semibold">Claim Bonus</a>
            </div>
          </div>
        </div>

        <div className="overflow-hidden border border-slate-800 bg-slate-900/70 rounded-xl">
          <div className="h-36 bg-gradient-to-b from-slate-600/20 to-slate-900/10 flex items-center justify-center">
            <div className="text-5xl font-extrabold text-white drop-shadow-[0_2px_6px_rgba(0,0,0,0.6)]">$60,000</div>
          </div>
          <div className="p-4">
            <div className="text-2xl text-center text-white font-semibold">LEADERBOARD</div>
            <ul className="text-sm text-slate-300 space-y-2 mt-2">
              <li>✓ Sign up under code <b>"QuickTiming"</b></li>
              <li>✓ Wager on Stake.com</li>
              <li>✓ Check the leaderboard rankings!</li>
            </ul>
            <div className="mt-4">
              <a href={bonusHref} target="_blank" rel="noreferrer" className="block text-center w-full py-3 rounded-md bg-blue-600 hover:bg-blue-500 border border-blue-400/40 font-semibold">Claim Bonus</a>
            </div>
          </div>
        </div>

        <div className="overflow-hidden border border-slate-800 bg-slate-900/70 rounded-xl">
          <div className="h-36 bg-gradient-to-b from-slate-600/20 to-slate-900/10 flex items-center justify-center">
            <div className="text-5xl font-extrabold text-white drop-shadow-[0_2px_6px_rgba(0,0,0,0.6)]">200%</div>
          </div>
          <div className="p-4">
            <div className="text-2xl text-center text-white font-semibold">DEPOSIT BONUS</div>
            <ul className="text-sm text-slate-300 space-y-2 mt-2">
              <li>✓ Sign up under code <b>"QuickTiming"</b></li>
              <li>✓ Deposit $100–$500</li>
              <li>✓ No Max. Bet Wager 40x</li>
              <li>✓ Contact us on Discord</li>
            </ul>
            <div className="mt-4">
              <a href={bonusHref} target="_blank" rel="noreferrer" className="block text-center w-full py-3 rounded-md bg-blue-600 hover:bg-blue-500 border border-blue-400/40 font-semibold">Claim Bonus</a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------------- Page ---------------- */
export default function Page() {
  const [rows, setRows] = useState([]);
  const [source, setSource] = useState(DATA_MODE);
  const [nav, setNav] = useState("leaderboard"); // "home" | "leaderboard" | "media"
  const [media, setMedia] = useState([
    { id: 1, title: "Short 1", type: "youtube", url: "https://www.youtube.com/shorts/WWv8rTOL7N0" },
    { id: 2, title: "Short 2", type: "youtube", url: "https://www.youtube.com/shorts/ZKteuvCIdls" },
    { id: 3, title: "Short 3", type: "youtube", url: "https://www.youtube.com/shorts/OhOV0yVVgnQ" },
    { id: 4, title: "Short 4", type: "youtube", url: "https://www.youtube.com/shorts/d6F-2tiLonY" }
  ]);
  const [lastRefresh, setLastRefresh] = useState(null);
  const [sheetError, setSheetError] = useState(null);

  useEffect(() => {
    fetchLeaderboard().then(({ rows, modeUsed }) => {
      setRows(rows);
      setSource(modeUsed);
      setLastRefresh(new Date());
      setSheetError(modeUsed === "mock" && DATA_MODE === "sheet" ? "Could not reach Google Sheet. Showing mock data." : null);
    });
  }, []);

  useEffect(() => {
    if (DATA_MODE !== "sheet" || !SHEET_CSV_URL) return;
    const iv = setInterval(async () => {
      try {
        const r = await fetchFromSheet(SHEET_CSV_URL);
        setRows(r);
        setLastRefresh(new Date());
        setSource("sheet");
        setSheetError(null);
      } catch (e) {
        console.warn("Sheet auto-refresh failed", e);
        setSheetError("Auto-refresh failed (still showing last data).");
      }
    }, SHEET_AUTO_REFRESH_MINUTES * 60 * 1000);
    return () => clearInterval(iv);
  }, []);

  async function refreshSheetNow() {
    if (!SHEET_CSV_URL) { alert("Set NEXT_PUBLIC_SHEET_CSV_URL first."); return; }
    try {
      const r = await fetchFromSheet(SHEET_CSV_URL);
      setRows(r);
      setLastRefresh(new Date());
      setSource("sheet");
      setSheetError(null);
    } catch (e) {
      console.error("Manual sheet refresh failed", e);
      setSheetError("Failed to refresh from sheet. Check the URL and sharing settings.");
      alert("Failed to refresh from sheet. Check the URL and CORS.");
    }
  }

  function onCSVUpload(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = String(reader.result || "");
        const lines = text.split(/\r?\n/).filter(Boolean);
        const header = (lines[0] || "").toLowerCase();
        const hasHeader = header.includes("rank") && header.includes("user");
        const dataLines = hasHeader ? lines.slice(1) : lines;
        const parsed = dataLines.map((ln, i) => {
          const [a, b, c] = ln.split(",");
          const rank = Number((a || "").trim() || i + 1);
          const username = (b || "").trim() || ("player_" + String(rank).padStart(3, "0"));
          const wagered = Number(String(c || "0").replace(/[^0-9.]/g, ""));
          return { id: "u_" + rank, rank, username, wagered };
        }).filter((r) => Number.isFinite(r.rank));
        setRows(parsed.sort((x, y) => x.rank - y.rank));
        setSource("csv");
        setLastRefresh(new Date());
        setSheetError(null);
      } catch (e) {
        console.error("CSV parse error", e);
        alert("CSV parse error. Expected: rank,username,wagered");
      }
    };
    reader.readAsText(file);
  }

  function onMediaUpload(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = String(reader.result || "");
        let items = [];
        if (file.name.toLowerCase().endsWith(".json")) {
          const json = JSON.parse(text);
          const arr = Array.isArray(json) ? json : (json.items || json.data || []);
          items = arr
            .map((obj, i) => {
              const t = obj.type === "youtube" || obj.type === "mp4" || obj.type === "image" ? obj.type : "image";
              const title = typeof obj.title === "string" ? obj.title : "Item " + (i + 1);
              const url = typeof obj.url === "string" ? obj.url : "";
              const thumb = typeof obj.thumb === "string" ? obj.thumb : undefined;
              return { id: i + 1, title, type: t, url, thumb };
            })
            .filter((x) => x.url.length > 0);
        } else {
          const lines = text.split(/\r?\n/).filter(Boolean);
          const header = (lines[0] || "").toLowerCase();
          const dataLines = header.includes("type") ? lines.slice(1) : lines;
          items = dataLines.map((ln, i) => {
            const parts = ln.split(",").map((s) => (s || "").trim());
            const t = parts[0] === "youtube" || parts[0] === "mp4" || parts[0] === "image" ? parts[0] : "image";
            return { id: i + 1, title: parts[1] || "Item " + (i + 1), type: t, url: parts[2] || "", thumb: parts[3] || undefined };
          }).filter((x) => x.url.length > 0);
        }
        setMedia(items);
      } catch (e) {
        console.error("Media import failed", e);
        alert("Media import failed. Use JSON array or CSV: type,title,url,thumb");
      }
    };
    reader.readAsText(file);
  }

  const top3 = useMemo(() => rows.slice(0, 3), [rows]);
  const rest = useMemo(() => rows.slice(3), [rows]);

  const navBtn = (label, key) => (
    <button
      onClick={() => setNav(key)}
      className={"px-4 py-1 rounded-full " + (nav === key ? "bg-slate-800 text-slate-100" : "text-slate-300 hover:bg-slate-800/80")}
    >
      {label}
    </button>
  );

  return (
    <div className="min-h-screen text-slate-100 bg-slate-950">
      {/* Top Navbar */}
      <header className="border-b border-slate-800 bg-slate-950/90">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-bold tracking-wide text-lg">ALBAN</span>
          </div>
          <nav className="hidden md:flex items-center gap-2 bg-slate-900/80 p-1 rounded-full border border-slate-800">
            {navBtn("Home", "home")}
            {navBtn("Leaderboard", "leaderboard")}
            {navBtn("Media", "media")}
          </nav>
          <div className="h-7 w-7" />
        </div>
      </header>

      {/* Segmented control */}
      {nav === "leaderboard" && (
        <div className="max-w-6xl mx-auto px-4 mt-6 flex justify-center">
          <div className="inline-flex items-center bg-slate-900/80 border border-slate-800 rounded-xl p-1">
            <button className="px-6 py-2 rounded-lg bg-slate-800 shadow-inner">Stake</button>
          </div>
        </div>
      )}

      {/* Title */}
      <section className="max-w-6xl mx-auto px-4 pt-6">
        <motion.h1 initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="text-center text-4xl font-extrabold tracking-wide">
          {EVENT_TITLE}
        </motion.h1>
      </section>

      {nav === "home" && <HomeSection onExplore={() => setNav("leaderboard")} />}

      {nav === "leaderboard" && (
        <>
          {/* Podium */}
          <section className="max-w-6xl mx-auto px-4 pt-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-end">
              <div className="md:order-1 order-2"><PodiumCard rank={2} user={(top3[1] && top3[1].username) || "player_002"} amount={(top3[1] && top3[1].wagered) || 671632.10} prize={PRIZE_MAP[2]} /></div>
              <div className="md:order-2 order-1"><PodiumCard rank={1} user={(top3[0] && top3[0].username) || "player_001"} amount={(top3[0] && top3[0].wagered) || 5137939.44} prize={PRIZE_MAP[1]} big /></div>
              <div className="md:order-3 order-3"><PodiumCard rank={3} user={(top3[2] && top3[2].username) || "player_003"} amount={(top3[2] && top3[2].wagered) || 613149.13} prize={PRIZE_MAP[3]} /></div>
            </div>
          </section>

          {/* Countdown */}
          <section className="max-w-6xl mx-auto px-4 py-8">
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-6">
              <Countdown endsAt={EVENT_ENDS_AT} />
              <p className="text-center text-xs text-slate-400 mt-3">Wager abuse may result in disqualification</p>
            </div>
          </section>

          {/* Table */}
          <section className="max-w-6xl mx-auto px-4 pb-10">
            <div className="text-sm font-medium mb-2 flex items-center justify-between gap-3">
              <span>Leaderboard</span>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-slate-400">Source: {String(source).toUpperCase()}</span>
                {DATA_MODE === "sheet" && (
                  <button onClick={refreshSheetNow} className="text-[11px] px-2 py-1 rounded border border-slate-800 hover:bg-slate-900 inline-flex items-center gap-1">
                    <RefreshCw className="h-3 w-3" /> Refresh
                  </button>
                )}
                <label className="text-[11px] px-2 py-1 rounded border border-slate-800 cursor-pointer hover:bg-slate-900">
                  Import CSV
                  <input type="file" accept=".csv" className="hidden" onChange={(e) => { const f = e.target.files && e.target.files[0]; if (f) onCSVUpload(f); }} />
                </label>
              </div>
            </div>
            {DATA_MODE === "sheet" && lastRefresh && (
              <div className="text-[11px] text-slate-500 mb-2">Last refreshed: {lastRefresh.toLocaleString()}</div>
            )}
            {sheetError && (
              <MessageBar intent="warn">
                {sheetError} – verify the link uses /export?format=csv and the sheet is shared to "Anyone with the link".
                Or set NEXT_PUBLIC_SHEET_CSV_URL in Vercel → Project → Settings → Environment Variables.
              </MessageBar>
            )}
            <Table rows={[...top3, ...rest]} />
            <div className="text-[11px] text-slate-400 mt-3 flex items-start gap-2">
              <img src="https://upload.wikimedia.org/wikipedia/commons/5/50/18%2B_logo.svg" alt="18+" className="h-4 mt-0.5" />
              <span>We do not take responsibility for any losses from gambling in casinos or betting sites linked or promoted here. As a player, you are responsible for your bets.</span>
            </div>
          </section>
        </>
      )}

      {nav === "media" && (
        <section className="max-w-6xl mx-auto px-4 py-10">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold">Media</h2>
            <label className="text-[11px] px-2 py-1 rounded border border-slate-800 cursor-pointer hover:bg-slate-900">
              Import JSON/CSV
              <input
                type="file"
                accept=".json,.csv"
                className="hidden"
                onChange={(e) => { const f = e.target.files && e.target.files[0]; if (f) onMediaUpload(f); }}
              />
            </label>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {media.map((m) => (
              m.type === "youtube" ? (
                <div key={m.id} className="rounded-xl overflow-hidden border border-slate-800 bg-slate-900/60">
                  <div className="aspect-video">
                    <iframe
                      className="w-full h-full"
                      src={toYouTubeEmbed(m.url)}
                      title={m.title}
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                    />
                  </div>
                  <div className="p-3 text-sm text-slate-300">{m.title}</div>
                </div>
              ) : m.type === "mp4" ? (
                <div key={m.id} className="rounded-xl overflow-hidden border border-slate-800 bg-slate-900/60">
                  <video className="w-full aspect-video" src={m.url} controls poster={m.thumb} />
                  <div className="p-3 text-sm text-slate-300">{m.title}</div>
                </div>
              ) : (
                <a key={m.id} href={m.url} target="_blank" rel="noreferrer" className="group rounded-xl overflow-hidden border border-slate-800 bg-slate-900/60">
                  <img src={m.url} alt={m.title} className="w-full h-40 object-cover group-hover:opacity-90" />
                  <div className="p-3 text-sm text-slate-300">{m.title}</div>
                </a>
              )
            ))}
          </div>
          <p className="text-xs text-slate-400 mt-4">
            JSON format: [{"title":"..","type":"youtube|mp4|image","url":"..","thumb":".."}]. CSV headers: type,title,url,thumb
          </p>
        </section>
      )}

      {/* Footer */}
      <footer className="border-t border-slate-800 bg-slate-950/90">
        <div className="max-w-6xl mx-auto px-4 py-6 text-xs text-slate-400 flex items-center justify-between">
          <span>© {new Date().getFullYear()} YourSite. All rights reserved.</span>
          <span className="hidden sm:inline-flex items-center gap-2"><Crown className="h-4 w-4" /> Not affiliated with Stake.</span>
        </div>
      </footer>
    </div>
  );
}
