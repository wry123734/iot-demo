'use strict';

/**
 * app.js —— 前端逻辑
 * 1. 首次加载用 GET /api/readings 取历史读数；
 * 2. 之后用 EventSource 订阅 GET /api/stream，新读数到达即重绘；
 * 3. 图表用原生 Canvas 手绘，不依赖任何 CDN，断网也能正常显示。
 */

const MAX_POINTS = 60; // 图上最多画 60 个点

const state = {
  deviceId: '—',
  intervalMs: 1000,
  readings: [],
  connected: false,
};

const el = {
  deviceId: document.getElementById('device-id'),
  interval: document.getElementById('interval'),
  conn: document.getElementById('conn'),
  liveDot: document.getElementById('live-dot'),
  tempNow: document.getElementById('temp-now'),
  humNow: document.getElementById('hum-now'),
  tempRange: document.getElementById('temp-range'),
  humRange: document.getElementById('hum-range'),
  count: document.getElementById('count'),
  lastTime: document.getElementById('last-time'),
  tempChart: document.getElementById('temp-chart'),
  humChart: document.getElementById('hum-chart'),
};

/** 取最近 n 个点 */
function recent(n) {
  return state.readings.slice(-n);
}

/** 在 canvas 上画一条折线图 */
function drawChart(canvas, points, { color, fill, unit }) {
  const dpr = window.devicePixelRatio || 1;
  const cssWidth = canvas.clientWidth || 600;
  const cssHeight = canvas.clientHeight || 220;
  if (canvas.width !== cssWidth * dpr || canvas.height !== cssHeight * dpr) {
    canvas.width = cssWidth * dpr;
    canvas.height = cssHeight * dpr;
  }

  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssWidth, cssHeight);

  const pad = { top: 18, right: 18, bottom: 26, left: 48 };
  const plotW = cssWidth - pad.left - pad.right;
  const plotH = cssHeight - pad.top - pad.bottom;

  const values = points.map((p) => p.value);
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    min = 0;
    max = 1;
  }
  if (max - min < 1e-6) {
    min -= 1;
    max += 1;
  }
  const margin = (max - min) * 0.15;
  min -= margin;
  max += margin;

  const xOf = (i) => pad.left + (points.length <= 1 ? plotW / 2 : (i / (points.length - 1)) * plotW);
  const yOf = (v) => pad.top + plotH - ((v - min) / (max - min)) * plotH;

  // 横向网格 + 纵轴刻度
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.18)';
  ctx.fillStyle = 'rgba(148, 163, 184, 0.9)';
  ctx.font = '12px system-ui, -apple-system, "Segoe UI", sans-serif';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  const gridCount = 4;
  for (let i = 0; i <= gridCount; i += 1) {
    const v = min + ((max - min) * i) / gridCount;
    const y = yOf(v);
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(pad.left + plotW, y);
    ctx.stroke();
    ctx.fillText(v.toFixed(1), pad.left - 8, y);
  }

  // 时间轴：只标首尾
  if (points.length > 0) {
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(formatTime(points[0].time), pad.left, pad.top + plotH + 8);
    if (points.length > 1) {
      ctx.textAlign = 'right';
      ctx.fillText(formatTime(points[points.length - 1].time), pad.left + plotW, pad.top + plotH + 8);
    }
  }

  if (points.length === 0) return;

  // 折线下方的渐变填充
  if (points.length > 1) {
    const grad = ctx.createLinearGradient(0, pad.top, 0, pad.top + plotH);
    grad.addColorStop(0, fill);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.beginPath();
    ctx.moveTo(xOf(0), yOf(values[0]));
    points.forEach((p, i) => ctx.lineTo(xOf(i), yOf(p.value)));
    ctx.lineTo(xOf(points.length - 1), pad.top + plotH);
    ctx.lineTo(xOf(0), pad.top + plotH);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();
  }

  // 折线
  ctx.beginPath();
  points.forEach((p, i) => {
    const x = xOf(i);
    const y = yOf(p.value);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.stroke();

  // 最新点 + 数值
  const last = points[points.length - 1];
  const lx = xOf(points.length - 1);
  const ly = yOf(last.value);
  ctx.beginPath();
  ctx.arc(lx, ly, 4, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(lx, ly, 8, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();

  ctx.fillStyle = color;
  ctx.font = 'bold 13px system-ui, -apple-system, "Segoe UI", sans-serif';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'bottom';
  ctx.fillText(`${last.value.toFixed(1)} ${unit}`, Math.min(lx + 40, cssWidth - pad.right), ly - 10);
}

function formatTime(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '--:--:--';
  return d.toLocaleTimeString('zh-CN', { hour12: false });
}

function rangeText(values, unit, digits = 1) {
  if (values.length === 0) return '—';
  return `最低 ${Math.min(...values).toFixed(digits)} / 最高 ${Math.max(...values).toFixed(digits)} ${unit}`;
}

function render() {
  const list = recent(MAX_POINTS);
  const temps = list.map((r) => r.temperature);
  const hums = list.map((r) => r.humidity);
  const last = state.readings[state.readings.length - 1];

  el.deviceId.textContent = state.deviceId;
  el.interval.textContent = `${state.intervalMs} ms`;
  el.count.textContent = String(state.readings.length);
  el.conn.textContent = state.connected ? '实时连接' : '轮询中';
  el.conn.classList.toggle('online', state.connected);
  el.liveDot.classList.toggle('on', state.connected);

  if (last) {
    el.tempNow.textContent = last.temperature.toFixed(1);
    el.humNow.textContent = last.humidity.toFixed(1);
    el.lastTime.textContent = `最近更新 ${formatTime(last.timestamp)}`;
  }
  el.tempRange.textContent = rangeText(temps, '°C');
  el.humRange.textContent = rangeText(hums, '%RH');

  drawChart(
    el.tempChart,
    list.map((r) => ({ value: r.temperature, time: r.timestamp })),
    { color: '#f97316', fill: 'rgba(249, 115, 22, 0.28)', unit: '°C' }
  );
  drawChart(
    el.humChart,
    list.map((r) => ({ value: r.humidity, time: r.timestamp })),
    { color: '#38bdf8', fill: 'rgba(56, 189, 248, 0.28)', unit: '%RH' }
  );
}

function addReading(reading) {
  // 防止重复（历史接口与 SSE 可能有交集）
  const last = state.readings[state.readings.length - 1];
  if (last && last.seq === reading.seq && last.deviceId === reading.deviceId) return;
  state.readings.push(reading);
  if (state.readings.length > 2000) state.readings.splice(0, state.readings.length - 2000);
  render();
}

async function bootstrap() {
  try {
    const res = await fetch('./api/readings');
    const data = await res.json();
    state.deviceId = data.deviceId;
    state.intervalMs = data.intervalMs;
    state.readings = data.readings || [];
    render();
  } catch (err) {
    console.error('加载历史数据失败', err);
  }
  subscribe();
}

/** 优先 SSE；不支持或失败时退回轮询 */
function subscribe() {
  if (typeof window.EventSource !== 'function') {
    startPolling();
    return;
  }
  const source = new EventSource('./api/stream');
  source.onopen = () => {
    state.connected = true;
    render();
  };
  source.onmessage = (event) => {
    try {
      addReading(JSON.parse(event.data));
    } catch (err) {
      console.error('解析推送数据失败', err);
    }
  };
  source.onerror = () => {
    state.connected = false;
    render();
    // EventSource 自带重连；持续失败时由浏览器负责，这里不重复建连
  };
}

let pollTimer = null;
function startPolling() {
  if (pollTimer) return;
  pollTimer = setInterval(async () => {
    try {
      const res = await fetch('./api/readings');
      const data = await res.json();
      state.readings = data.readings || [];
      render();
    } catch (err) {
      console.error('轮询失败', err);
    }
  }, 2000);
}

// 窗口尺寸变化时重绘，避免 canvas 被拉伸模糊
let resizeTimer = null;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(render, 120);
});

bootstrap();
