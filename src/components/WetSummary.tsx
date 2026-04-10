import type { HarvestSession, HarvestSummary } from '../lib/types';
import { GRAMS_PER_LB } from '../lib/types';

interface WetSummaryProps {
  session: HarvestSession;
  onExport: () => void;
  onNewSession: () => void;
}

function computeHarvestSummaries(session: HarvestSession): HarvestSummary[] {
  return session.config.strains.map(sc => {
    const strainReadings = session.readings.filter(r => r.strain === sc.strain);
    const totalGrams = strainReadings.reduce((sum, r) => sum + r.weightGrams, 0);
    return {
      strain: sc.strain,
      plantCount: sc.plantCount,
      plantsWeighed: strainReadings.length,
      totalGrams: Math.round(totalGrams * 10) / 10,
      totalLbs: Math.round((totalGrams / GRAMS_PER_LB) * 100) / 100,
      avgPerPlant: strainReadings.length > 0
        ? Math.round((totalGrams / strainReadings.length) * 10) / 10
        : 0,
    };
  });
}

export function WetSummary({ session, onExport, onNewSession }: WetSummaryProps) {
  const summaries = computeHarvestSummaries(session);

  const grandPlants = summaries.reduce((s, r) => s + r.plantCount, 0);
  const grandWeighed = summaries.reduce((s, r) => s + r.plantsWeighed, 0);
  const grandGrams = Math.round(summaries.reduce((s, r) => s + r.totalGrams, 0) * 10) / 10;
  const grandLbs = Math.round(summaries.reduce((s, r) => s + r.totalLbs, 0) * 100) / 100;
  const grandAvg = grandWeighed > 0 ? Math.round((grandGrams / grandWeighed) * 10) / 10 : 0;

  return (
    <div className="max-w-5xl mx-auto py-8 px-4">
      <div className="text-center mb-6">
        <p className="text-xs font-medium uppercase tracking-widest text-gray-500 mb-1">Report</p>
        <h2 className="text-3xl font-semibold text-gray-50 mb-1">Wet Weight Harvest Summary</h2>
        <p className="text-sm text-gray-400 mb-0.5">{session.config.batchName}</p>
        <p className="text-xs text-gray-500 font-mono">
          {(session.config.date instanceof Date ? session.config.date : new Date(session.config.date)).toLocaleDateString()}
        </p>
      </div>

      {/* Summary Table */}
      <div className="bg-base-900 border border-base-700 rounded-lg overflow-x-auto mb-6">
        <table className="w-full text-left text-sm min-w-[600px]">
          <thead>
            <tr className="bg-base-800 border-b border-base-700">
              <th className="px-3 py-2.5 text-xs font-medium uppercase tracking-widest text-gray-500">Strain</th>
              <th className="px-2 py-2.5 text-xs font-medium uppercase tracking-widest text-gray-500 text-right">Expected</th>
              <th className="px-2 py-2.5 text-xs font-medium uppercase tracking-widest text-gray-500 text-right">Weighed</th>
              <th className="px-2 py-2.5 text-xs font-medium uppercase tracking-widest text-gray-500 text-right">Total (g)</th>
              <th className="px-2 py-2.5 text-xs font-medium uppercase tracking-widest text-gray-500 text-right">Total (LBS)</th>
              <th className="px-3 py-2.5 text-xs font-medium uppercase tracking-widest text-gray-500 text-right">Avg / Plant</th>
            </tr>
          </thead>
          <tbody>
            {summaries.map((s, i) => (
              <tr key={i} className={`border-b border-base-700/50 ${i % 2 === 0 ? 'bg-base-900' : 'bg-base-800/30'}`}>
                <td className="px-3 py-2.5 font-medium text-gray-100">{s.strain}</td>
                <td className="px-2 py-2.5 text-right font-mono text-gray-400">{s.plantCount}</td>
                <td className={`px-2 py-2.5 text-right font-mono ${
                  s.plantsWeighed === s.plantCount ? 'text-green-400' : 'text-amber-400'
                }`}>{s.plantsWeighed}</td>
                <td className="px-2 py-2.5 text-right font-mono text-gray-300">{s.totalGrams.toFixed(1)}</td>
                <td className="px-2 py-2.5 text-right font-mono text-gray-300">{s.totalLbs.toFixed(2)}</td>
                <td className="px-3 py-2.5 text-right font-mono text-gray-400">{s.avgPerPlant.toFixed(1)} g</td>
              </tr>
            ))}
            {/* Grand Total */}
            <tr className="bg-base-800 border-t-2 border-base-600">
              <td className="px-3 py-2.5 font-semibold text-gray-100">GRAND TOTAL</td>
              <td className="px-2 py-2.5 text-right font-mono font-semibold text-gray-100">{grandPlants}</td>
              <td className="px-2 py-2.5 text-right font-mono font-semibold text-gray-100">{grandWeighed}</td>
              <td className="px-2 py-2.5 text-right font-mono font-semibold text-gray-100">{grandGrams.toFixed(1)}</td>
              <td className="px-2 py-2.5 text-right font-mono font-semibold text-gray-100">{grandLbs.toFixed(2)}</td>
              <td className="px-3 py-2.5 text-right font-mono font-semibold text-gray-300">{grandAvg.toFixed(1)} g</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Detail tables per strain */}
      {session.config.strains.map((sc, si) => {
        const strainReadings = session.readings.filter(r => r.strain === sc.strain);
        if (strainReadings.length === 0) return null;
        return (
          <div key={si} className="bg-base-900 border border-base-700 rounded-lg overflow-hidden mb-3">
            <div className="bg-base-800 px-4 py-2 border-b border-base-700">
              <h3 className="text-sm font-medium text-gray-300">
                {sc.strain}
                <span className="text-gray-500 font-normal ml-2">{strainReadings.length} plants</span>
              </h3>
            </div>
            <div className="max-h-48 overflow-y-auto">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-base-900 border-b border-base-700">
                  <tr>
                    <th className="px-4 py-1.5 text-xs font-medium uppercase tracking-widest text-gray-500">#</th>
                    <th className="px-4 py-1.5 text-xs font-medium uppercase tracking-widest text-gray-500">Tag ID</th>
                    <th className="px-4 py-1.5 text-xs font-medium uppercase tracking-widest text-gray-500 text-right">Weight (g)</th>
                    <th className="px-4 py-1.5 text-xs font-medium uppercase tracking-widest text-gray-500">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {strainReadings.map((r, i) => (
                    <tr key={r.id} className={i % 2 === 0 ? 'bg-base-900' : 'bg-base-800/30'}>
                      <td className="px-4 py-1.5 font-mono text-gray-400 text-sm">{r.plantNumber}</td>
                      <td className="px-4 py-1.5 font-mono text-green-400/80 text-sm">{r.tagId}</td>
                      <td className="px-4 py-1.5 font-mono text-right text-gray-200 text-sm">{r.weightGrams.toFixed(1)}</td>
                      <td className="px-4 py-1.5 text-gray-500 text-xs">
                        {(r.timestamp instanceof Date ? r.timestamp : new Date(r.timestamp)).toLocaleTimeString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}

      {/* Actions */}
      <div className="flex gap-3 mt-6">
        <button
          onClick={onExport}
          className="flex-1 py-3 bg-green-600 hover:bg-green-500 text-white font-medium rounded-lg transition-colors border border-green-500/30"
        >
          Export Excel
        </button>
        <button
          onClick={onNewSession}
          className="flex-1 py-3 bg-base-800 hover:bg-base-700 text-gray-400 font-medium rounded-lg transition-colors border border-base-600"
        >
          New Session
        </button>
      </div>
    </div>
  );
}
