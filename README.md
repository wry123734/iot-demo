# iot-demo

物联网设计与创新课程实践项目。

## 项目结构

```text
iot-demo/
├── publisher.js      # 模拟设备：按间隔采集温湿度，触发 reading 事件
├── server.js         # Express 服务：提供可视化网页与数据接口
├── public/           # 网页（原生 HTML/CSS/Canvas，无 CDN 依赖）
│   ├── index.html
│   ├── app.js
│   └── style.css
├── package.json
├── .env.example      # 环境变量名与示例值（复制为 .env 后生效）
├── README.md
├── data/             # 运行后自动创建，存放 readings.jsonl（已被忽略，不提交）
└── .gitignore
```

## 运行方式

环境要求：Windows 11 x64 + Node.js 18 及以上（本机实测 Node 26.13.0）。

首次运行先装依赖：

```powershell
npm install
```

### 打开可视化网页

```powershell
npm start
```

然后浏览器访问 <http://localhost:3000>，页面会实时显示温度、湿度曲线。

- `Ctrl + C` 停止服务
- 端口被占用时可用环境变量换端口：`$env:PORT=3001; npm start`

### 只运行数据采集脚本

```powershell
npm run publish
# 等价于 node publisher.js
```

控制台每秒输出一条读数，按 `Ctrl + C` 停止：

```text
设备 iot-device-001 已启动，采样间隔 1000 ms
数据文件：data\readings.jsonl
按 Ctrl + C 停止

[15:20:01] #001  温度 24.6 °C   湿度 54.8 %RH
```

## 网页实现说明

- `server.js` 在进程内启动 `publisher.js`，采集到的读数写入 `data/readings.jsonl`，同时推送浏览器；
- 页面首次加载调用 `GET /api/readings` 取历史数据，之后用 `GET /api/stream`（SSE）实时接收新读数；
- 图表用浏览器原生 Canvas 绘制，不依赖 ECharts、Chart.js 等外部 CDN，断网也能显示；
- 浏览器不支持 SSE 时自动退回 2 秒轮询。

## 环境变量

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `DEVICE_ID` | `iot-device-001` | 设备标识，写入每条读数 |
| `PUBLISH_INTERVAL_MS` | `1000` | 采样间隔（毫秒） |
| `PORT` | `3000` | 网页服务端口 |

## 数据格式

`data/readings.jsonl` 为 JSON Lines，每行一条读数：

```json
{"deviceId":"iot-device-001","seq":1,"timestamp":"2026-10-31T07:20:01.234Z","temperature":24.6,"humidity":54.8}
```

## 当前状态

- 已完成：模拟传感器采集（`publisher.js`），读数落盘
- 已完成：Express 可视化网页（`server.js` + `public/`），SSE 实时刷新
