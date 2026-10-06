# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Electron + React + TypeScript desktop app for the **ControlHubAA26** control hub
(NUCLEO-F439ZI firmware at
`C:\Users\rwabc\Software\Projects\ControlHubAA26\Embedded\V1\ControlHubAA26_V1\`). It
shows motor telemetry (RPM, PWM duty, current), sends controller and lift commands, and
configures the hub. Its normal connection is **MQTT**. The hub runs a SerLink stack over
MQTT (SerLink2), and the firmware's CLAUDE.md and `Core/Src/main_tasks.cpp` define the
sockets and frame formats that this app must match.

`README.md` covers the stack choices, the low-latency data path and layout tips. Its
"Wire protocol (placeholder)" section is out of date: the hub link is SerLink now (see
below), while JSON/CSV lines are still accepted as a fallback.

## Commands

```bash
npm install
npm run dev          # dev app with hot reload
npm run typecheck    # tsc for main+preload (tsconfig.node.json) and renderer (tsconfig.web.json)
npm run build        # production bundle into out/
npm run dist:win     # installer into release/<version>/
```

There are no tests and no lint step, so **`npm run typecheck` is the check after every
change**, followed by `npm run build` for anything touching build config.

If Electron starts as plain Node from the VS Code terminal ("Cannot find module
'electron'"), `ELECTRON_RUN_AS_NODE=1` is set; unset it.

## Architecture

### Process split

- **`src/main/`** is the Node/Electron side and does **all** device and file I/O. IPC
  handlers are registered in `comms/hub.ts` and `fsAccess.ts` with `ipcMain.handle`.
- **`src/preload/index.ts`** is the typed `window.api` bridge, the renderer's only way
  into main. `api.d.ts` declares it for the renderer.
- **`src/renderer/src/`** is React. Pages are in `pages/`, with routes in `router.tsx`
  (hash router; Config has nested routes in `pages/config/`). zustand stores are in
  `state/`.
- **`src/shared/types.ts`** holds the types and the `IPC` channel-name map used by all
  three. Path aliases: `@shared`, `@renderer` (`electron.vite.config.ts`).

**Adding an IPC call touches four places:** the channel name in `IPC` (`shared/types.ts`),
the handler in `main/comms/hub.ts`, the method in `preload/index.ts`, and its type in
`preload/api.d.ts`. Main → renderer pushes use `webContents.send` plus an `on(...)`
subscription in preload.

### Comms

- `comms/hub.ts` (`commsHub`) owns the active `Transport` (`serial.ts`, `mqtt.ts` or
  `simulator.ts`, all implementing `transport.ts`). It batches telemetry samples to the
  renderer every 16 ms and forwards lift status and SerLink trace lines. Late events from
  a replaced transport are ignored (`live()`).
- `comms/hubLink.ts` (`HubLink`) is the hub's SerLink sockets over any line-oriented link:
  `CTRL0` (status frames in → telemetry samples, controller commands out) and `LIFT0`
  (MQTT only). Both the serial and MQTT transports use it.
- `comms/serlink/` is a TypeScript port of SerLink (`Frame.ts`, `SerLink.ts`) that
  behaves like the firmware's Reader/Writer/Socket. A received `'T'` gets an `ACK_OK`
  straight back, `'S'` PING is answered with an `'A'`, and sends are one at a time:
  the next frame waits until the previous `'T'` is acked or times out
  (`ACK_TIMEOUT_MS` = 1000, matching the firmware's writer timeout).
- `comms/parser.ts` decodes payloads: CTRL0 / LIFT0 status data, plus JSON/CSV fallback
  lines.

**Frame formats are a contract with the firmware.** A change to what a hub socket sends
or accepts (e.g. the CTRL0 status frame `CTRL0U001008030.0350`, the `BGA` answer, the
LIFT0 status) must change `parser.ts` / `hubLink.ts` and the firmware together. Field
limits mirror the firmware's digit widths (`CTRL_RPM_MAX` 9999, `CTRL_GAIN_SCALE` 1e6,
`LIFT_DISTANCE_MAX` 999999 in `shared/types.ts`).

### MQTT

The defaults are in `DEFAULT_COMMS_CONFIG` (`shared/types.ts`):

- broker `mqtt://192.168.0.196:1883`, which must match the firmware's `MQTT_BROKER_IP`
- the app **subscribes** to `hub/aa26/serlink/up`
- the app **publishes** to `hub/aa26/serlink/down`

The topics are a pair because the broker echoes a client's own publishes back to it.
Settings persist in `userData/settings.json` (`main/settings.ts`). If the PC is the
broker, see the hub README's Norton firewall note.

### SerLink trace

With `SERLINK_TRACE` set (dev builds, or `SERLINK_DEBUG` in packaged ones,
`comms/hub.ts`), every frame sent or received is logged to the main-process console and
pushed to the renderer on `IPC.serlinkTrace` (`window.api.comms.onTrace`).

### Telemetry rendering

High-rate data never goes through React state. Samples go into a ring buffer in
`telemetry/store.ts`, and components draw imperatively per animation frame via
`useTelemetryFrame(draw)`. The charts are uPlot (`StripChart`), and the gauges are SVG
(`Gauge`). Keep it that way: putting samples in a zustand store or `useState` re-renders
the tree at the data rate.

### Files

The renderer has no filesystem access. Directories are granted through a native picker,
and `fsAccess.ts` resolves every path (including symlinks) and rejects anything outside
a granted directory.

## Conventions

- UI is MUI (`Grid`, `Stack`, `Box`, form controls), and the page skeleton is CSS Grid in
  `MainLayout`. Reusable panel chrome is `components/Panel`.
- Doc comments carry the protocol details (example frames, digit widths, which hub
  socket and link). Keep that style; it is what keeps the app in step with the firmware.
