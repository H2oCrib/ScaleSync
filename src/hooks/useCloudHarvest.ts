import { useEffect } from 'react';
import { supabase } from '../lib/supabase';
import type { WetWeightReading } from '../lib/types';

interface UseCloudHarvestOptions {
  enabled: boolean;
  harvestId: string | null;
  deviceId: string;
  /** Called when a reading is inserted by another device. */
  onRemoteReading: (reading: WetWeightReading) => void;
}

interface ReadingRow {
  id: string;
  harvest_id: string;
  plant_number: number;
  strain: string;
  tag_id: string;
  weight_grams: string | number;
  captured_at: string;
  device_id: string | null;
}

function mapRow(row: ReadingRow): WetWeightReading {
  return {
    id: row.id,
    plantNumber: row.plant_number,
    strain: row.strain,
    tagId: row.tag_id,
    weightGrams: Number(row.weight_grams),
    timestamp: new Date(row.captured_at),
  };
}

/**
 * Subscribe to INSERTs on harvest_readings for a specific harvest and
 * surface rows that other devices write. No-op when disabled, no harvest,
 * or no client.
 *
 * Pattern per:
 * https://supabase.com/docs/guides/realtime/postgres-changes
 * Cleanup via supabase.removeChannel per the React example in:
 * https://supabase.com/docs/guides/realtime/getting_started
 */
export function useCloudHarvest({
  enabled,
  harvestId,
  deviceId,
  onRemoteReading,
}: UseCloudHarvestOptions): void {
  useEffect(() => {
    if (!enabled || !harvestId || !supabase) return;

    const channel = supabase
      .channel(`harvest:${harvestId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'harvest_readings',
          filter: `harvest_id=eq.${harvestId}`,
        },
        (payload: { new: ReadingRow }) => {
          const row = payload.new;
          if (!row) return;
          if (row.device_id && row.device_id === deviceId) return; // ignore own writes
          onRemoteReading(mapRow(row));
        },
      )
      .subscribe();

    return () => {
      supabase!.removeChannel(channel);
    };
  }, [enabled, harvestId, deviceId, onRemoteReading]);
}
