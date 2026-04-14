# ScaleSync

A web app for cannabis facilities to verify weights using an OHAUS Valor 7000 scale connected via USB/RS-232. Supports two workflows:

- **Dry Weight Verification** — Weigh packaged product (flower units, trim bags, popcorn bags) with optional claimed weight variance tracking
- **Wet Weight Harvest** — Scan METRC plant tags with a USB barcode scanner and capture wet weights per plant during harvest

## Quick Start

```bash
git clone https://github.com/H2oCrib/OHAUS.git
cd OHAUS
npm install
npm run dev
```

Open **http://localhost:5173** in **Chrome** (required for USB scale connection).

Click **Demo Mode** to test without a physical scale.

## Requirements

- **Node.js** 18+
- **Chrome** or **Edge** browser (Web Serial API)
- For live scale: USB-to-RS-232 adapter (e.g. Sabrent with Prolific PL2303 chip)

### macOS USB Driver Setup

If using a Prolific PL2303 USB-to-serial adapter:

1. Install the **PL2303Serial** app from [prolific.com.tw](https://www.prolific.com.tw/US/ShowProduct.aspx?p_id=229&pcid=41)
2. Go to **System Settings → General → Login Items & Extensions → Driver Extensions** and approve the Prolific driver
3. Restart your Mac
4. The serial port should appear as `/dev/tty.PL2303G-USBtoUART110`

## Workflows

### Dry Weight Verification

1. Connect scale or enter Demo Mode
2. Select **Dry Weight**
3. Add strains — name, product type (Flower/Trim/Popcorn), unit count, optional claimed weight
4. Weigh each unit — manual button or auto-capture when scale stabilizes
5. Review summary with variance tracking (if claimed weight was entered)
6. Export to Excel

### Wet Weight Harvest

1. Connect scale or enter Demo Mode
2. Select **Wet Weight**
3. Enter batch name and add strains with plant counts
4. Scan METRC plant tags with a USB barcode scanner (or type manually)
5. Weight auto-captures or use manual button
6. Review per-strain summary with plant counts and totals
7. Export to Excel

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Enter` / `Space` | Record weight (manual mode) |
| `Z` | Undo last entry |
| `T` | Tare scale |
| `Esc` | Cancel scanned tag (wet weight) |

## Scale Protocol

OHAUS Valor 7000 RS-232 settings:
- **9600** baud, **8** data bits, **no** parity, **1** stop bit
- Commands: `IP` (print), `CP` (continuous), `0P` (stop), `T` (tare), `Z` (zero)

## Tech Stack

- React 18 + TypeScript + Vite
- Tailwind CSS v4
- AG Grid Community (editable weight grid)
- ExcelJS (styled Excel export)
- Web Serial API (browser-to-scale communication)
