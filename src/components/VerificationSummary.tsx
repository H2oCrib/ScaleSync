import type { StrainSession } from '../lib/types';
import { computeSummaries } from '../lib/export';

interface VerificationSummaryProps {
  sessions: StrainSession[];
  onExport: () => void;
  onNewSession: () => void;
}

export function VerificationSummary({ sessions, onExport, onNewSession }: VerificationSummaryProps) {
  const summaries = computeSummaries(sessions);
  const hasClaimed = summaries.some(s => s.claimedLbs != null || s.claimedGrams != null);

  const grandUnits = summaries.reduce((s, r) => s + r.units, 0);
  const grandGrams = Math.round(summaries.reduce((s, r) => s + r.totalGrams, 0) * 10) / 10;
  const grandLbs = Math.round(summaries.reduce((s, r) => s + r.totalLbs, 0) * 100) / 100;

  const claimedSummaries = summaries.filter(s => s.claimedLbs != null);
  const grandClaimed = claimedSummaries.length > 0
    ? Math.round(claimedSummaries.reduce((s, r) => s + r.claimedLbs!, 0) * 100) / 100
    : null;
  const diffSummaries = summaries.filter(s => s.differenceGrams != null);
  const grandDiff = diffSummaries.length > 0
    ? Math.round(diffSummaries.reduce((s, r) => s + r.differenceGrams!, 0) * 10) / 10
    : null;
  const verifiableSummaries = summaries.filter(s => s.status != null);
  const allVerified = verifiableSummaries.length > 0 && verifiableSummaries.every(s => s.status === 'VERIFIED');

  return (
    <div className="max-w-5xl mx-auto py-8 px-4">
      <div className="text-center mb-6">
        <p className="text-xs font-medium uppercase tracking-widest text-gray-500 mb-1">Report</p>
        <h2 className="text-3xl font-semibold text-gray-50 mb-1">Dry Weight Summary</h2>
        <p className="text-xs text-gray-500 font-mono">{new Date().toLocaleDateString()}</p>
      </div>

      {/* Summary Table */}
      <div className="bg-base-900 border border-base-700 rounded-lg overflow-x-auto mb-6">
        <table className="w-full text-left text-sm min-w-[700px]">
          <thead>
            <tr className="bg-base-800 border-b border-base-700">
              <th className="px-3 py-2.5 text-xs font-medium uppercase tracking-widest text-gray-500">Strain</th>
              <th className="px-2 py-2.5 text-xs font-medium uppercase tracking-widest text-gray-500">Type</th>
              <th className="px-2 py-2.5 text-xs font-medium uppercase tracking-widest text-gray-500 text-right">Units</th>
              <th className="px-2 py-2.5 text-xs font-medium uppercase tracking-widest text-gray-500 text-right">Total (g)</th>
              <th className="px-2 py-2.5 text-xs font-medium uppercase tracking-widest text-gray-500 text-right">Total (LBS)</th>
              {hasClaimed && <th className="px-2 py-2.5 text-xs font-medium uppercase tracking-widest text-gray-500 text-right">Claimed</th>}
              {hasClaimed && <th className="px-2 py-2.5 text-xs font-medium uppercase tracking-widest text-gray-500 text-right">Diff (g)</th>}
              {hasClaimed && <th className="px-3 py-2.5 text-xs font-medium uppercase tracking-widest text-gray-500 text-center">Status</th>}
            </tr>
          </thead>
          <tbody>
            {summaries.map((s, i) => (
              <tr key={i} className={`border-b border-base-700/50 ${i % 2 === 0 ? 'bg-base-900' : 'bg-base-800/30'}`}>
                <td className="px-3 py-2.5 font-medium text-gray-100">{s.strain}</td>
                <td className="px-2 py-2.5 text-gray-400">{s.type}</td>
                <td className="px-2 py-2.5 text-right font-mono text-gray-300">{s.units}</td>
                <td className="px-2 py-2.5 text-right font-mono text-gray-300">{s.totalGrams.toFixed(1)}</td>
                <td className="px-2 py-2.5 text-right font-mono text-gray-300">{s.totalLbs.toFixed(2)}</td>
                {hasClaimed && (
                  <td className="px-2 py-2.5 text-right font-mono text-gray-500">
                    {s.claimedLbs != null ? `${s.claimedLbs.toFixed(2)} lbs` :
                     s.claimedGrams != null ? `${s.claimedGrams.toFixed(1)} g` : '—'}
                  </td>
                )}
                {hasClaimed && (
                  <td className={`px-2 py-2.5 text-right font-mono ${
                    s.differenceGrams != null && Math.abs(s.differenceGrams) > 5 ? 'text-red-400' : 'text-gray-400'
                  }`}>
                    {s.differenceGrams != null
                      ? `${s.differenceGrams > 0 ? '+' : ''}${s.differenceGrams.toFixed(1)}`
                      : '—'}
                  </td>
                )}
                {hasClaimed && (
                  <td className="px-3 py-2.5 text-center">
                    {s.status != null ? (
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        s.status === 'VERIFIED'
                          ? 'bg-green-500/15 text-green-400'
                          : 'bg-red-500/15 text-red-400'
                      }`}>
                        {s.status}
                      </span>
                    ) : (
                      <span className="text-gray-600 text-xs">N/A</span>
                    )}
                  </td>
                )}
              </tr>
            ))}
            {/* Grand Total */}
            <tr className="bg-base-800 border-t-2 border-base-600">
              <td className="px-3 py-2.5 font-semibold text-gray-100">GRAND TOTAL</td>
              <td className="px-2 py-2.5"></td>
              <td className="px-2 py-2.5 text-right font-mono font-semibold text-gray-100">{grandUnits}</td>
              <td className="px-2 py-2.5 text-right font-mono font-semibold text-gray-100">{grandGrams.toFixed(1)}</td>
              <td className="px-2 py-2.5 text-right font-mono font-semibold text-gray-100">{grandLbs.toFixed(2)}</td>
              {hasClaimed && (
                <td className="px-2 py-2.5 text-right font-mono text-gray-400">
                  {grandClaimed != null ? grandClaimed.toFixed(2) : '—'}
                </td>
              )}
              {hasClaimed && (
                <td className={`px-2 py-2.5 text-right font-mono font-semibold ${
                  grandDiff != null && Math.abs(grandDiff) > 5 ? 'text-red-400' : 'text-gray-300'
                }`}>
                  {grandDiff != null ? `${grandDiff > 0 ? '+' : ''}${grandDiff.toFixed(1)}` : '—'}
                </td>
              )}
              {hasClaimed && (
                <td className="px-3 py-2.5 text-center">
                  {verifiableSummaries.length > 0 ? (
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      allVerified
                        ? 'bg-green-500/15 text-green-400'
                        : 'bg-red-500/15 text-red-400'
                    }`}>
                      {allVerified ? 'ALL VERIFIED' : 'HAS VARIANCE'}
                    </span>
                  ) : (
                    <span className="text-gray-600 text-xs">N/A</span>
                )}
              </td>
              )}
            </tr>
          </tbody>
        </table>
      </div>

      {/* Detail tables */}
      {sessions.map((session, si) => (
        <div key={si} className="bg-base-900 border border-base-700 rounded-lg overflow-hidden mb-3">
          <div className="bg-base-800 px-4 py-2 border-b border-base-700">
            <h3 className="text-sm font-medium text-gray-300">
              {session.config.strain}
              <span className="text-gray-500 font-normal ml-2">{session.config.type} &middot; {session.readings.length} units</span>
            </h3>
          </div>
          <div className="max-h-48 overflow-y-auto">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-base-900 border-b border-base-700">
                <tr>
                  <th className="px-4 py-1.5 text-xs font-medium uppercase tracking-widest text-gray-500">#</th>
                  <th className="px-4 py-1.5 text-xs font-medium uppercase tracking-widest text-gray-500 text-right">Weight (g)</th>
                  <th className="px-4 py-1.5 text-xs font-medium uppercase tracking-widest text-gray-500">Time</th>
                </tr>
              </thead>
              <tbody>
                {session.readings.map((r, i) => (
                  <tr key={r.id} className={i % 2 === 0 ? 'bg-base-900' : 'bg-base-800/30'}>
                    <td className="px-4 py-1.5 font-mono text-gray-400 text-sm">{r.unitNumber}</td>
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
      ))}

      {/* Actions */}
      <div className="flex gap-3 mt-6">
        <button
          onClick={onExport}
          className="flex-1 py-3 bg-cyan-600 hover:bg-cyan-500 text-white font-medium rounded-lg transition-colors border border-cyan-500/30"
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
