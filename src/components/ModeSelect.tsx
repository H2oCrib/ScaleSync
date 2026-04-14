import type { WorkflowMode } from '../lib/types';

interface ModeSelectProps {
  onSelectMode: (mode: WorkflowMode) => void;
  onDisconnect: () => void;
  demoMode: boolean;
}

export function ModeSelect({ onSelectMode, onDisconnect, demoMode }: ModeSelectProps) {
  return (
    <div className="min-h-[75vh] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Top line */}
        <div className="flex items-center gap-2 mb-10">
          <div className="h-px flex-1 bg-base-700" />
          <span className="text-[10px] text-gray-600 font-mono uppercase tracking-[0.4em]">Select Workflow</span>
          <div className="h-px flex-1 bg-base-700" />
        </div>

        <div className="space-y-3">
          {/* Dry Weight */}
          <button
            onClick={() => onSelectMode('dry')}
            className="group w-full flex items-center gap-4 px-6 py-5 border border-base-700 hover:border-cyan-500/40 rounded-xl hover:bg-cyan-500/5 transition-all duration-200"
          >
            <div className="w-12 h-12 rounded-xl bg-cyan-500/8 border border-cyan-500/20 flex items-center justify-center shrink-0 group-hover:bg-cyan-500/15 transition-colors">
              <svg className="w-6 h-6 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
              </svg>
            </div>
            <div className="text-left flex-1">
              <p className="text-lg font-semibold text-gray-100 group-hover:text-cyan-400 transition-colors">Dry Weight</p>
              <p className="text-xs text-gray-500 mt-0.5">Verify packaged product weights</p>
            </div>
            <svg className="w-4 h-4 text-gray-700 group-hover:text-cyan-400 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>

          {/* Wet Weight */}
          <button
            onClick={() => onSelectMode('wet')}
            className="group w-full flex items-center gap-4 px-6 py-5 border border-base-700 hover:border-green-500/40 rounded-xl hover:bg-green-500/5 transition-all duration-200"
          >
            <div className="w-12 h-12 rounded-xl bg-green-500/8 border border-green-500/20 flex items-center justify-center shrink-0 group-hover:bg-green-500/15 transition-colors">
              <svg className="w-6 h-6 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 22V8" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8C12 8 12 4 16 2C20 4 18 8 14 9" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 13C12 13 12 9 8 7C4 9 6 13 10 14" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 18C12 18 12 14 16 12C20 14 18 18 14 19" />
              </svg>
            </div>
            <div className="text-left flex-1">
              <p className="text-lg font-semibold text-gray-100 group-hover:text-green-400 transition-colors">Wet Weight</p>
              <p className="text-xs text-gray-500 mt-0.5">Harvest plants with METRC scanning</p>
            </div>
            <svg className="w-4 h-4 text-gray-700 group-hover:text-green-400 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>

        <div className="text-center mt-8">
          <button
            onClick={onDisconnect}
            className="text-xs text-gray-600 hover:text-gray-400 transition-colors"
          >
            Disconnect
          </button>
          {demoMode && (
            <p className="mt-2 text-[10px] text-amber-500/60 font-mono tracking-wider">DEMO</p>
          )}
        </div>

        {/* Bottom line */}
        <div className="flex items-center gap-2 mt-10">
          <div className="h-px flex-1 bg-base-700" />
          <span className="text-[10px] text-gray-700 font-mono uppercase tracking-[0.3em]">Valor 7000</span>
          <div className="h-px flex-1 bg-base-700" />
        </div>
      </div>
    </div>
  );
}
