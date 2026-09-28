# ControlHub AA26 – Desktop App

Electron + React desktop app for real-time motor telemetry (speed, PWM duty, current),
motor commands and configuration. Runs on Windows and Linux.

## Quick start

```bash
npm install
npm run dev        # hot-reloading dev app (renderer HMR, main/preload auto-restart)
```

Press **Connect** to subscribe to the hub over MQTT (default: `mqtt://192.168.0.196:1883`,
topic `hub/aa26/serlink/up`). To see data without hardware, choose **Simulator** under
**Config → Communications**.

> Running from the VS Code integrated terminal: if Electron starts as plain Node
> ("Cannot find module 'electron'"), the terminal has `ELECTRON_RUN_AS_NODE=1` set.
> Unset it (`Remove-Item Env:ELECTRON_RUN_AS_NODE` in PowerShell) or use an external terminal.

| Script | What it does |
|---|---|
| `npm run dev` | Dev app with hot reload |
| `npm run typecheck` | TypeScript check (main + renderer) |
| `npm run build` | Production bundle into `out/` |
| `npm run dist:win` / `dist:linux` | Installer into `release/<version>/` (NSIS / AppImage + deb) |

Linux installers are best built on Linux (or via the GitHub release workflow).

## Stack

| Concern | Choice | Why |
|---|---|---|
| Build tooling | **electron-vite** (Vite 7) | Vite dev experience you know, plus main/preload bundling and HMR |
| UI framework | React 19 + TypeScript | |
| Routing | React Router (hash router) | Parent layout + child `<Outlet/>`; hash routing works from `file://` |
| UI controls + row/col layout | **MUI** (`Grid`, `Stack`, `Box`) | One library for both, instead of Bootstrap + Material fighting over CSS |
| Page skeleton | Plain **CSS Grid** in `MainLayout` | Full-height header/nav/sidebars/footer with no CSS hacks |
| Time-series plots | **uPlot** | Canvas-based, ~40 KB, 100k+ points at 60 fps (Plotly struggles at high update rates) |
| Gauges | Custom SVG `Gauge` component | Lightweight, updated imperatively per frame |
| Comms | `serialport`, `mqtt` (main process) | |
| Packaging | electron-builder | NSIS (Windows), AppImage + deb (Linux), GitHub Releases |

## Architecture

```
src/
  shared/types.ts        IPC channel names + shared types (main, preload, renderer)
  main/                  Node/Electron side - all device and file I/O lives here
    index.ts             window creation, security settings
    comms/hub.ts         owns the active transport, batches samples -> renderer every 16 ms
    comms/serial.ts      serial transport (newline-delimited)
    comms/mqtt.ts        MQTT transport
    comms/simulator.ts   1 kHz simulated motor (responds to DUTY/STOP/AUTO)
    comms/parser.ts      line decoder (JSON or CSV) - adapt to your firmware
    fsAccess.ts          file access restricted to user-granted directories
    settings.ts          persisted settings (userData/settings.json)
  preload/index.ts       the typed `window.api` bridge (the renderer's only access to main)
  renderer/src/
    layouts/             MainLayout (shell) + side panels + footer
    pages/               Dashboard, Config (nested routes), Files
    components/          Gauge, StripChart, Panel
    telemetry/store.ts   high-rate sample buffer outside React + per-frame draw loop
    state/               zustand stores (comms status, display prefs)
```

### Low-latency data path

```
device --serial/MQTT--> main: parse lines --batch every 16 ms--> IPC --> renderer ring buffer
                                                                            |
                                         requestAnimationFrame (only if new data)
                                                                            v
                                   uPlot.setData() / SVG needle attributes (no React re-render)
```

High-rate data never goes through React state, so the component tree doesn't re-render
at the data rate. Components subscribe with `useTelemetryFrame(draw)` and draw imperatively.
Tested at 1 kHz from the simulator.

### Wire protocol (placeholder - adapt `comms/parser.ts`)

Telemetry, one sample per line:
- JSON: `{"rpm":1500,"duty":42.5,"current":1.23,"t":123456}` (`t` optional, ms)
- CSV: `1500,42.5,1.23[,t_ms]`

Commands (sent as text lines / MQTT payloads): `DUTY <0-100>`, `STOP`, `AUTO`.

### Layout tips

- **Page skeleton**: CSS Grid with `gridTemplateRows: 'auto auto minmax(0,1fr) auto'` and `height: 100vh`.
  The `minmax(0, 1fr)` row fills the leftover space and scrolls internally.
- **Content rows/columns**: MUI `<Grid container>` + `<Grid size={{ xs: 12, md: 4 }}>` (Bootstrap-like 12 columns).
- **"Fill remaining height"**: parent `display: flex; flexDirection: column; height: 100%`, child
  `flex: 1; minHeight: 0`. The `minHeight: 0` is what usually goes wrong in Bootstrap layouts.
- Charts and gauges fill their parent, so just give the parent a size.

### File access

The renderer can't touch the filesystem directly. Directories are granted through a native
picker (Files page), stored in settings, and every read/write is resolved (including symlinks)
and rejected if it's outside a granted directory.

## Releasing

1. Bump `version` in `package.json`, commit.
2. `git tag v0.2.0 && git push --tags`
3. GitHub Actions builds the Windows and Linux installers and attaches them to a **draft** release.
4. Review the draft on GitHub and publish it.
