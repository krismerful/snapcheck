import { contours } from 'd3-contour';

/**
 * Web Worker for Line-of-Sight (LOS) Raymarching and Viewshed computation.
 * Receives the transferable GeoTIFF ArrayBuffer and runs raymarching profiles
 * off the main UI thread.
 */

let demState = {
  elevationData: null,
  width: 0,
  height: 0,
  bbox: null, // [minX, minY, maxX, maxY]
  noData: null,
  sampler: null
};

// Earth radius with standard 4/3 atmospheric refraction
// Curvature coefficient dfCurvCoeff = 0.85714 -> Drop = d^2 / (2 * R_eff)
const EARTH_CURV_FACTOR = 5.886e-8; // meters^-1

/**
 * Bilinear elevation sampler
 */
function createElevationSampler({ elevationData, width, height, bbox, noData }) {
  const [minX, minY, maxX, maxY] = bbox;
  const spanX = maxX - minX;
  const spanY = maxY - minY;
  const noDataVal = (noData !== undefined && noData !== null) ? Number(noData) : -9999;

  const isValidValue = (z) => {
    return z !== undefined &&
           !isNaN(z) &&
           z !== noDataVal &&
           z > -9000 &&
           z < 15000;
  };

  return function getElevationAt(lat, lon) {
    if (lon < minX || lon > maxX || lat < minY || lat > maxY) {
      return null;
    }

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

    if (v00 && v10 && v01 && v11) {
      return z00 * (1 - dx) * (1 - dy) +
             z10 * dx * (1 - dy) +
             z01 * (1 - dx) * dy +
             z11 * dx * dy;
    }

    // Border fallback
    let weightSum = 0;
    let elevSum = 0;
    if (v00) { const w = (1 - dx) * (1 - dy); elevSum += z00 * w; weightSum += w; }
    if (v10) { const w = dx * (1 - dy); elevSum += z10 * w; weightSum += w; }
    if (v01) { const w = (1 - dx) * dy; elevSum += z01 * w; weightSum += w; }
    if (v11) { const w = dx * dy; elevSum += z11 * w; weightSum += w; }

    return weightSum > 0 ? elevSum / weightSum : null;
  };
}

/**
 * Transforms pixel coordinates from d3-contour to [lon, lat] WGS84 coordinates.
 */
function transformContourCoords(coords, minLon, maxLon, minLat, maxLat, W, H) {
  if (!Array.isArray(coords)) return coords;
  if (typeof coords[0] === 'number') {
    const px = coords[0];
    const py = coords[1];
    const lon = minLon + (px / W) * (maxLon - minLon);
    const lat = maxLat - (py / H) * (maxLat - minLat);
    return [lon, lat];
  }
  return coords.map(c => transformContourCoords(c, minLon, maxLon, minLat, maxLat, W, H));
}

/**
 * Calculates Viewshed for a single threat across multiple altitude tiers.
 */
