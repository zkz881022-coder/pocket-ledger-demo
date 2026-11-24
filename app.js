"use strict";

const appRoot = new URL("./", document.currentScript.src);
const storageKey = "pocket-ledger-demo:entries:v1:" + appRoot.pathname;
const sampleCount = 5;
const sampleTotal = 24650;
const yuan = new Intl.NumberFormat("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dateFormat = new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric" });
const timeFormat = new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
const categories = new Map([
  ["餐饮", ["餐", "dining"]],
  ["交通", ["行", "travel"]],
  ["日用", ["用", "daily"]],
  ["休闲", ["闲", "leisure"]],
  ["其他", ["其", ""]]
]);
const get = (id) => document.getElementById(id);
const form = get("entry-form");
const titleInput = form.elements.namedItem("title");
const amountInput = form.elements.namedItem("amount");
const categoryInput = form.elements.namedItem("category");
const toggleEntry = get("toggle-entry");
const entryResult = get("entry-result");
const entries = get("entries");
const checkButton = get("check-network");
const networkResult = get("network-result");
const signal = document.querySelector(".signal");
let stored = [];
let storageAvailable = true;

function formatAmount(cents) {
  return "¥" + yuan.format(cents / 100);
}

function validEntry(entry) {
  return entry && typeof entry.title === "string" && entry.title.trim() && entry.title.length <= 32 &&
    Number.isInteger(entry.cents) && entry.cents > 0 && entry.cents <= 999999999 &&
    categories.has(entry.category) && Number.isFinite(entry.date) && !Number.isNaN(new Date(entry.date).getTime());
}

function announceEntry(message) {
  entryResult.hidden = false;
  entryResult.textContent = message;
}

function createEntry(entry) {
  const row = document.createElement("li");
  const badge = document.createElement("span");
  const copy = document.createElement("div");
  const title = document.createElement("strong");
  const detail = document.createElement("span");
  const amount = document.createElement("strong");
  const [symbol, tone] = categories.get(entry.category);
  badge.className = ("category " + tone).trim();
  badge.textContent = symbol;
  badge.setAttribute("aria-hidden", "true");
  copy.className = "entry-copy";
  title.textContent = entry.title;
  detail.textContent = entry.category + " · " + dateFormat.format(entry.date);
  amount.className = "amount";
  amount.textContent = formatAmount(entry.cents);
  copy.append(title, detail);
  row.append(badge, copy, amount);
  row.dataset.localEntry = "";
  return row;
}

function renderEntries() {
  for (const row of entries.querySelectorAll("[data-local-entry]")) row.remove();
  entries.prepend(...stored.map(createEntry));
  const cents = stored.reduce((total, entry) => total + entry.cents, sampleTotal);
  get("total").textContent = formatAmount(cents);
  get("entry-count").textContent = "共 " + (sampleCount + stored.length) + " 笔";
}

function readEntries() {
  const raw = localStorage.getItem(storageKey);
  if (raw === null) return [];
  const collection = JSON.parse(raw);
  if (!Array.isArray(collection) || !collection.every(validEntry)) throw new Error("Invalid saved entries");
  return collection;
}

function setForm(open) {
  form.hidden = !open;
  toggleEntry.setAttribute("aria-expanded", String(open));
  if (open) {
    entryResult.hidden = true;
    titleInput.focus();
  } else {
    form.reset();
    titleInput.setCustomValidity("");
    amountInput.setCustomValidity("");
    toggleEntry.focus();
  }
}

try {
  stored = readEntries();
  renderEntries();
} catch {
  storageAvailable = false;
  announceEntry("此浏览器暂时无法读取演示记录，新增记录无法保存。");
}
toggleEntry.hidden = !storageAvailable;
toggleEntry.addEventListener("click", () => setForm(form.hidden));
get("cancel-entry").addEventListener("click", () => setForm(false));
titleInput.addEventListener("input", () => titleInput.setCustomValidity(""));
amountInput.addEventListener("input", () => amountInput.setCustomValidity(""));
form.addEventListener("submit", (event) => {
  event.preventDefault();
  const title = titleInput.value.trim();
  const amount = /^(\d{1,7})(?:[.,](\d{1,2}))?$/.exec(amountInput.value.trim());
  const cents = amount ? Number(amount[1]) * 100 + Number((amount[2] || "").padEnd(2, "0")) : 0;
  if (!title) {
    titleInput.setCustomValidity("请输入项目名称。");
    titleInput.reportValidity();
    return;
  }
  if (!cents) {
    amountInput.setCustomValidity("请输入大于零的金额，最多两位小数。");
    amountInput.reportValidity();
    return;
  }
  try {
    const next = [{ title, cents, category: categoryInput.value, date: Date.now() }, ...readEntries()];
    localStorage.setItem(storageKey, JSON.stringify(next));
    stored = next;
    renderEntries();
    setForm(false);
    announceEntry("已保存到此浏览器。");
  } catch {
    announceEntry("保存失败。请检查此浏览器是否允许本地存储。");
  }
});

window.addEventListener("storage", (event) => {
  if (event.key !== storageKey && event.key !== null) return;
  try {
    stored = readEntries();
    renderEntries();
  } catch {
    announceEntry("此浏览器暂时无法读取演示记录。");
  }
});

async function checkNetwork() {
  checkButton.disabled = true;
  signal.dataset.state = "checking";
  networkResult.textContent = "正在向本站发起新的网络请求…";
  const started = performance.now();
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 6500);
  const url = new URL("./connectivity.txt", appRoot);
  url.searchParams.set("_", Date.now() + "-" + Math.random().toString(36).slice(2));
  try {
    const response = await fetch(url, {
      cache: "no-store",
      credentials: "omit",
      redirect: "error",
      signal: controller.signal
    });
    if (response.status !== 200 || (await response.text()).trim() !== "pocket-ledger-online-v1") {
      throw new Error("Unexpected response");
    }
    signal.dataset.state = "online";
    const millis = Math.round(performance.now() - started);
    networkResult.textContent = "本站可连通 · " + millis + " 毫秒 · " + timeFormat.format(new Date());
  } catch {
    signal.dataset.state = "failed";
    const reason = controller.signal.aborted ? "请求超时" : "未收到本站的预期响应";
    networkResult.textContent = "无法确认连通 · " + reason + " · " + timeFormat.format(new Date()) +
      "。页面可能来自离线缓存，可切换 VPN 后重试。";
  } finally {
    window.clearTimeout(timer);
    checkButton.disabled = false;
    checkButton.textContent = "重新检测";
  }
}
checkButton.addEventListener("click", checkNetwork);

const installButton = get("install-app");
let installPrompt;
window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  installPrompt = event;
  installButton.hidden = false;
});
installButton.addEventListener("click", async () => {
  const prompt = installPrompt;
  installPrompt = undefined;
  installButton.hidden = true;
  if (prompt) {
    try {
      await prompt.prompt();
    } catch {
      // The browser menu remains available.
    }
  }
});
window.addEventListener("appinstalled", () => {
  installPrompt = undefined;
  installButton.hidden = true;
});

if ("serviceWorker" in navigator && window.isSecureContext) {
  navigator.serviceWorker.register(new URL("./sw.js", appRoot)).catch(() => {
    // Online use remains available when offline caching is blocked.
  });
}
