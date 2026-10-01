import { fromArrayBuffer } from 'geotiff';

/**
 * Parses a GeoTIFF File, Blob, or ArrayBuffer.
 * Extracts metadata, bounding box, dimensions, and elevation raster band.
 */
export async function parseGeoTiff(source, onProgress) {
  let arrayBuffer;
  if (source instanceof ArrayBuffer) {
    arrayBuffer = source;
  } else if (source instanceof Blob || source instanceof File) {
    if (onProgress) onProgress({ stage: 'reading_file', percent: 20 });
    arrayBuffer = await source.arrayBuffer();
  } else {
    throw new Error('Unsupported source format. Expected File, Blob, or ArrayBuffer.');
  }

  if (onProgress) onProgress({ stage: 'parsing_geotiff', percent: 50 });
  const tiff = await fromArrayBuffer(arrayBuffer);
  const image = await tiff.getImage(0);

  const width = image.getWidth();
  const height = image.getHeight();
  const bbox = image.getBoundingBox(); // [minX, minY, maxX, maxY]
  
  // GDAL nodata metadata if present
  let noData = null;
  try {
    noData = image.getGDALNoData();
  } catch {
    noData = null;
  }

  if (onProgress) onProgress({ stage: 'reading_rasters', percent: 70 });
  const rasters = await image.readRasters();
  const elevationData = rasters[0]; // TypedArray: Float32Array or Int16Array

  if (onProgress) onProgress({ stage: 'complete', percent: 100 });

  return {
    width,
    height,
    bbox, // [minX (minLon), minY (minLat), maxX (maxLon), maxY (maxLat)]
    noData,
    elevationData,
    // Original buffer for transfer to Web Worker
    buffer: elevationData.buffer
  };
}

/**
 * Creates an in-memory bilinear elevation sampler.
 * Transforms (lat, lon) to raster pixel indices and bilinearly interpolates
 * between the 4 neighboring elevation pixels to avoid staircase artifacts.
 *
 * @param {Object} config - { elevationData, width, height, bbox, noData }
 * @returns {Function} (lat, lon) => number | null
 */
export function createElevationSampler({ elevationData, width, height, bbox, noData }) {
  const [minX, minY, maxX, maxY] = bbox;
  const spanX = maxX - minX;
  const spanY = maxY - minY;
  const noDataVal = (noData !== undefined && noData !== null) ? Number(noData) : -9999;

  const isValidValue = (z) => {
    return z !== undefined &&
           !isNaN(z) &&
           z !== noDataVal &&
           z > -9000 &&
           z < 15000; // Reasonable terrestrial elevation limits (-9000m to 15000m)
  };

  return function getElevationAt(lat, lon) {
    // Check coverage boundaries
    if (lon < minX || lon > maxX || lat < minY || lat > maxY) {
      return null;
    }

    // Fractional raster pixel indices
    const fx = ((lon - minX) / spanX) * (width - 1);
    const fy = ((maxY - lat) / spanY) * (height - 1);

    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const x1 = Math.min(x0 + 1, width - 1);
    const y1 = Math.min(y0 + 1, height - 1);

    if (x0 < 0 || x0 >= width || y0 < 0 || y0 >= height) {
      return null;
    }

    const dx = fx - x0;
    const dy = fy - y0;

    const idx00 = y0 * width + x0;
    const idx10 = y0 * width + x1;
    const idx01 = y1 * width + x0;
    const idx11 = y1 * width + x1;

    const z00 = elevationData[idx00];
    const z10 = elevationData[idx10];
    const z01 = elevationData[idx01];
    const z11 = elevationData[idx11];

    const v00 = isValidValue(z00);
    const v10 = isValidValue(z10);
    const v01 = isValidValue(z01);
    const v11 = isValidValue(z11);

    // Full 4-neighbor bilinear interpolation
    if (v00 && v10 && v01 && v11) {
      return z00 * (1 - dx) * (1 - dy) +
             z10 * dx * (1 - dy) +
             z01 * (1 - dx) * dy +
             z11 * dx * dy;
    }

    // Edge case: partially valid neighbors (coastlines, lakes, or border boundaries)
    let weightSum = 0;
    let elevationSum = 0;

    if (v00) { const w = (1 - dx) * (1 - dy); elevationSum += z00 * w; weightSum += w; }
    if (v10) { const w = dx * (1 - dy); elevationSum += z10 * w; weightSum += w; }
    if (v01) { const w = (1 - dx) * dy; elevationSum += z01 * w; weightSum += w; }
    if (v11) { const w = dx * dy; elevationSum += z11 * w; weightSum += w; }

    if (weightSum > 0) {
      return elevationSum / weightSum;
    }

    return null;
  };
}
