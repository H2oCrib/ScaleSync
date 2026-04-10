import type { WorkflowMode } from '../lib/types';

interface ModeSelectProps {
  onSelectMode: (mode: WorkflowMode) => void;
  onDisconnect: () => void;
  demoMode: boolean;
}

export function ModeSelect({ onSelectMode, onDisconnect, demoMode }: ModeSelectProps) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] px-4">
      <p className="text-xs font-medium uppercase tracking-widest text-gray-500 mb-1">Select Workflow</p>
      <h2 className="text-2xl font-semibold text-gray-50 mb-8">What are you weighing?</h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full max-w-2xl">
        {/* Dry Weight */}
        <button
          onClick={() => onSelectMode('dry')}
          className="group bg-base-900 border border-base-700 hover:border-cyan-500/40 rounded-lg p-6 text-left transition-all duration-200 hover:bg-base-800"
        >
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center">
              <svg className="w-5 h-5 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-gray-100 group-hover:text-cyan-400 transition-colors">
              Dry Weight
            </h3>
          </div>
          <p className="text-sm text-gray-500 leading-relaxed">
            Verify packaged product weights. Flower units, trim bags, popcorn bags with optional claimed weight verification.
          </p>
          <div className="mt-4 flex items-center gap-1.5 text-xs text-gray-600 group-hover:text-cyan-500/60 transition-colors">
            <span>Packages &middot; Units &middot; Bags</span>
          </div>
        </button>

        {/* Wet Weight */}
        <button
          onClick={() => onSelectMode('wet')}
          className="group bg-base-900 border border-base-700 hover:border-green-500/40 rounded-lg p-6 text-left transition-all duration-200 hover:bg-base-800"
        >
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-lg bg-green-500/10 border border-green-500/20 flex items-center justify-center">
              <svg className="w-5 h-5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 013.75 9.375v-4.5zM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 01-1.125-1.125v-4.5zM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0113.5 9.375v-4.5z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 6.75h.75v.75h-.75v-.75zM6.75 16.5h.75v.75h-.75v-.75zM16.5 6.75h.75v.75h-.75v-.75zM13.5 13.5h.75v.75h-.75v-.75zM13.5 19.5h.75v.75h-.75v-.75zM19.5 13.5h.75v.75h-.75v-.75zM19.5 19.5h.75v.75h-.75v-.75zM16.5 16.5h.75v.75h-.75v-.75z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-gray-100 group-hover:text-green-400 transition-colors">
              Wet Weight
            </h3>
          </div>
          <p className="text-sm text-gray-500 leading-relaxed">
            Harvest plants with METRC tag scanning. Scan barcode, capture wet weight, assign to strain.
          </p>
          <div className="mt-4 flex items-center gap-1.5 text-xs text-gray-600 group-hover:text-green-500/60 transition-colors">
            <span>Harvest &middot; RFID Tags &middot; Plants</span>
          </div>
        </button>
      </div>

      <button
        onClick={onDisconnect}
        className="mt-8 px-4 py-2 text-xs text-gray-600 hover:text-gray-400 transition-colors"
      >
        Disconnect
      </button>

      {demoMode && (
        <p className="mt-2 text-xs text-amber-500/60 font-mono">Demo Mode Active</p>
      )}
    </div>
  );
}
