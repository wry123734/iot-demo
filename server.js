'use strict';

/**
 * server.js —— 为 publisher.js 提供数据可视化网页
 *
 * 结构：
 *   GET /               静态网页（public/）
 *   GET /api/readings   最近若干条读数（JSON），供页面首次加载
 *   GET /api/stream     SSE 实时推送，每采集一条就推给浏览器
 *
 * 启动：npm start（等价于 node server.js）
 * 端口：默认 3000，可用环境变量 PORT 覆盖
 */

const express = require('express');
const fs = require('node:fs');
const path = require('node:path');
const { createPublisher } = require('./publisher.js');

const PORT = Number(process.env.PORT || 3000);
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'readings.jsonl');
const MAX_POINTS = 120; // 内存中最多保留的读数条数

/** 内存中的最近读数，供 API 与页面使用 */
const readings = [];
/** 已连接的 SSE 客户端 */
const clients = new Set();

const publisher = createPublisher();

/** 启动时把历史读数读回内存，刷新页面不会空白 */
function loadHistory() {
  if (!fs.existsSync(DATA_FILE)) return;
  try {
    const lines = fs.readFileSync(DATA_FILE, 'utf8').split('\n').filter(Boolean);
    for (const line of lines.slice(-MAX_POINTS)) {
      try {
        readings.push(JSON.parse(line));
      } catch {
        // 单行损坏不影响整体加载
      }
    }
  } catch (err) {
    console.warn('读取历史数据失败：', err.message);
  }
}

/** 收到一条新读数：入内存、落盘、推送给所有浏览器 */
function handleReading(reading) {
  readings.push(reading);
  if (readings.length > MAX_POINTS) readings.splice(0, readings.length - MAX_POINTS);

  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.appendFileSync(DATA_FILE, JSON.stringify(reading) + '\n');
  } catch (err) {
    console.warn('写入数据文件失败：', err.message);
  }

  const payload = `data: ${JSON.stringify(reading)}\n\n`;
  for (const res of clients) res.write(payload);
}

const app = express();

app.use(express.static(path.join(__dirname, 'public')));

/** 页面初始化：设备信息 + 已有读数 */
app.get('/api/readings', (req, res) => {
  res.json({
    deviceId: publisher.deviceId,
    intervalMs: publisher.intervalMs,
    readings,
  });
});

/** SSE：新读数实时推送 */
app.get('/api/stream', (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();
  res.write('retry: 3000\n\n');
  clients.add(res);

  req.on('close', () => {
    clients.delete(res);
  });
});

loadHistory();
publisher.on('reading', handleReading);
publisher.start();

const server = app.listen(PORT, () => {
  console.log(`可视化页面已启动：http://localhost:${PORT}`);
  console.log(`设备 ${publisher.deviceId}，采样间隔 ${publisher.intervalMs} ms`);
  console.log(`已有历史读数 ${readings.length} 条，按 Ctrl + C 停止`);
});

/** 优雅退出：关采集、关连接 */
function shutdown() {
  console.log('\n正在停止服务…');
  publisher.stop();
  for (const res of clients) res.end();
  clients.clear();
  server.close(() => process.exit(0));
  // 兜底：1 秒内没关干净就强制退出
  setTimeout(() => process.exit(0), 1000).unref();
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