function calculateViewshedForThreat(threat, altitudeTiers, sampler) {
  const { id, name, lat, lon, obsHeight, range } = threat;

  // 1. Get ground elevation under observer
  const groundElevation = sampler(lat, lon);
  if (groundElevation === null) {
    return {
      threatId: id,
      threatName: name,
      error: `Threat location (${lat.toFixed(4)}, ${lon.toFixed(4)}) is outside DEM coverage.`
    };
  }

  const eyeAltitude = groundElevation + obsHeight;

  // 2. Set up local grid for raymarching
  const latDegPerMeter = 1 / 111132;
  const lonDegPerMeter = 1 / (111132 * Math.cos((lat * Math.PI) / 180));

  const deltaLat = range * latDegPerMeter;
  const deltaLon = range * lonDegPerMeter;

  const minLat = lat - deltaLat;
  const maxLat = lat + deltaLat;
  const minLon = lon - deltaLon;
  const maxLon = lon + deltaLon;

  // Adaptive grid resolution (matching ~20-30m per cell)
  const gridSize = Math.max(120, Math.min(360, Math.round((2 * range) / 30)));
  const W = gridSize;
  const H = gridSize;

  const cx = (W - 1) / 2;
  const cy = (H - 1) / 2;
  const rPix = W / 2;

  const cellResX = (maxLon - minLon) / W;
  const cellResY = (maxLat - minLat) / H;

  // Grids for each altitude tier
  const numTiers = altitudeTiers.length;
  const tierGrids = altitudeTiers.map(() => new Float64Array(W * H));

  // Raymarching to perimeter pixels
  const perimeterPoints = [];
  for (let x = 0; x < W; x++) {
    perimeterPoints.push([x, 0]);
    perimeterPoints.push([x, H - 1]);
  }
  for (let y = 1; y < H - 1; y++) {
    perimeterPoints.push([0, y]);
    perimeterPoints.push([W - 1, y]);
  }

  for (let i = 0; i < perimeterPoints.length; i++) {
    const [px, py] = perimeterPoints[i];
    const dx = px - cx;
    const dy = py - cy;
    const distPix = Math.hypot(dx, dy);
    if (distPix === 0) continue;

    const numSteps = Math.ceil(distPix / 0.65);
    let maxSlope = -Infinity;

    for (let s = 1; s <= numSteps; s++) {
      const t = s / numSteps;
      const gx = Math.round(cx + dx * t);
      const gy = Math.round(cy + dy * t);

      if (gx < 0 || gx >= W || gy < 0 || gy >= H) break;

      const pDist = Math.hypot(gx - cx, gy - cy);
      if (pDist > rPix) continue;

      const distM = (pDist / rPix) * range;
      if (distM < 3) continue; // Skip ground pixel directly beneath observer

      const cellLon = minLon + (gx + 0.5) * cellResX;
      const cellLat = maxLat - (gy + 0.5) * cellResY;

      const z = sampler(cellLat, cellLon);
      if (z === null) continue;

      const drop = distM * distM * EARTH_CURV_FACTOR;

      // Evaluate visibility for each altitude tier
      for (let m = 0; m < numTiers; m++) {
        const tier = altitudeTiers[m];
        const tgtAltitudeM = tier.altitudeM ?? (tier.altitudeFt * 0.3048);
        const slopeToTarget = (z + tgtAltitudeM - drop - eyeAltitude) / distM;

        if (slopeToTarget >= maxSlope) {
          tierGrids[m][gy * W + gx] = 255;
        }
      }

      // Update terrain occlusion slope
      const slopeTerrain = (z - drop - eyeAltitude) / distM;
      if (slopeTerrain > maxSlope) {
        maxSlope = slopeTerrain;
      }
    }
  }

  // 3. Generate GeoJSON contours and raster data for each altitude tier
  const tierResults = [];
  const contourGen = contours().size([W, H]).thresholds([128]);

  for (let m = 0; m < numTiers; m++) {
    const tier = altitudeTiers[m];
    const rawContours = contourGen(tierGrids[m]);
    const features = [];

    for (const contour of rawContours) {
      if (!contour.coordinates || contour.coordinates.length === 0) continue;

      const transformedCoords = transformContourCoords(
        contour.coordinates,
        minLon,
        maxLon,
        minLat,
        maxLat,
        W,
        H
      );

      features.push({
        type: 'Feature',
        properties: {
          DN: 255,
          tierId: tier.id,
          tierName: tier.name,
          altitudeFt: tier.altitudeFt,
          altitudeM: tier.altitudeM ?? (tier.altitudeFt * 0.3048),
          color: tier.color,
          threatId: id,
          threatName: name
        },
        geometry: {
          type: contour.type,
          coordinates: transformedCoords
        }
      });
    }

    const geojson = {
      type: 'FeatureCollection',
      features
    };

    tierResults.push({
      tierId: tier.id,
      tierName: tier.name,
      altitudeFt: tier.altitudeFt,
      color: tier.color,
      geojson,
      gridWidth: W,
      gridHeight: H,
      gridValues: Array.from(tierGrids[m]), // For PNG/KMZ overlay generation
      bounds: { north: maxLat, south: minLat, east: maxLon, west: minLon }
    });
  }

  return {
    threatId: id,
    threatName: name,
    groundElevation,
    eyeAltitude,
    bounds: { north: maxLat, south: minLat, east: maxLon, west: minLon },
    tierResults
  };
}

// Worker message router
self.onmessage = function (event) {
  const { type, data } = event.data;

  try {
    switch (type) {
      case 'LOAD_DEM': {
        const { buffer, width, height, bbox, noData } = data;
        const elevationData = new Float32Array(buffer);
        const sampler = createElevationSampler({ elevationData, width, height, bbox, noData });

        demState = {
          elevationData,
          width,
          height,
          bbox,
          noData,
          sampler
        };

        self.postMessage({
          type: 'DEM_LOADED',
          data: {
            width,
            height,
            bbox
          }
        });
        break;
      }

      case 'GET_ELEVATION': {
        const { id, lat, lon } = data;
        if (!demState.sampler) {
          self.postMessage({ type: 'ELEVATION_RESULT', data: { id, lat, lon, elevation: null, error: 'DEM not loaded' } });
          return;
        }
        const elevation = demState.sampler(lat, lon);
        self.postMessage({ type: 'ELEVATION_RESULT', data: { id, lat, lon, elevation } });
        break;
      }

      case 'RUN_LOS_ANALYSIS': {
        if (!demState.sampler) {
          self.postMessage({
            type: 'LOS_ERROR',
            error: 'No DEM data is loaded in the worker.'
          });
          return;
        }

        const { threats, altitudeTiers } = data;
        const enabledThreats = (threats || []).filter(t => t.enabled !== false);

        if (enabledThreats.length === 0) {
          self.postMessage({
            type: 'LOS_ERROR',
            error: 'No active threats to analyze.'
          });
          return;
        }

        const results = [];
        for (let i = 0; i < enabledThreats.length; i++) {
          const threat = enabledThreats[i];
          self.postMessage({
            type: 'LOS_PROGRESS',
            data: {
              current: i + 1,
              total: enabledThreats.length,
              threatName: threat.name,
              percent: Math.round(((i) / enabledThreats.length) * 100)
            }
          });

          const viewshed = calculateViewshedForThreat(threat, altitudeTiers, demState.sampler);
          results.push(viewshed);
        }

        self.postMessage({
          type: 'LOS_ANALYSIS_COMPLETE',
          data: {
            results
          }
        });
        break;
      }

      default:
        console.warn('Unknown message type received by LOS worker:', type);
    }
  } catch (error) {
    self.postMessage({
      type: 'LOS_ERROR',
      error: error.message || String(error)
    });
  }
};
