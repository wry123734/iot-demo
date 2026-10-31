# iot-demo

物联网设计与创新课程实践项目。

## 项目结构

```text
iot-demo/
├── publisher.js      # 模拟设备：按间隔采集温湿度，写入 data/readings.jsonl
├── package.json
├── .env.example      # 环境变量名与示例值（复制为 .env 后生效）
├── README.md
├── data/             # 运行后自动创建，存放 readings.jsonl（已被忽略，不提交）
└── .gitignore
```

## 运行方式

环境要求：Windows 11 x64 + Node.js 18 及以上（本机实测 Node 26.13.0）。

在项目根目录执行：

```powershell
node publisher.js
# 或
npm start
```

启动后控制台每秒输出一条读数，按 `Ctrl + C` 停止：

```text
设备 iot-device-001 已启动，采样间隔 1000 ms
数据文件：data\readings.jsonl
按 Ctrl + C 停止

[15:20:01] #001  温度 24.6 °C   湿度 54.8 %RH
[15:20:02] #002  温度 24.7 °C   湿度 55.3 %RH
```

## 环境变量

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `DEVICE_ID` | `iot-device-001` | 设备标识，写入每条读数 |
| `PUBLISH_INTERVAL_MS` | `1000` | 采样间隔（毫秒） |

## 数据格式

`data/readings.jsonl` 为 JSON Lines，每行一条读数：

```json
{"deviceId":"iot-device-001","seq":1,"timestamp":"2026-10-31T07:20:01.234Z","temperature":24.6,"humidity":54.8}
```

## 当前状态

- 已完成：模拟传感器采集，读数落盘 `data/readings.jsonl`
- 待完成：用 Express 为 `publisher.js` 添加数据可视化网页（课程第四步）
