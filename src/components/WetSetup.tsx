import { useState } from 'react';
import type { HarvestBatchConfig, HarvestStrainConfig } from '../lib/types';

interface WetSetupProps {
  onStartWeighing: (config: HarvestBatchConfig) => void;
  onBack: () => void;
}

export function WetSetup({ onStartWeighing, onBack }: WetSetupProps) {
  const today = new Date().toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' });
  const [batchName, setBatchName] = useState(`Harvest ${today}`);
  const [strains, setStrains] = useState<HarvestStrainConfig[]>([]);
  const [strainName, setStrainName] = useState('');
  const [plantCount, setPlantCount] = useState('');

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

  const handleStart = () => {
    if (strains.length === 0 || !batchName.trim()) return;
    onStartWeighing({
      id: crypto.randomUUID(),
      batchName: batchName.trim(),
      strains,
      date: new Date(),
    });
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
                    className="text-gray-600 hover:text-red-400 transition-colors text-xs"
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
