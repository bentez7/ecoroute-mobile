import * as SQLite from 'expo-sqlite';

import type { TelemetryPoint } from './api';

const DB_NAME = 'telemetry.db';

export interface QueuedPoint extends TelemetryPoint {
  _row_id: number;
  trip_id: string;
}

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await SQLite.openDatabaseAsync(DB_NAME);
      await db.execAsync(
        `CREATE TABLE IF NOT EXISTS telemetry_queue (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          trip_id TEXT NOT NULL,
          recorded_at TEXT NOT NULL,
          lat REAL NOT NULL,
          lng REAL NOT NULL,
          speed_ms REAL,
          accel_ms2 REAL,
          altitude_m REAL,
          heading_deg REAL
        );`,
      );
      return db;
    })();
  }
  return dbPromise;
}

export async function enqueuePoint(trip_id: string, p: TelemetryPoint): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO telemetry_queue
      (trip_id, recorded_at, lat, lng, speed_ms, accel_ms2, altitude_m, heading_deg)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
    trip_id,
    p.recorded_at,
    p.lat,
    p.lng,
    p.speed_ms ?? null,
    p.accel_ms2 ?? null,
    p.altitude_m ?? null,
    p.heading_deg ?? null,
  );
}

export async function pullPoints(trip_id: string, limit = 200): Promise<QueuedPoint[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{
    id: number;
    trip_id: string;
    recorded_at: string;
    lat: number;
    lng: number;
    speed_ms: number | null;
    accel_ms2: number | null;
    altitude_m: number | null;
    heading_deg: number | null;
  }>(
    `SELECT id, trip_id, recorded_at, lat, lng, speed_ms, accel_ms2, altitude_m, heading_deg
     FROM telemetry_queue WHERE trip_id = ? ORDER BY id ASC LIMIT ?;`,
    trip_id,
    limit,
  );
  return rows.map((r) => ({
    _row_id: r.id,
    trip_id: r.trip_id,
    recorded_at: r.recorded_at,
    lat: r.lat,
    lng: r.lng,
    speed_ms: r.speed_ms,
    accel_ms2: r.accel_ms2,
    altitude_m: r.altitude_m,
    heading_deg: r.heading_deg,
  }));
}

export async function deletePoints(rowIds: number[]): Promise<void> {
  if (rowIds.length === 0) return;
  const db = await getDb();
  const placeholders = rowIds.map(() => '?').join(',');
  await db.runAsync(
    `DELETE FROM telemetry_queue WHERE id IN (${placeholders});`,
    ...rowIds,
  );
}

export async function clearTrip(trip_id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(`DELETE FROM telemetry_queue WHERE trip_id = ?;`, trip_id);
}
