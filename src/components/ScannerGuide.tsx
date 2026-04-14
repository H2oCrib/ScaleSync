import { useState, useEffect, useRef } from 'react';
import { useScannerRelay } from '../hooks/useScannerRelay';

/**
 * Collapsible "How to Use" panel with scanner test.
 * Embedded in WetSetup — not a standalone page.
 */
export function ScannerHowTo() {
  const [expanded, setExpanded] = useState(false);
  const [testInput, setTestInput] = useState('');
  const [testResult, setTestResult] = useState<'idle' | 'pass' | 'fail'>('idle');
  const testRef = useRef<HTMLInputElement>(null);

  // Detect network IP from current page
  const [networkIP, setNetworkIP] = useState<string | null>(null);
  useEffect(() => {
    const host = window.location.hostname;
    const port = window.location.port;
    if (host && host !== 'localhost' && host !== '127.0.0.1') {
      setNetworkIP(`${host}:${port}`);
    }
  }, []);

  // Listen for relay connection to show live status
  const { connected: relayConnected } = useScannerRelay({
    enabled: expanded,
    onTagReceived: (tagId: string) => {
      setTestInput(tagId);
      setTestResult('pass');
    },
  });

  const appURL = networkIP
    ? `http://${networkIP}`
    : `http://[YOUR-MAC-IP]:${window.location.port || '5173'}`;

  const handleTestSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (testInput.trim().length >= 4) {
      setTestResult('pass');
    } else if (testInput.trim()) {
      setTestResult('fail');
    }
  };

  return (
    <div className="bg-base-900 border border-base-700 rounded-lg overflow-hidden">
      {/* Toggle header */}
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center justify-between px-3 sm:px-5 py-3 hover:bg-base-800/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-300">Scanner Setup & Test</span>
          {relayConnected && (
            <span className="flex items-center gap-1 text-[10px] text-green-400">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
              C72 Connected
            </span>
          )}
        </div>
        <span className="text-gray-600 text-xs">{expanded ? '▲' : '▼'}</span>
      </button>

      {expanded && (
        <div className="border-t border-base-700 px-3 sm:px-5 py-3 sm:py-4 space-y-3">

          {/* How it works */}
          <div>
            <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">How It Works</h4>
            <div className="text-xs sm:text-sm text-gray-500 space-y-1.5 leading-relaxed">
              <p><span className="text-gray-300 font-medium">Scan a METRC tag</span> &rarr; assign to strain &rarr; place plant on scale &rarr; weight captured.</p>
              <p>Supports <span className="text-gray-300">USB barcode scanners</span> (plug into Mac), <span className="text-gray-300">C72 RFID scanner</span> (via WiFi relay), or <span className="text-gray-300">manual entry</span>.</p>
            </div>
          </div>

          {/* C72 setup */}
          <div>
            <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">C72 RFID Setup</h4>
            <ol className="text-xs sm:text-sm text-gray-500 space-y-1 list-decimal list-inside">
              <li>Connect C72 to <span className="text-gray-300">same WiFi</span> as this Mac</li>
              <li>Open Chrome on C72, go to:
                <span className="block mt-1 mb-1 bg-base-800 border border-base-600 rounded px-2.5 py-1.5 font-mono text-xs text-green-400 select-all break-all">
                  {appURL}/#/scanner
                </span>
              </li>
              <li>Open <span className="text-gray-300">KeyboardEmulator</span> &mdash; set trigger key <span className="font-mono text-gray-300">139</span>, enable UHF RFID, keyboard output, add Enter suffix</li>
              <li>Switch back to Chrome on C72 &mdash; pull trigger to scan</li>
            </ol>
            {!networkIP && (
              <p className="text-[10px] text-amber-500/80 mt-1.5">
                Find Mac IP: <span className="font-mono bg-base-800 px-1 py-0.5 rounded text-amber-400">ipconfig getifaddr en0</span>
              </p>
            )}
          </div>

          {/* Scanner test */}
          <div>
            <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">Test Scanner</h4>
            <form onSubmit={handleTestSubmit} className="flex gap-2">
              <input
                ref={testRef}
                type="text"
                value={testInput}
                onChange={e => { setTestInput(e.target.value); setTestResult('idle'); }}
                placeholder="Scan a tag or type to test..."
                className="flex-1 px-3 py-2 bg-base-800 border border-base-600 rounded-lg text-gray-100 placeholder-gray-600 focus:outline-none focus:border-green-500/50 font-mono text-xs sm:text-sm"
              />
              {testResult === 'pass' ? (
                <div className="px-3 py-2 bg-green-500/15 border border-green-500/25 rounded-lg flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-green-500" />
                  <span className="text-xs text-green-400 font-medium">Working</span>
                </div>
              ) : (
                <button
                  type="submit"
                  disabled={!testInput.trim()}
                  className="px-3 py-2 bg-green-600 hover:bg-green-500 disabled:bg-base-800 disabled:text-gray-600 text-white font-medium rounded-lg transition-colors border border-green-500/30 disabled:border-base-700 text-xs"
                >
                  Test
                </button>
              )}
            </form>
            {testResult === 'pass' && (
              <p className="text-[10px] text-green-400/80 mt-1">
                Received: <span className="font-mono">{testInput}</span>
              </p>
            )}
            {relayConnected && testResult === 'idle' && (
              <p className="text-[10px] text-gray-600 mt-1">
                C72 relay connected — pull trigger to test
              </p>
            )}
          </div>

          {/* Tip */}
          <p className="text-[10px] text-gray-600">
            <span className="text-gray-500">Tip:</span> USB barcode scanners auto-detect when plugged in. No setup needed — just scan.
          </p>
        </div>
      )}
    </div>
  );
}
