import { useState, useRef } from 'react';
import type { HarvestBatchConfig, HarvestStrainConfig, HarvestSession } from '../lib/types';
import { ScannerHowTo } from './ScannerGuide';
import { parseSessionFile } from '../lib/session-persistence';
import { cloudEnabled } from '../lib/supabase';

export type SaveMode = 'local' | 'cloud';

const SAVE_MODE_KEY = 'scalesync-save-mode';

function readStoredSaveMode(): SaveMode {
  try {
    const raw = localStorage.getItem(SAVE_MODE_KEY);
    if (raw === 'cloud' || raw === 'local') return raw;
  } catch {
    // fall through
  }
  return 'local';
}

interface WetSetupProps {
  onStartWeighing: (config: HarvestBatchConfig, saveMode: SaveMode) => void;
  onLoadSession: (session: HarvestSession) => void;
  onBack: () => void;
}

export function WetSetup({ onStartWeighing, onLoadSession, onBack }: WetSetupProps) {
  const [saveMode, setSaveMode] = useState<SaveMode>(() => {
    const stored = readStoredSaveMode();
    return cloudEnabled ? stored : 'local';
  });

  const chooseMode = (mode: SaveMode) => {
    if (mode === 'cloud' && !cloudEnabled) return;
    setSaveMode(mode);
    try { localStorage.setItem(SAVE_MODE_KEY, mode); } catch { /* ignore */ }
  };
  const today = new Date().toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' });
  const [batchName, setBatchName] = useState(`Harvest ${today}`);
  const [strains, setStrains] = useState<HarvestStrainConfig[]>([]);
  const [strainName, setStrainName] = useState('');
  const [plantCount, setPlantCount] = useState('');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const [bulkError, setBulkError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleLoadFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoadError(null);
    const reader = new FileReader();
    reader.onload = () => {
      const parsed = parseSessionFile(reader.result as string);
      if (parsed) {
        onLoadSession(parsed.harvestSession);
      } else {
        setLoadError('Invalid session file');
        setTimeout(() => setLoadError(null), 3000);
      }
    };
    reader.readAsText(file);
    // Reset input so same file can be re-selected
    e.target.value = '';
  };

  const totalPlants = strains.reduce((sum, s) => sum + s.plantCount, 0);

  const handleAddStrain = (e: React.FormEvent) => {
    e.preventDefault();
    if (!strainName.trim() || !plantCount) return;

    setStrains(prev => [...prev, {
      id: crypto.randomUUID(),
      strain: strainName.trim(),
      plantCount: parseInt(plantCount),
    }]);
    setStrainName('');
    setPlantCount('');
  };

  const handleRemoveStrain = (id: string) => {
    setStrains(prev => prev.filter(s => s.id !== id));
  };

  const handleBulkAdd = () => {
    setBulkError(null);
    const lines = bulkText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (lines.length === 0) { setBulkError('Paste one strain per line'); return; }
    const parsed: HarvestStrainConfig[] = [];
    const errors: string[] = [];
    for (const [i, line] of lines.entries()) {
      // Accept: "NAME 117", "NAME,117", "NAME\t117", "117 NAME", "NAME 117 plants"
      // Strategy: find first integer in the line, everything else is the name
      const numMatch = line.match(/\b(\d+)\b/);
      if (!numMatch) { errors.push(`Line ${i + 1}: no count`); continue; }
      const count = parseInt(numMatch[1], 10);
      if (count <= 0) { errors.push(`Line ${i + 1}: count must be > 0`); continue; }
      const name = line
        .replace(numMatch[0], '')
        .replace(/[,\t]+/g, ' ')
        .replace(/\bplants?\b/gi, '')
        .replace(/\s+/g, ' ')
        .trim();
      if (!name) { errors.push(`Line ${i + 1}: no strain name`); continue; }
      parsed.push({ id: crypto.randomUUID(), strain: name, plantCount: count });
    }
    if (errors.length) { setBulkError(errors.slice(0, 3).join(' · ')); return; }
    setStrains(prev => [...prev, ...parsed]);
    setBulkText('');
    setBulkOpen(false);
  };

  const handleStart = () => {
    if (strains.length === 0 || !batchName.trim()) return;
    onStartWeighing({
      id: crypto.randomUUID(),
      batchName: batchName.trim(),
      strains,
      date: new Date(),
    }, saveMode);
  };

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
          <p className="text-[10px] sm:text-xs font-medium uppercase tracking-widest text-gray-500 mb-0.5">Configure</p>
          <h2 className="text-xl sm:text-2xl font-semibold text-gray-50">Wet Weight Harvest</h2>
        </div>
      </div>

      {/* Batch Name */}
      <div className="bg-base-900 border border-base-700 rounded-lg p-3 sm:p-5 mb-3 sm:mb-4">
        <label className="block text-[10px] sm:text-xs font-medium uppercase tracking-widest text-gray-500 mb-1.5">Batch Name</label>
        <input
          type="text"
          value={batchName}
          onChange={e => setBatchName(e.target.value)}
          placeholder="e.g. Harvest 4/9/2026"
          className="w-full px-3 py-2.5 bg-base-800 border border-base-600 rounded-lg text-gray-100 placeholder-gray-600 focus:outline-none focus:border-green-500/50 font-medium text-sm sm:text-base"
          required
        />
      </div>

      {/* Save destination */}
      <div className="bg-base-900 border border-base-700 rounded-lg p-3 sm:p-5 mb-3 sm:mb-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] sm:text-xs font-medium uppercase tracking-widest text-gray-500 mb-0.5">Save To</p>
            <p className="text-[10px] text-gray-600">
              {saveMode === 'cloud'
                ? 'Local + Supabase. Works offline, syncs when online.'
                : 'This browser only. Export or save file to back up.'}
              {!cloudEnabled && (
                <span className="ml-2 text-amber-500/80">Cloud disabled — no credentials configured.</span>
              )}
            </p>
          </div>
          <div role="tablist" aria-label="Save destination" className="inline-flex rounded-lg border border-base-600 bg-base-800 p-0.5 shrink-0">
            <button
              type="button"
              role="tab"
              aria-selected={saveMode === 'local'}
              onClick={() => chooseMode('local')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                saveMode === 'local'
                  ? 'bg-green-600 text-white'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              Local Only
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={saveMode === 'cloud'}
              onClick={() => chooseMode('cloud')}
              disabled={!cloudEnabled}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                saveMode === 'cloud'
                  ? 'bg-green-600 text-white'
                  : cloudEnabled
                    ? 'text-gray-400 hover:text-gray-200'
                    : 'text-gray-700 cursor-not-allowed'
              }`}
            >
              Sync to Cloud
            </button>
          </div>
        </div>
      </div>

      {/* Load Saved Session */}
      <div className="bg-base-900 border border-base-700 rounded-lg p-3 sm:p-5 mb-3 sm:mb-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-gray-400">Resume Previous Session</p>
            <p className="text-[10px] text-gray-600 mt-0.5">Load a saved .json progress file</p>
          </div>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="px-3 sm:px-4 py-2 bg-base-800 hover:bg-base-700 border border-base-600 rounded-lg text-xs text-gray-300 font-medium transition-colors"
          >
            Load File
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={handleLoadFile}
            className="hidden"
          />
        </div>
        {loadError && (
          <p className="text-xs text-red-400 mt-2">{loadError}</p>
        )}
      </div>

      {/* Scanner Setup & Test — collapsible */}
      <div className="mb-3 sm:mb-4">
        <ScannerHowTo />
      </div>

      {/* Strains List */}
      {strains.length > 0 && (
        <div className="mb-3 sm:mb-4 bg-base-900 border border-base-700 rounded-lg p-3 sm:p-4">
          <div className="flex justify-between items-center mb-2 sm:mb-3">
            <p className="text-[10px] sm:text-xs font-medium uppercase tracking-widest text-gray-500">Strains in Batch</p>
            <span className="text-xs font-mono text-green-400">{totalPlants} plants total</span>
          </div>
          <div className="space-y-1.5 sm:space-y-2">
            {strains.map((s) => (
              <div key={s.id} className="flex justify-between items-center bg-base-800 border border-base-700 rounded px-3 sm:px-4 py-2 sm:py-2.5">
                <span className="font-medium text-gray-100 text-sm sm:text-base">{s.strain}</span>
                <div className="flex items-center gap-3 sm:gap-4">
                  <span className="text-xs text-gray-500 font-mono">{s.plantCount} plants</span>
                  <button
                    onClick={() => handleRemoveStrain(s.id)}
                    className="text-gray-600 hover:text-red-400 hover:underline transition-colors text-xs"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
          <button
            onClick={handleStart}
            className="mt-3 sm:mt-4 w-full py-3 bg-green-600 hover:bg-green-500 text-white font-medium rounded-lg transition-colors border border-green-500/30 text-sm sm:text-base"
          >
            Start Weighing ({totalPlants} plants)
          </button>
        </div>
      )}

      {/* Bulk Paste */}
      <div className="mb-3 sm:mb-4 bg-base-900 border border-base-700 rounded-lg">
        <button
          type="button"
          onClick={() => setBulkOpen(v => !v)}
          className="w-full flex items-center justify-between px-3 sm:px-5 py-2.5 sm:py-3 text-left"
          aria-expanded={bulkOpen}
        >
          <div>
            <p className="text-xs font-medium text-gray-300">Paste Strain List</p>
            <p className="text-[10px] text-gray-600 mt-0.5">Bulk add from a harvest sheet — one strain per line</p>
          </div>
          <span className="text-gray-500 text-xs">{bulkOpen ? '▲' : '▼'}</span>
        </button>
        {bulkOpen && (
          <div className="px-3 sm:px-5 pb-3 sm:pb-4 border-t border-base-700">
            <textarea
              value={bulkText}
              onChange={e => setBulkText(e.target.value)}
              placeholder={'CHERRIEZ 117\nRAINBOW RUNTZ 63\nBLUE NERDZ 144\n...'}
              rows={6}
              className="w-full mt-3 px-3 py-2 bg-base-800 border border-base-600 rounded text-gray-100 placeholder-gray-600 focus:outline-none focus:border-green-500/50 font-mono text-xs sm:text-sm"
            />
            <p className="text-[10px] text-gray-600 mt-1">
              Accepts: <span className="font-mono">NAME 117</span>, <span className="font-mono">NAME, 117</span>, <span className="font-mono">NAME 117 plants</span>
            </p>
            {bulkError && <p className="text-[10px] text-red-400 mt-1">{bulkError}</p>}
            <div className="flex gap-2 mt-3">
              <button
                type="button"
                onClick={handleBulkAdd}
                className="flex-1 py-2 bg-green-600 hover:bg-green-500 text-white text-xs font-medium rounded transition-colors"
              >
                Add All
              </button>
              <button
                type="button"
                onClick={() => { setBulkText(''); setBulkError(null); setBulkOpen(false); }}
                className="px-4 py-2 bg-base-800 hover:bg-base-700 border border-base-600 text-gray-400 text-xs rounded transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Add Strain Form */}
      <form onSubmit={handleAddStrain} className="bg-base-900 border border-base-700 rounded-lg p-3 sm:p-5 space-y-3 sm:space-y-4">
        <h3 className="text-sm font-semibold text-gray-300">
          {strains.length === 0 ? 'Add First Strain' : 'Add Another Strain'}
        </h3>

        <div>
          <label className="block text-[10px] sm:text-xs font-medium uppercase tracking-widest text-gray-500 mb-1.5">Strain Name</label>
          <input
            type="text"
            value={strainName}
            onChange={e => setStrainName(e.target.value)}
            placeholder="e.g. Gas Face"
            className="w-full px-3 py-2.5 bg-base-800 border border-base-600 rounded-lg text-gray-100 placeholder-gray-600 focus:outline-none focus:border-green-500/50 font-medium text-sm sm:text-base"
            required
          />
        </div>

        <div>
          <label className="block text-[10px] sm:text-xs font-medium uppercase tracking-widest text-gray-500 mb-1.5">Number of Plants</label>
          <input
            type="number"
            value={plantCount}
            onChange={e => setPlantCount(e.target.value)}
            placeholder="24"
            min="1"
            className="w-full px-3 py-2.5 bg-base-800 border border-base-600 rounded-lg text-gray-100 placeholder-gray-600 focus:outline-none focus:border-green-500/50 font-mono text-sm sm:text-base"
            required
          />
        </div>

        <button
          type="submit"
          className="w-full py-3 bg-base-800 hover:bg-base-700 text-gray-300 font-medium rounded-lg transition-colors border border-base-600 text-sm sm:text-base"
        >
          Add Strain
        </button>
      </form>
    </div>
  );
}
