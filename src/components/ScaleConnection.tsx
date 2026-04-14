interface ScaleConnectionProps {
  connected: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
  onDemoMode: () => void;
  error: string | null;
}

export function ScaleConnection({ connected, onConnect, onDisconnect, onDemoMode, error }: ScaleConnectionProps) {
  return (
    <div className="min-h-[85vh] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Minimal top line */}
        <div className="flex items-center gap-2 mb-12">
          <div className="h-px flex-1 bg-base-700" />
          <span className="text-[10px] text-gray-600 font-mono uppercase tracking-[0.4em]">OHAUS Valor 7000</span>
          <div className="h-px flex-1 bg-base-700" />
        </div>

        {!connected ? (
          <div className="space-y-4">
            {/* Connect — outlined with icon */}
            <button
              onClick={onConnect}
              className="group w-full flex items-center gap-4 px-6 py-5 rounded-xl border border-green-500/30 hover:border-green-400/50 bg-green-500/8 hover:bg-green-500/15 transition-all duration-200"
            >
              <div className="w-11 h-11 rounded-full bg-green-500/10 border border-green-500/20 flex items-center justify-center shrink-0">
                <svg className="w-5 h-5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5.636 5.636a9 9 0 1012.728 0M12 3v9" />
                </svg>
              </div>
              <div className="text-left">
                <p className="text-base font-semibold text-gray-100 group-hover:text-green-400 transition-colors">Connect Scale</p>
                <p className="text-[10px] text-gray-600 font-mono mt-0.5">USB &middot; RS-232 &middot; 9600 BAUD</p>
              </div>
              <svg className="w-5 h-5 text-gray-600 group-hover:text-green-400 ml-auto transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>

            {/* Demo — minimal row */}
            <button
              onClick={onDemoMode}
              className="group w-full flex items-center gap-4 px-6 py-5 border border-base-700 hover:border-amber-500/30 rounded-xl hover:bg-amber-500/5 transition-all duration-200"
            >
              <div className="w-10 h-10 rounded-full border border-base-600 flex items-center justify-center shrink-0 group-hover:border-amber-500/30 transition-colors">
                <svg className="w-5 h-5 text-gray-500 group-hover:text-amber-400 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 7.5V18M15 7.5V18M3 16.811V8.69c0-.864.933-1.406 1.683-.977l7.108 4.061a1.125 1.125 0 010 1.954l-7.108 4.061A1.125 1.125 0 013 16.811z" />
                </svg>
              </div>
              <div className="text-left">
                <p className="text-base font-semibold text-gray-300 group-hover:text-amber-400 transition-colors">Demo Mode</p>
                <p className="text-[10px] text-gray-600 mt-0.5">Simulated scale for testing</p>
              </div>
              <svg className="w-4 h-4 text-gray-700 group-hover:text-amber-400 ml-auto transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>

            {!('serial' in navigator) && (
              <p className="text-red-400/80 text-xs text-center mt-2 bg-red-500/10 px-4 py-2.5 rounded-xl border border-red-500/15">
                Web Serial not supported — use Chrome or Edge
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="w-full flex items-center gap-4 px-6 py-5 border border-cyan-500/20 rounded-xl bg-cyan-500/5">
              <div className="w-10 h-10 rounded-full bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center shrink-0">
                <svg className="w-5 h-5 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div>
                <p className="text-base font-semibold text-cyan-400">Connected</p>
                <p className="text-[10px] text-gray-600 font-mono mt-0.5">Scale ready</p>
              </div>
            </div>
            <button
              onClick={onDisconnect}
              className="w-full py-3 text-xs text-gray-600 hover:text-gray-400 transition-colors text-center"
            >
              Disconnect
            </button>
          </div>
        )}

        {error && (
          <p className="text-red-400 text-sm text-center mt-4 bg-red-500/10 px-4 py-2.5 rounded-xl border border-red-500/15">{error}</p>
        )}

        {/* Bottom line */}
        <div className="flex items-center gap-2 mt-12">
          <div className="h-px flex-1 bg-base-700" />
          <span className="text-[10px] text-gray-700 font-mono uppercase tracking-[0.3em]">Weight Verification</span>
          <div className="h-px flex-1 bg-base-700" />
        </div>
      </div>
    </div>
  );
}
