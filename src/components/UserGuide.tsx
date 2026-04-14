import { useState, useEffect } from 'react';

interface UserGuideProps {
  open: boolean;
  onClose: () => void;
}

type Section = 'overview' | 'connect' | 'dry' | 'wet' | 'scanner' | 'shortcuts' | 'troubleshoot';

export function UserGuide({ open, onClose }: UserGuideProps) {
  const [section, setSection] = useState<Section>('overview');

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  const nav: { id: Section; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'connect', label: 'Connect Scale' },
    { id: 'dry', label: 'Dry Weight' },
    { id: 'wet', label: 'Wet Weight' },
    { id: 'scanner', label: 'Scanner Setup' },
    { id: 'shortcuts', label: 'Shortcuts' },
    { id: 'troubleshoot', label: 'Troubleshoot' },
  ];

  return (
    <div
      className="fixed inset-0 z-50 bg-base-950/80 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="guide-title"
      onClick={onClose}
    >
      <div
        className="bg-base-900 border border-base-700 rounded-xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 border-b border-base-700">
          <h2 id="guide-title" className="text-base sm:text-lg font-semibold text-gray-100">User Guide</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-300 text-xl leading-none"
            aria-label="Close guide"
          >
            ×
          </button>
        </div>

        <div className="flex-1 flex flex-col sm:flex-row overflow-hidden">
          {/* Nav */}
          <nav className="sm:w-44 shrink-0 border-b sm:border-b-0 sm:border-r border-base-700 p-2 sm:p-3 overflow-x-auto sm:overflow-y-auto">
            <div className="flex sm:flex-col gap-1">
              {nav.map(n => (
                <button
                  key={n.id}
                  onClick={() => setSection(n.id)}
                  className={`text-left px-3 py-2 rounded-lg text-xs sm:text-sm whitespace-nowrap transition-colors ${
                    section === n.id
                      ? 'bg-green-500/15 text-green-400 border border-green-500/20'
                      : 'text-gray-400 hover:bg-base-800 border border-transparent'
                  }`}
                >
                  {n.label}
                </button>
              ))}
            </div>
          </nav>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 text-sm text-gray-400 leading-relaxed space-y-4">
            {section === 'overview' && (
              <>
                <h3 className="text-lg font-semibold text-gray-100">Welcome to ScaleSync</h3>
                <p>Weight verification system for cannabis facilities. Two workflows:</p>
                <ul className="space-y-2 ml-4 list-disc">
                  <li><span className="text-cyan-400 font-medium">Dry Weight</span> — Verify packaged product weights against claimed values. Supports flower, trim, popcorn.</li>
                  <li><span className="text-green-400 font-medium">Wet Weight</span> — Harvest flow. Scan METRC plant tags, capture wet weight per plant, group by strain.</li>
                </ul>
                <p>Both export to styled Excel. Sessions auto-save every state change — survive tab refresh or crash.</p>
                <div className="bg-base-800/50 border border-base-700 rounded-lg p-3 mt-4">
                  <p className="text-xs text-gray-500"><span className="text-gray-300 font-medium">Tip:</span> Demo Mode lets you test the full app without hardware. Simulated scale readings included.</p>
                </div>
              </>
            )}

            {section === 'connect' && (
              <>
                <h3 className="text-lg font-semibold text-gray-100">Connect the Scale</h3>
                <ol className="space-y-2 ml-4 list-decimal">
                  <li>Plug OHAUS Valor 7000 into computer via USB-to-RS-232 adapter (Prolific PL2303 chip recommended).</li>
                  <li>On macOS: install PL2303Serial driver + approve in System Settings → Login Items & Extensions.</li>
                  <li>Click <span className="text-green-400 font-medium">Connect Scale</span>. Browser serial picker opens.</li>
                  <li>Select the USB serial device from list.</li>
                  <li>App advances to mode select when scale responds.</li>
                </ol>
                <p className="mt-3">Scale config: 9600 baud, 8 data bits, no parity, 1 stop bit.</p>
                <p>If no scale available, click <span className="text-amber-400 font-medium">Demo Mode</span> to test with simulated readings.</p>
              </>
            )}

            {section === 'dry' && (
              <>
                <h3 className="text-lg font-semibold text-gray-100">Dry Weight Verification</h3>
                <p>Verify packaged product weights against expected values per unit.</p>
                <ol className="space-y-2 ml-4 list-decimal">
                  <li><span className="text-gray-200 font-medium">Add strains.</span> For each, enter name, product type (Flower/Trim/Popcorn), unit count, and claimed weight (lbs for flower, grams for trim/popcorn).</li>
                  <li><span className="text-gray-200 font-medium">Start weighing.</span> Place unit on scale → weight captured when stable (auto mode) or click Record Weight.</li>
                  <li><span className="text-gray-200 font-medium">Review data table.</span> Single-click any cell to edit. Red × to delete row.</li>
                  <li><span className="text-gray-200 font-medium">Finish & export.</span> Summary shows VERIFIED (within ±5g tolerance) or VARIANCE per strain. Export Excel.</li>
                </ol>
                <p className="mt-3">Partials: mark units as partial + enter partial size if unit is not full weight.</p>
              </>
            )}

            {section === 'wet' && (
              <>
                <h3 className="text-lg font-semibold text-gray-100">Wet Weight Harvest</h3>
                <p>Scan METRC tags, capture wet weight per plant, group by strain.</p>
                <ol className="space-y-2 ml-4 list-decimal">
                  <li><span className="text-gray-200 font-medium">Setup batch.</span> Enter batch name, add strains with expected plant count each.</li>
                  <li><span className="text-gray-200 font-medium">Scan tag.</span> Pull scanner trigger or type tag ID. Duplicates rejected.</li>
                  <li><span className="text-gray-200 font-medium">Place plant on scale.</span> Weight auto-captures when stable (3 readings within 0.5g) OR hit Space/Enter to record immediately.</li>
                  <li><span className="text-gray-200 font-medium">Strain assignment.</span> Auto-assigns to first strain with remaining plants. Tap pill to pick different strain.</li>
                  <li><span className="text-gray-200 font-medium">Edit entries.</span> Click any row in Entries table to edit tag, strain, or weight. Trash icon deletes.</li>
                  <li><span className="text-gray-200 font-medium">Finish & export.</span> Summary groups by strain. Export Excel with summary + detail sheets.</li>
                </ol>
                <div className="bg-base-800/50 border border-base-700 rounded-lg p-3 mt-3">
                  <p className="text-xs text-gray-500"><span className="text-gray-300 font-medium">Save progress:</span> Click SAVE in header to download a .json file. Reload later via "Resume Previous Session" on batch setup page.</p>
                </div>
              </>
            )}

            {section === 'scanner' && (
              <>
                <h3 className="text-lg font-semibold text-gray-100">Scanner Setup</h3>
                <p>Wet weight mode supports three scanner types:</p>
                <div className="space-y-3 mt-2">
                  <div>
                    <p className="text-gray-200 font-medium mb-1">USB Barcode Scanner</p>
                    <p className="text-xs">Plug in. No setup. App auto-detects typed tag IDs. Scanner indicator turns green in wet weighing header.</p>
                  </div>
                  <div>
                    <p className="text-gray-200 font-medium mb-1">Bluetooth Scanner (Tera 5100)</p>
                    <ol className="text-xs space-y-1 ml-4 list-decimal">
                      <li>Scan "BT HID" barcode in Tera manual to enable HID mode</li>
                      <li>Hold trigger 3s until blue LED flash</li>
                      <li>Pair in System Settings → Bluetooth</li>
                      <li>Scanner acts as keyboard — works automatically</li>
                    </ol>
                  </div>
                  <div>
                    <p className="text-gray-200 font-medium mb-1">Chainway C72 RFID (WiFi relay)</p>
                    <ol className="text-xs space-y-1 ml-4 list-decimal">
                      <li>Connect C72 to same WiFi as computer</li>
                      <li>Open Chrome on C72 → http://[computer-ip]:5173/#/scanner</li>
                      <li>Configure KeyboardEmulator: trigger 139, UHF RFID on, keyboard output, Enter suffix</li>
                      <li>Pull trigger — tags relay to main app via WebSocket</li>
                    </ol>
                  </div>
                </div>
                <p className="mt-3">Manual entry always works as fallback — just type tag ID and press Enter.</p>
              </>
            )}

            {section === 'shortcuts' && (
              <>
                <h3 className="text-lg font-semibold text-gray-100">Keyboard Shortcuts</h3>
                <p>Available during weighing (when not typing in input):</p>
                <div className="bg-base-800/50 border border-base-700 rounded-lg p-3 mt-2 space-y-2 font-mono text-xs">
                  <div className="flex justify-between"><span className="text-gray-300">Space / Enter</span><span className="text-gray-500">Record current weight</span></div>
                  <div className="flex justify-between"><span className="text-gray-300">Z</span><span className="text-gray-500">Undo last entry</span></div>
                  <div className="flex justify-between"><span className="text-gray-300">T</span><span className="text-gray-500">Tare scale</span></div>
                  <div className="flex justify-between"><span className="text-gray-300">Escape</span><span className="text-gray-500">Cancel pending tag / close dialog</span></div>
                </div>
                <p className="mt-3">In edit mode (clicking a table row): Enter saves, Escape cancels.</p>
              </>
            )}

            {section === 'troubleshoot' && (
              <>
                <h3 className="text-lg font-semibold text-gray-100">Troubleshooting</h3>
                <div className="space-y-3">
                  <div>
                    <p className="text-gray-200 font-medium">Scale shows 0.0 and won't update</p>
                    <p className="text-xs mt-1">Check cable is fully seated. Try a different USB port. Swap to a known-good USB-to-RS-232 adapter (defective cables are the most common cause).</p>
                  </div>
                  <div>
                    <p className="text-gray-200 font-medium">"Connection failed: failed to execute open on serial port"</p>
                    <p className="text-xs mt-1">App auto-retries. If persists: close any other app using the serial port (Arduino IDE, terminal, etc.) and try again.</p>
                  </div>
                  <div>
                    <p className="text-gray-200 font-medium">Stuck "Settling" — never captures</p>
                    <p className="text-xs mt-1">App bypasses scale's stable flag. Captures on 3 consecutive readings within 0.5g. If scale output is noisy, press Space/Enter to capture manually.</p>
                  </div>
                  <div>
                    <p className="text-gray-200 font-medium">Scanner not detected</p>
                    <p className="text-xs mt-1">Test scanner in Notes/TextEdit first — if typing appears, it's working. Ensure it sends Enter after each scan. USB detection needs &gt;4 chars in &lt;80ms between keystrokes.</p>
                  </div>
                  <div>
                    <p className="text-gray-200 font-medium">Lost session data</p>
                    <p className="text-xs mt-1">Sessions auto-save to localStorage. Check DevTools → Application → Local Storage for key <span className="font-mono">scalesync-session</span>. Also try SAVE button to download .json backup during any session.</p>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
