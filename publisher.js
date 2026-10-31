'use strict';

/**
 * publisher.js —— 模拟物联网设备的数据采集与发布
 *
 * 课程演示用的最小实现：不依赖 MQTT broker、数据库或任何第三方包，
 * 只做三件事：
 *   1. 按固定间隔"读"一次传感器（温度、湿度，带小幅随机漂移）；
 *   2. 每次读数触发一个 reading 事件（供后续 Express 可视化网页订阅）；
 *   3. 直接运行时把读数打印到控制台，并追加写入 data/readings.jsonl。
 *
 * 运行：node publisher.js
 * 停止：Ctrl + C
 */

const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const path = require('node:path');

const DEFAULTS = {
  deviceId: process.env.DEVICE_ID || 'iot-device-001',
  intervalMs: Number(process.env.PUBLISH_INTERVAL_MS || 1000),
};

/** 把数值限制在 [min, max] 区间内 */
function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/** 保留一位小数 */
function round1(value) {
  return Math.round(value * 10) / 10;
}

/** 生成 [min, max] 之间的随机数 */
function rand(min, max) {
  return Math.random() * (max - min) + min;
}

class SensorPublisher extends EventEmitter {
  constructor(options = {}) {
    super();
    this.deviceId = options.deviceId || DEFAULTS.deviceId;
    this.intervalMs = Number(options.intervalMs || DEFAULTS.intervalMs);
    this.timer = null;
    this.seq = 0;
    // 初值取常见的室内环境
    this.state = { temperature: 24.5, humidity: 55 };
  }

  /** 采集一次数据，返回一条读数对象 */
  read() {
    this.state.temperature = clamp(this.state.temperature + rand(-0.3, 0.3), 18, 32);
    this.state.humidity = clamp(this.state.humidity + rand(-1, 1), 35, 80);
    this.seq += 1;
    return {
      deviceId: this.deviceId,
      seq: this.seq,
      timestamp: new Date().toISOString(),
      temperature: round1(this.state.temperature),
      humidity: round1(this.state.humidity),
    };
  }

  /** 开始采集：立即发一条，之后按固定间隔持续发送 */
  start() {
    if (this.timer) return this;
    this.emit('start', { deviceId: this.deviceId, intervalMs: this.intervalMs });
    this.emit('reading', this.read());
    this.timer = setInterval(() => this.emit('reading', this.read()), this.intervalMs);
    return this;
  }

  /** 停止采集并清理定时器 */
  stop() {
    if (!this.timer) return this;
    clearInterval(this.timer);
    this.timer = null;
    this.emit('stop', { deviceId: this.deviceId, total: this.seq });
    return this;
  }
}

function createPublisher(options) {
  return new SensorPublisher(options);
}

module.exports = { SensorPublisher, createPublisher };

// 直接运行时才启动采集；被 require 时不产生副作用，方便后续网页复用
if (require.main === module) {
  const dataDir = path.join(__dirname, 'data');
  const dataFile = path.join(dataDir, 'readings.jsonl');
  fs.mkdirSync(dataDir, { recursive: true });

  const publisher = createPublisher();

  publisher.on('start', (info) => {
    console.log(`设备 ${info.deviceId} 已启动，采样间隔 ${info.intervalMs} ms`);
    console.log(`数据文件：${path.relative(process.cwd(), dataFile)}`);
    console.log('按 Ctrl + C 停止\n');
  });

  publisher.on('reading', (reading) => {
    fs.appendFileSync(dataFile, JSON.stringify(reading) + '\n');
    const time = new Date(reading.timestamp).toLocaleTimeString('zh-CN', { hour12: false });
    console.log(
      `[${time}] #${String(reading.seq).padStart(3, '0')}  ` +
        `温度 ${reading.temperature.toFixed(1)} °C   ` +
        `湿度 ${reading.humidity.toFixed(1)} %RH`
    );
  });

  publisher.on('stop', (info) => {
    console.log(`\n设备 ${info.deviceId} 已停止，本次共采集 ${info.total} 条读数`);
  });

  // 用户按 Ctrl + C 时优雅退出，避免留下孤儿定时器
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => {
      publisher.stop();
      process.exit(0);
    });
  }

  publisher.start();
}
