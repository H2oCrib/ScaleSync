import { useState, useEffect } from 'react';

interface ScannerGuideProps {
  onContinue: () => void;
  onBack: () => void;
}

export function ScannerGuide({ onContinue, onBack }: ScannerGuideProps) {
  const [networkIP, setNetworkIP] = useState<string | null>(null);
  const [testInput, setTestInput] = useState('');
  const [scannerVerified, setScannerVerified] = useState(false);

  // Detect server URL from current page
  useEffect(() => {
    const host = window.location.hostname;
    const port = window.location.port;
    if (host && host !== 'localhost' && host !== '127.0.0.1') {
      setNetworkIP(`${host}:${port}`);
    } else {
      setNetworkIP(null);
    }
  }, []);

  const handleTestSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (testInput.trim()) {
      setScannerVerified(true);
    }
  };

  const appURL = networkIP
    ? `http://${networkIP}`
    : `http://[YOUR-MAC-IP]:${window.location.port || '5173'}`;

  return (
    <div className="max-w-2xl mx-auto py-4 sm:py-8 px-3 sm:px-4">
      <div className="flex items-center gap-3 mb-4 sm:mb-6">
        <button
          onClick={onBack}
          className="px-3 py-1.5 bg-base-800 hover:bg-base-700 border border-base-600 rounded text-xs text-gray-400 transition-colors"
        >
          &larr; Back
        </button>
        <div>
          <p className="text-[10px] sm:text-xs font-medium uppercase tracking-widest text-gray-500 mb-0.5">Setup</p>
          <h2 className="text-xl sm:text-2xl font-semibold text-gray-50">Scanner Connection Guide</h2>
        </div>
      </div>

      {/* Step 1: Scale Connection */}
      <div className="bg-base-900 border border-base-700 rounded-lg p-3 sm:p-5 mb-3">
        <div className="flex items-start gap-3">
          <div className="w-7 h-7 rounded-full bg-cyan-500/15 border border-cyan-500/25 flex items-center justify-center shrink-0 mt-0.5">
            <span className="text-xs font-bold text-cyan-400">1</span>
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-gray-100 mb-1">Connect Scale to Mac</h3>
            <p className="text-xs sm:text-sm text-gray-500 leading-relaxed">
              Plug the OHAUS Valor 7000 into your Mac via the USB-to-RS-232 adapter (Sabrent/Prolific).
              The scale should already be connected if you're past the connect screen.
            </p>
          </div>
        </div>
      </div>

      {/* Step 2: Same Network */}
      <div className="bg-base-900 border border-base-700 rounded-lg p-3 sm:p-5 mb-3">
        <div className="flex items-start gap-3">
          <div className="w-7 h-7 rounded-full bg-cyan-500/15 border border-cyan-500/25 flex items-center justify-center shrink-0 mt-0.5">
            <span className="text-xs font-bold text-cyan-400">2</span>
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-gray-100 mb-1">Same WiFi Network</h3>
            <p className="text-xs sm:text-sm text-gray-500 leading-relaxed">
              Make sure your Mac and C72 scanner are connected to the <span className="text-gray-300">same WiFi network</span>.
            </p>
          </div>
        </div>
      </div>

      {/* Step 3: Open on C72 */}
      <div className="bg-base-900 border border-base-700 rounded-lg p-3 sm:p-5 mb-3">
        <div className="flex items-start gap-3">
          <div className="w-7 h-7 rounded-full bg-green-500/15 border border-green-500/25 flex items-center justify-center shrink-0 mt-0.5">
            <span className="text-xs font-bold text-green-400">3</span>
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-gray-100 mb-1">Open App on C72</h3>
            <p className="text-xs sm:text-sm text-gray-500 leading-relaxed mb-2">
              Open <span className="text-gray-300">Chrome</span> on the C72 and navigate to:
            </p>
            <div className="bg-base-800 border border-base-600 rounded-lg px-3 py-2.5 font-mono text-sm text-green-400 select-all break-all">
              {appURL}
            </div>
            {!networkIP && (
              <p className="text-[10px] sm:text-xs text-amber-500/80 mt-2">
                To find your Mac's IP: open Terminal and run <span className="font-mono bg-base-800 px-1 py-0.5 rounded text-amber-400">ipconfig getifaddr en0</span>
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Step 4: KeyboardEmulator */}
      <div className="bg-base-900 border border-base-700 rounded-lg p-3 sm:p-5 mb-3">
        <div className="flex items-start gap-3">
          <div className="w-7 h-7 rounded-full bg-green-500/15 border border-green-500/25 flex items-center justify-center shrink-0 mt-0.5">
            <span className="text-xs font-bold text-green-400">4</span>
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-gray-100 mb-1">Configure KeyboardEmulator</h3>
            <p className="text-xs sm:text-sm text-gray-500 leading-relaxed mb-2">
              On the C72, open the <span className="text-gray-300">KeyboardEmulator</span> app (pre-installed):
            </p>
            <ul className="text-xs sm:text-sm text-gray-500 space-y-1.5 ml-1">
              <li className="flex items-start gap-2">
                <span className="text-green-500 shrink-0 mt-0.5">&#8226;</span>
                <span>Set KeyCode to <span className="font-mono text-gray-300 bg-base-800 px-1 py-0.5 rounded">139</span> (trigger button)</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-500 shrink-0 mt-0.5">&#8226;</span>
                <span>Enable <span className="text-gray-300">UHF RFID</span> scanning</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-500 shrink-0 mt-0.5">&#8226;</span>
                <span>Set output mode to <span className="text-gray-300">Keyboard Output</span></span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-500 shrink-0 mt-0.5">&#8226;</span>
                <span>Enable <span className="text-gray-300">Add Enter suffix</span> (auto-submits after scan)</span>
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* Step 5: Test */}
      <div className="bg-base-900 border border-base-700 rounded-lg p-3 sm:p-5 mb-3">
        <div className="flex items-start gap-3">
          <div className="w-7 h-7 rounded-full bg-green-500/15 border border-green-500/25 flex items-center justify-center shrink-0 mt-0.5">
            <span className="text-xs font-bold text-green-400">5</span>
          </div>
          <div className="min-w-0 w-full">
            <h3 className="text-sm font-semibold text-gray-100 mb-1">Test Scanner</h3>
            <p className="text-xs sm:text-sm text-gray-500 leading-relaxed mb-2">
              Tap the field below and pull the C72 trigger to scan a tag. If the tag ID appears, you're ready.
            </p>
            <form onSubmit={handleTestSubmit} className="flex gap-2">
              <input
                type="text"
                value={testInput}
                onChange={e => setTestInput(e.target.value)}
                placeholder="Pull trigger to test scan..."
                className="flex-1 px-3 py-2.5 bg-base-800 border border-base-600 rounded-lg text-gray-100 placeholder-gray-600 focus:outline-none focus:border-green-500/50 font-mono text-sm"
              />
              {scannerVerified ? (
                <div className="px-4 py-2.5 bg-green-500/15 border border-green-500/25 rounded-lg flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-green-500" />
                  <span className="text-xs text-green-400 font-medium">OK</span>
                </div>
              ) : (
                <button
                  type="submit"
                  disabled={!testInput.trim()}
                  className="px-4 py-2.5 bg-green-600 hover:bg-green-500 disabled:bg-base-800 disabled:text-gray-600 text-white font-medium rounded-lg transition-colors border border-green-500/30 disabled:border-base-700 text-xs"
                >
                  Verify
                </button>
              )}
            </form>
            {scannerVerified && (
              <p className="text-xs text-green-400/80 mt-1.5">
                Scanner working — received: <span className="font-mono">{testInput}</span>
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Tip: No C72? */}
      <div className="bg-base-800/50 border border-base-700/50 rounded-lg p-3 sm:p-4 mb-4">
        <p className="text-xs text-gray-500">
          <span className="text-gray-400 font-medium">No C72?</span> Any USB barcode scanner plugged into your Mac works too — it types the tag ID as keyboard input. You can also type tag IDs manually.
        </p>
      </div>

      {/* Continue */}
      <button
        onClick={onContinue}
        className="w-full py-3 bg-green-600 hover:bg-green-500 text-white font-medium rounded-lg transition-colors border border-green-500/30 text-sm sm:text-base"
      >
        Continue to Setup
      </button>
    </div>
  );
}
