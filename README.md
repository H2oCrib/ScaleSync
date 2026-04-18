# ScaleSync

Weight verification + harvest logging for cannabis facilities. Connects directly to an OHAUS Valor 7000 over USB/RS-232 via the Web Serial API, syncs harvest data to Supabase, and runs fine entirely offline when the network drops.

Two workflows:
- **Dry Weight Verification** — weigh packaged product (flower / trim / popcorn) with optional claimed-weight variance tracking and Excel export.
- **Wet Weight Harvest** — scan METRC tags, capture wet weight per plant, roll up by strain, sync live across devices, replay for audit.

## Quick Start

```bash
git clone git@github.com:H2oCrib/ScaleSync.git
cd ScaleSync
npm install
npm run dev
```

Open **http://localhost:5173** in **Chrome** (Web Serial API is required for the scale connection).

Click **Demo Mode** on the connect screen if you don't have a scale handy.

## Desktop Launcher (macOS)

One-click launch from your Desktop without touching the terminal.

```bash
./scripts/build-app.sh           # drops ScaleSync.app on your Desktop
# (optional) regenerate the icon from the bundled SVG
./scripts/generate-icon.sh
./scripts/build-app.sh           # rebuild to embed the new icon
```

Double-clicking the icon:
1. Starts the Vite dev server in the background (logs to `~/Library/Logs/ScaleSync/dev-server.log`)
2. Waits up to 30s for `:5173` to respond
3. Opens Chrome in chromeless `--app=` mode full-screen — no URL bar, no tabs, just ScaleSync

Falls back to Edge → Brave → default browser if Chrome isn't installed.

## Cloud Sync (optional)

ScaleSync works fully locally (localStorage + JSON export) with zero config. To also sync to Supabase:

```bash
cp .env.example .env.local
# fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
```

Then apply the schema from your Supabase **SQL Editor**:

```sql
-- contents of supabase/migrations/0001_scalesync_init.sql
-- plus supabase/migrations/0002_allow_anon_delete_harvest.sql
```

What the cloud integration adds:

- **Per-harvest toggle** on Wet Setup: _Local Only_ vs _Sync to Cloud_ (choice persists per device)
- **Offline-safe outbox** — writes always hit localStorage first, then a background worker drains the queue with exponential backoff. Ops are idempotent (client-generated uuids + upsert) so replay is safe
- **Cross-device resume** — a harvest started on Station A shows up as a resume card on Station B; pick it up mid-flow and keep weighing
- **Live merge during active harvest** — Supabase Realtime `postgres_changes` pushes inserts from other devices straight into the UI, deduped by tag
- **Harvest History browser** — list past cloud harvests, drill into a read-only summary, re-export to Excel, or delete (cascade through strains + readings)

All sync is anon-key + RLS — no login flow required. Never commit `.env.local` or the service-role key.

## Requirements

- **Node.js** 18+
- **Chrome** or **Edge** browser (Web Serial API)
- For live scale: USB-to-RS-232 adapter (e.g. Sabrent with Prolific PL2303 chip)

### macOS USB Driver Setup

If using a Prolific PL2303 USB-to-serial adapter:

1. Install the **PL2303Serial** app from [prolific.com.tw](https://www.prolific.com.tw/US/ShowProduct.aspx?p_id=229&pcid=41)
2. Go to **System Settings → General → Login Items & Extensions → Driver Extensions** and approve the Prolific driver
3. Restart your Mac
4. The serial port appears as `/dev/tty.PL2303G-USBtoUART110`

## Workflows

### Dry Weight Verification

1. Connect scale (or Demo Mode) → select **Dry Weight**
2. Add strains — name, product type (Flower/Trim/Popcorn), unit count, optional claimed weight
3. Weigh each unit — manual capture or auto-capture on stabilization
4. Review summary with variance tracking
5. Export to Excel

### Wet Weight Harvest

1. Connect scale (or Demo Mode) → select **Wet Weight**
2. Enter batch name
3. Choose save destination (Local Only / Sync to Cloud)
4. Add strains — one at a time or bulk-paste a list like `CHERRIEZ 117` / `BLUE NERDZ, 144` / `TERDZ 117 plants`
5. Start weighing — scan METRC tag, full-screen green flash on successful capture (shows strain + plant N of total), red flash + "Duplicate" tag on re-scan
6. Live header shows pace (`/hr`), ETA, and "Saved Xs ago" auto-save indicator
7. Click any reading in the Entries table to edit the tag, strain, or weight inline
8. Finish Harvest prompts a confirmation with totals (amber warning if plants are still remaining)
9. Summary shows per-strain weights + totals in g / lbs
10. Export to Excel or view/re-export later from **Harvest History**

## Reliability Features

- **Auto-save** to localStorage on every reading (debounced 300ms) — tab crash / refresh restores via the Resume card
- **Wake Lock API** prevents the device from sleeping during 12-hour harvest shifts
- **beforeunload** warns if you try to close the tab mid-harvest
- **Save-to-file / Load-from-file** — JSON progress files downloadable for long-term backup or cross-machine transfer
- **Outbox queue** keeps cloud writes flowing the moment the network returns

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Enter` / `Space` | Record weight (when a tag is scanned) |
| `Z` | Undo last entry |
| `T` | Tare scale |
| `Esc` | Cancel current scanned tag |
| `?` | Open the embedded user guide |

## Scale Protocol

OHAUS Valor 7000 RS-232 settings:
- **9600** baud, **8** data bits, **no** parity, **1** stop bit
- Commands: `IP` (print), `CP` (continuous), `0P` (stop), `T` (tare), `Z` (zero)

## Project Layout

```
src/
  App.tsx                     root state machine + phase routing
  components/
    WetSetup.tsx              batch config + bulk paste + save-mode toggle
    WetWeighingStation.tsx    capture UI + flash overlay + pace/ETA
    WetSummary.tsx            final report
    HarvestHistory.tsx        cloud history + delete
    UserGuide.tsx             modal guide
    ...
  hooks/
    useScale.ts               Web Serial driver (OHAUS Valor protocol)
    useAutoCapture.ts         stability-based auto-capture
    useCloudHarvest.ts        realtime subscribe + merge
    ...
  lib/
    supabase.ts               client singleton, null when env missing
    cloud.ts                  list/load/push/delete Result<T> wrappers
    outbox.ts                 localStorage-backed queue + flush worker
    device-id.ts              persistent per-browser uuid
    session-persistence.ts    localStorage save/load/peek/export
    export.ts / wet-export.ts ExcelJS styled workbooks
supabase/
  migrations/
    0001_scalesync_init.sql   schema + RLS + realtime publication
    0002_allow_anon_delete_harvest.sql
scripts/
  launch.sh                   desktop-launcher shell (embedded in .app)
  build-app.sh                assembles ~/Desktop/ScaleSync.app
  generate-icon.sh            renders AppIcon.icns from SVG via Chrome headless
```

## Tech Stack

- **React 19** + **TypeScript** + **Vite 6**
- **Tailwind CSS v4** (Midnight-Ocean palette)
- **@supabase/supabase-js v2** — Postgres + Realtime
- **AG Grid Community** — editable weight grid (dry-weight workflow)
- **ExcelJS** — styled Excel export
- **Web Serial API** — browser ⇄ scale communication
- **Web Bluetooth (HID)** — optional Tera 5100 barcode scanner
- **Wake Lock API** — keep device awake during long harvests

## License

Internal / private — not yet published for external use.
