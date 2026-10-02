/**
 * IndexedDB storage utility for caching Copernicus GeoTIFF DEM files in the browser.
 * Persists large binary DEM Blobs (100MB+) locally so users do not need to re-download
 * or re-upload the file on subsequent visits.
 */

const DB_NAME = 'CopernicusViewshedDB';
const DB_VERSION = 1;
const STORE_NAME = 'dem_store';
const RECORD_KEY = 'active_dem';

/**
 * Opens or initializes the IndexedDB database.
 * @returns {Promise<IDBDatabase>}
 */
function openDB() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new Error('IndexedDB is not supported in this browser.'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };

    request.onsuccess = (event) => {
      resolve(event.target.result);
    };

    request.onerror = (event) => {
      reject(event.target.error || new Error('Failed to open IndexedDB.'));
    };
  });
}

/**
 * Saves a DEM File or Blob into IndexedDB.
 *
 * @param {Blob|File|ArrayBuffer} fileOrBlob
 * @param {Object} [metadata={}] - Optional metadata like fileName, width, height, bbox
 * @returns {Promise<boolean>}
 */
export async function saveDemToCache(fileOrBlob, metadata = {}) {
  try {
    // Request persistent storage if available so browser eviction won't discard the file
    if (navigator.storage && navigator.storage.persist) {
      navigator.storage.persist().catch(() => {});
    }

    let blob = fileOrBlob;
    if (fileOrBlob instanceof ArrayBuffer) {
      blob = new Blob([fileOrBlob], { type: 'image/tiff' });
    }

    const db = await openDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);

      const record = {
        id: RECORD_KEY,
        name: metadata.fileName || blob.name || 'Copernicus_DEM.tif',
        size: blob.size || 0,
        blob: blob,
        updatedAt: Date.now(),
        metadata: {
          width: metadata.width,
          height: metadata.height,
          bbox: metadata.bbox,
          noData: metadata.noData
        }
      };

      const request = store.put(record);

      request.onsuccess = () => resolve(true);
      request.onerror = (e) => reject(e.target.error);
    });
  } catch (err) {
    console.warn('Failed to save DEM to IndexedDB cache:', err);
    return false;
  }
}

/**
 * Retrieves the cached DEM from IndexedDB.
 *
 * @returns {Promise<{ blob: Blob, name: string, size: number, updatedAt: number, metadata: Object } | null>}
 */
export async function getCachedDem() {
  try {
    const db = await openDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(RECORD_KEY);

      request.onsuccess = (e) => {
        const result = e.target.result;
        if (!result || !result.blob) {
          resolve(null);
        } else {
          resolve(result);
        }
      };

      request.onerror = (e) => reject(e.target.error);
    });
  } catch (err) {
    console.warn('Failed to read cached DEM from IndexedDB:', err);
    return null;
  }
}

/**
 * Removes the cached DEM from IndexedDB.
 *
 * @returns {Promise<boolean>}
 */
export async function clearDemCache() {
  try {
    const db = await openDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(RECORD_KEY);

      request.onsuccess = () => resolve(true);
      request.onerror = (e) => reject(e.target.error);
    });
  } catch (err) {
    console.warn('Failed to clear cached DEM from IndexedDB:', err);
    return false;
  }
}

/**
 * Formats byte size into human readable string (e.g. 100.2 MB).
 *
 * @param {number} bytes
 * @returns {string}
 */
export function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}
