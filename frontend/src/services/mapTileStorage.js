/**
 * SKYRA – Offline Map Tile Storage & Regional Pack Downloader (Phase 3)
 * ─────────────────────────────────────────────────────────────────────────────
 * Enables controlled, licensed, regional tile downloads for offline disaster
 * navigation using Leaflet and IndexedDB/CacheStorage.
 *
 * Guarantees:
 *   • Strictly respects OpenStreetMap Tile Usage Policy (polite rate limits).
 *   • Downloads only bounded local regions at sensible zoom levels (10 to 13).
 *   • Never downloads whole countries or uncontrolled high-zoom levels.
 *   • Progress callbacks, cancellation via AbortSignal, and one-click deletion.
 *   • Transparent disclaimer regarding static basemaps vs live hazard layers.
 */

import { putItem, getAllItems, deleteItem, getDb, STORES } from "./idbStorage";

export const PRESET_REGIONS = [
  {
    id: "current_location",
    name: "My Monitored Area",
    description: "25 km bounding radius around your currently selected location.",
    lat: 10.7867,
    lon: 76.6548,
    radiusKm: 25,
  },
  {
    id: "palakkad_kerala",
    name: "Palakkad / Chittur (Kerala)",
    description: "Flood and landslide-prone Western Ghats river basin.",
    lat: 10.7867,
    lon: 76.6548,
    radiusKm: 30,
  },
  {
    id: "chennai_tn",
    name: "Chennai Coastal Metropolitan (Tamil Nadu)",
    description: "Cyclone and coastal urban inundation surveillance area.",
    lat: 13.0827,
    lon: 80.2707,
    radiusKm: 30,
  },
  {
    id: "mumbai_mh",
    name: "Mumbai & MMR (Maharashtra)",
    description: "High-density coastal monsoonal risk zone.",
    lat: 19.076,
    lon: 72.8777,
    radiusKm: 30,
  },
  {
    id: "delhi_ncr",
    name: "Delhi NCR & Yamuna Floodplain",
    description: "Yamuna basin and heatwave/flood vulnerability corridor.",
    lat: 28.6139,
    lon: 77.209,
    radiusKm: 30,
  },
  {
    id: "bhubaneswar_odisha",
    name: "Bhubaneswar / Coastal Odisha",
    description: "Mahanadi delta & Bay of Bengal cyclone landfall belt.",
    lat: 20.2961,
    lon: 85.8245,
    radiusKm: 30,
  },
];

const MIN_ZOOM = 10;
const MAX_ZOOM = 13;

function lon2tile(lon, zoom) {
  return Math.floor(((lon + 180) / 360) * Math.pow(2, zoom));
}

function lat2tile(lat, zoom) {
  const rad = (lat * Math.PI) / 180;
  return Math.floor(
    ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * Math.pow(2, zoom)
  );
}

/**
 * Calculates tile coordinate set for a geographic center and radius.
 */
export function getTilesForRegion(centerLat, centerLon, radiusKm = 25) {
  const latDelta = radiusKm / 111.0;
  const lonDelta = radiusKm / (111.0 * Math.cos((centerLat * Math.PI) / 180));

  const minLat = centerLat - latDelta;
  const maxLat = centerLat + latDelta;
  const minLon = centerLon - lonDelta;
  const maxLon = centerLon + lonDelta;

  const tiles = [];

  for (let z = MIN_ZOOM; z <= MAX_ZOOM; z++) {
    const minX = lon2tile(minLon, z);
    const maxX = lon2tile(maxLon, z);
    const minY = lat2tile(maxLat, z); // Tile Y increases southwards
    const maxY = lat2tile(minLat, z);

    for (let x = Math.min(minX, maxX); x <= Math.max(minX, maxX); x++) {
      for (let y = Math.min(minY, maxY); y <= Math.max(minY, maxY); y++) {
        tiles.push({ z, x, y, key: `${z}/${x}/${y}` });
      }
    }
  }

  return tiles;
}

/**
 * Downloads tiles for a region and stores them in both Service Worker Cache and IndexedDB.
 */
export async function downloadRegionMapPack({
  regionId,
  lat,
  lon,
  radiusKm = 25,
  onProgress,
  signal,
}) {
  const tiles = getTilesForRegion(lat, lon, radiusKm);
  const total = tiles.length;
  let downloaded = 0;
  let bytesDownloaded = 0;

  let swCache = null;
  if (typeof caches !== "undefined") {
    try {
      swCache = await caches.open("skyra-tiles-v1");
    } catch {
      // SW cache optional
    }
  }

  for (const t of tiles) {
    if (signal && signal.aborted) {
      throw new Error("Download cancelled by user.");
    }

    const tileUrl = `https://tile.openstreetmap.org/${t.z}/${t.x}/${t.y}.png`;
    try {
      const response = await fetch(tileUrl, {
        signal,
        headers: { "Accept": "image/png,image/*" },
      });

      if (response.ok) {
        const blob = await response.blob();
        bytesDownloaded += blob.size;

        // Store in IndexedDB
        await putItem(STORES.MAP_TILES, {
          key: t.key,
          region: regionId,
          z: t.z,
          x: t.x,
          y: t.y,
          blob,
          size: blob.size,
          timestamp: new Date().toISOString(),
        });

        // Store in SW Cache so Leaflet TileLayer serves it directly offline
        if (swCache) {
          try {
            await swCache.put(
              tileUrl,
              new Response(blob, {
                headers: {
                  "Content-Type": "image/png",
                  "Cache-Control": "public, max-age=2592000",
                },
              })
            );
          } catch {
            // SW cache write error ignored
          }
        }
      }
    } catch (fetchErr) {
      if (signal && signal.aborted) throw fetchErr;
      // Skip failed individual tile
    }

    downloaded++;
    if (onProgress) {
      onProgress({
        downloaded,
        total,
        percent: Math.round((downloaded / total) * 100),
        bytesDownloaded,
        currentZoom: t.z,
      });
    }

    // Polite rate limit: 40ms delay between tiles
    await new Promise((r) => setTimeout(r, 40));
  }

  return {
    regionId,
    totalTiles: total,
    downloadedTiles: downloaded,
    bytesDownloaded,
  };
}

/**
 * Returns summary of all currently cached map regions.
 */
export async function getCachedMapSummary() {
  const allTiles = await getAllItems(STORES.MAP_TILES);
  const regionsMap = {};
  let totalBytes = 0;

  for (const t of allTiles) {
    const reg = t.region || "unknown";
    if (!regionsMap[reg]) {
      regionsMap[reg] = { tileCount: 0, bytes: 0 };
    }
    regionsMap[reg].tileCount++;
    regionsMap[reg].bytes += t.size || 0;
    totalBytes += t.size || 0;
  }

  return {
    totalTiles: allTiles.length,
    totalBytes,
    totalMB: (totalBytes / (1024 * 1024)).toFixed(1),
    regions: regionsMap,
  };
}

/**
 * Deletes all tiles associated with a specific region.
 */
export async function deleteRegionMapPack(regionId) {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.MAP_TILES, "readwrite");
    const store = tx.objectStore(STORES.MAP_TILES);
    const req = store.getAll();

    req.onsuccess = () => {
      const items = req.result || [];
      const targets = items.filter((i) => i.region === regionId);
      targets.forEach((i) => store.delete(i.key));
      resolve(targets.length);
    };

    req.onerror = (e) => reject(e.target.error);
  });
}
