import { useState } from 'react';
import type { ProductType, StrainConfig } from '../lib/types';

interface SessionSetupProps {
  onAddStrain: (config: StrainConfig) => void;
  onStartWeighing: () => void;
  strains: StrainConfig[];
}

export function SessionSetup({ onAddStrain, onStartWeighing, strains }: SessionSetupProps) {
  const [strain, setStrain] = useState('');
  const [type, setType] = useState<ProductType>('Flower');
  const [totalUnits, setTotalUnits] = useState('');
  const [claimedLbs, setClaimedLbs] = useState('');
  const [partialCount, setPartialCount] = useState('');
  const [partialSize, setPartialSize] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!strain.trim() || !totalUnits) return;

    const pCount = partialCount ? parseInt(partialCount) : 0;

    const claimed = claimedLbs ? parseFloat(claimedLbs) : null;
    onAddStrain({
      id: crypto.randomUUID(),
      strain: strain.trim(),
      type,
      totalUnits: parseInt(totalUnits),
      claimedLbs: !isBagged && claimed != null ? claimed : null,
      claimedGrams: isBagged && claimed != null ? claimed : null,
      partialCount: pCount,
      partialSizeGrams: partialSize ? parseFloat(partialSize) : 226.8,
    });

    setStrain('');
    setType('Flower');
    setTotalUnits('');
    setClaimedLbs('');
    setPartialCount('');
    setPartialSize('');
  };

  const formatPartialLabel = (count: number, sizeGrams: number) => {
    return `${count} × ${sizeGrams}g`;
  };

  const isBagged = type === 'Trim' || type === 'Popcorn';
  const itemLabel = isBagged ? 'Bags' : 'Full Units';

  return (
    <div className="max-w-2xl mx-auto py-8 px-4">
      <p className="text-xs font-medium uppercase tracking-widest text-gray-500 mb-1">Configure</p>
      <h2 className="text-2xl font-semibold text-gray-50 mb-6">Session Setup</h2>

      {strains.length > 0 && (
        <div className="mb-6 bg-base-900 border border-base-700 rounded-lg p-4">
          <p className="text-xs font-medium uppercase tracking-widest text-gray-500 mb-3">Strains Queued</p>
          <div className="space-y-2">
            {strains.map((s) => (
              <div key={s.id} className="flex justify-between items-center bg-base-800 border border-base-700 rounded px-4 py-2.5">
                <span className="font-medium text-gray-100">{s.strain}</span>
                <div className="flex gap-4 text-xs text-gray-500 font-mono">
                  <span>{s.type}</span>
                  <span>{s.totalUnits} {s.type === 'Trim' || s.type === 'Popcorn' ? 'bags' : 'units'}</span>
                  {s.partialCount > 0 && (
                    <span className="text-amber-400/70">{formatPartialLabel(s.partialCount, s.partialSizeGrams)}</span>
                  )}
                  {s.claimedLbs != null && <span>{s.claimedLbs} lbs</span>}
                  {s.claimedGrams != null && <span>{s.claimedGrams}g claimed</span>}
                </div>
              </div>
            ))}
          </div>
          <button
            onClick={onStartWeighing}
            className="mt-4 w-full py-3 bg-cyan-600 hover:bg-cyan-500 text-white font-medium rounded-lg transition-colors border border-cyan-500/30"
          >
            Start Weighing
          </button>
        </div>
      )}

      <form onSubmit={handleSubmit} className="bg-base-900 border border-base-700 rounded-lg p-5 space-y-4">
        <h3 className="text-sm font-semibold text-gray-300">
          {strains.length === 0 ? 'Add First Strain' : 'Add Another Strain'}
        </h3>

        <div>
          <label className="block text-xs font-medium uppercase tracking-widest text-gray-500 mb-1.5">Strain Name</label>
          <input
            type="text"
            value={strain}
            onChange={e => setStrain(e.target.value)}
            placeholder="e.g. Gas Face"
            className="w-full px-3 py-2.5 bg-base-800 border border-base-600 rounded-lg text-gray-100 placeholder-gray-600 focus:outline-none focus:border-cyan-500/50 font-medium"
            required
          />
        </div>

        <div>
          <label className="block text-xs font-medium uppercase tracking-widest text-gray-500 mb-1.5">Product Type</label>
          <select
            value={type}
            onChange={e => setType(e.target.value as ProductType)}
            className="w-full px-3 py-2.5 bg-base-800 border border-base-600 rounded-lg text-gray-100 focus:outline-none focus:border-cyan-500/50"
          >
            <option value="Flower">Flower</option>
            <option value="Trim">Trim</option>
            <option value="Popcorn">Popcorn</option>
          </select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium uppercase tracking-widest text-gray-500 mb-1.5">{itemLabel}</label>
            <input
              type="number"
              value={totalUnits}
              onChange={e => setTotalUnits(e.target.value)}
              placeholder="77"
              min="1"
              className="w-full px-3 py-2.5 bg-base-800 border border-base-600 rounded-lg text-gray-100 placeholder-gray-600 focus:outline-none focus:border-cyan-500/50 font-mono"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium uppercase tracking-widest text-gray-500 mb-1.5">
              {isBagged ? 'Claimed (g)' : 'Claimed (LBS)'} <span className="text-gray-600 normal-case tracking-normal">optional</span>
            </label>
            <input
              type="number"
              value={claimedLbs}
              onChange={e => setClaimedLbs(e.target.value)}
              placeholder={isBagged ? '5000' : '76.78'}
              min="0"
              step={isBagged ? '1' : '0.01'}
              className="w-full px-3 py-2.5 bg-base-800 border border-base-600 rounded-lg text-gray-100 placeholder-gray-600 focus:outline-none focus:border-cyan-500/50 font-mono"
            />
          </div>
        </div>

        {/* Partials */}
        <div className="border-t border-base-700 pt-4">
          <p className="text-xs font-medium uppercase tracking-widest text-gray-500 mb-3">
            Partials <span className="text-gray-600 normal-case tracking-normal">optional</span>
          </p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">How Many</label>
              <input
                type="number"
                value={partialCount}
                onChange={e => setPartialCount(e.target.value)}
                placeholder="0"
                min="0"
                className="w-full px-3 py-2.5 bg-base-800 border border-base-600 rounded-lg text-gray-100 placeholder-gray-600 focus:outline-none focus:border-cyan-500/50 font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Partial Size (g)</label>
              <input
                type="number"
                value={partialSize}
                onChange={e => setPartialSize(e.target.value)}
                placeholder="226.8"
                min="1"
                step="0.1"
                className="w-full px-3 py-2.5 bg-base-800 border border-base-600 rounded-lg text-gray-100 placeholder-gray-600 focus:outline-none focus:border-cyan-500/50 font-mono"
              />
            </div>
          </div>
        </div>

        <button
          type="submit"
          className="w-full py-3 bg-base-800 hover:bg-base-700 text-gray-300 font-medium rounded-lg transition-colors border border-base-600"
        >
          Add Strain
        </button>
      </form>
    </div>
  );
}
