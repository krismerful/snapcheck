import { forward, toPoint } from 'mgrs';

/**
 * Format raw MGRS string into spaced military grid format
 * e.g., '56KKV0709492417' -> '56K KV 07094 92417'
 */
export function formatMGRS(str) {
  if (!str) return '';
  const clean = str.replace(/\s+/g, '').toUpperCase();
  const match = clean.match(/^([0-9]{1,2}[C-HJ-NP-X])([A-HJ-NP-Z]{2})(\d+)$/);
  if (!match) return clean;
  const gzd = match[1];
  const sq = match[2];
  const digits = match[3];
  const half = Math.floor(digits.length / 2);
  const easting = digits.slice(0, half);
  const northing = digits.slice(half);
  return `${gzd} ${sq} ${easting} ${northing}`;
}

/**
 * Convert lat/lon to Decimal Degrees representations
 */
export function toDD(lat, lon, precision = 6) {
  if (lat === null || lat === undefined || lon === null || lon === undefined) {
    return { formatted: 'N/A', signed: 'N/A', lat: 0, lon: 0 };
  }
  const latH = lat >= 0 ? 'N' : 'S';
  const lonH = lon >= 0 ? 'E' : 'W';
  const aLat = Math.abs(lat).toFixed(precision);
  const aLon = Math.abs(lon).toFixed(precision);

  return {
    lat: Number(lat.toFixed(precision)),
    lon: Number(lon.toFixed(precision)),
    formatted: `${aLat}° ${latH}, ${aLon}° ${lonH}`,
    signed: `${lat.toFixed(precision)}, ${lon.toFixed(precision)}`
  };
}

/**
 * Convert lat/lon to Degrees Decimal Minutes (DDM)
 */
export function toDDM(lat, lon, precision = 3) {
  if (lat === null || lat === undefined || lon === null || lon === undefined) {
    return { formatted: 'N/A' };
  }

  function convert(val, isLat) {
    const hem = isLat ? (val >= 0 ? 'N' : 'S') : (val >= 0 ? 'E' : 'W');
    let abs = Math.abs(val);
    let deg = Math.floor(abs);
    let min = (abs - deg) * 60;
    const factor = Math.pow(10, precision);
    min = Math.round(min * factor) / factor;
    if (min >= 60) {
      min = 0;
      deg += 1;
    }
    const minStr = min.toFixed(precision);
    return {
      deg,
      min: minStr,
      hem,
      formatted: `${deg}° ${String(minStr).padStart(precision > 0 ? precision + 3 : 2, '0')}' ${hem}`
    };
  }

  const latRes = convert(lat, true);
  const lonRes = convert(lon, false);

  return {
    latParts: latRes,
    lonParts: lonRes,
    formatted: `${latRes.formatted}, ${lonRes.formatted}`
  };
}

/**
 * Convert lat/lon to Degrees Minutes Seconds (DMS)
 */
export function toDMS(lat, lon, precision = 1) {
  if (lat === null || lat === undefined || lon === null || lon === undefined) {
    return { formatted: 'N/A' };
  }

  function convert(val, isLat) {
    const hem = isLat ? (val >= 0 ? 'N' : 'S') : (val >= 0 ? 'E' : 'W');
    let abs = Math.abs(val);
    let deg = Math.floor(abs);
    let remMin = (abs - deg) * 60;
    let min = Math.floor(remMin);
    let sec = (remMin - min) * 60;

    const factor = Math.pow(10, precision);
    sec = Math.round(sec * factor) / factor;
    if (sec >= 60) {
      sec = 0;
      min += 1;
    }
    if (min >= 60) {
      min = 0;
      deg += 1;
    }

    const secStr = sec.toFixed(precision);
    return {
      deg,
      min,
      sec: secStr,
      hem,
      formatted: `${deg}° ${String(min).padStart(2, '0')}' ${String(secStr).padStart(precision > 0 ? precision + 3 : 2, '0')}" ${hem}`
    };
  }

  const latRes = convert(lat, true);
  const lonRes = convert(lon, false);

  return {
    latParts: latRes,
    lonParts: lonRes,
    formatted: `${latRes.formatted}, ${lonRes.formatted}`
  };
}

/**
 * Convert lat/lon to Military Grid Reference System (MGRS)
 */
export function toMGRS(lat, lon, accuracy = 5) {
  if (lat === null || lat === undefined || lon === null || lon === undefined) {
    return 'N/A';
  }
  // MGRS valid latitude range is 80°S to 84°N
  if (lat < -80 || lat > 84) {
    return 'Out of MGRS Bounds (Polar)';
  }

  try {
    const raw = forward([lon, lat], accuracy);
    return formatMGRS(raw);
  } catch (err) {
    console.warn('MGRS forward conversion error:', err);
    return 'MGRS Error';
  }
}

/**
 * Parse an individual coordinate component (latitude or longitude)
 */
function parseSingleComponent(cStr, isLatitude) {
  if (!cStr) return null;
  let s = cStr.trim();
  let sign = 1;
  const hemMatch = s.match(/[NSEW]/i);

  if (hemMatch) {
    const hem = hemMatch[0].toUpperCase();
    if (hem === 'S' || hem === 'W') sign = -1;
    if (isLatitude && (hem === 'E' || hem === 'W')) return null;
    if (!isLatitude && (hem === 'N' || hem === 'S')) return null;
    s = s.replace(/[NSEW]/gi, ' ').trim();
  } else {
    if (s.startsWith('-')) {
      sign = -1;
      s = s.substring(1).trim();
    } else if (s.startsWith('+')) {
      s = s.substring(1).trim();
    }
  }

  // Replace symbols with spaces: °, ', ", d, m, s, colons
  s = s.replace(/[\u00B0\u00BA\u02DA'"dms]/gi, ' ').replace(/:/g, ' ');
  const nums = s.trim().split(/[\s,]+/).filter(Boolean).map(Number);
  if (nums.length === 0 || nums.some(isNaN)) return null;

  let val = 0;
  let detected = 'DD';
  if (nums.length === 1) {
    val = nums[0];
    detected = 'DD';
  } else if (nums.length === 2) {
    val = nums[0] + nums[1] / 60;
    detected = 'DDM';
  } else if (nums.length >= 3) {
    val = nums[0] + nums[1] / 60 + nums[2] / 3600;
    detected = 'DMS';
  }

  val = val * sign;
  const max = isLatitude ? 90 : 180;
  if (val < -max || val > max) return null;
  return { val, detected };
}

/**
 * Convert DDM structured values to Decimal Degrees
 */
export function fromDDM(latDeg, latMin, latHem, lonDeg, lonMin, lonHem) {
  const lDeg = Math.abs(parseFloat(latDeg) || 0);
  const lMin = Math.abs(parseFloat(latMin) || 0);
  const lHem = String(latHem).toUpperCase();

  const oDeg = Math.abs(parseFloat(lonDeg) || 0);
  const oMin = Math.abs(parseFloat(lonMin) || 0);
  const oHem = String(lonHem).toUpperCase();

  let lat = lDeg + (lMin / 60);
  if (lHem === 'S') lat = -lat;

  let lon = oDeg + (oMin / 60);
  if (oHem === 'W') lon = -lon;

  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    return { valid: false, error: 'Calculated coordinates are out of bounds (-90..90, -180..180)' };
  }

  return getCoordinateDetails(lat, lon, 'DDM');
}

/**
 * Convert DMS structured values to Decimal Degrees
 */
export function fromDMS(latDeg, latMin, latSec, latHem, lonDeg, lonMin, lonSec, lonHem) {
  const lDeg = Math.abs(parseFloat(latDeg) || 0);
  const lMin = Math.abs(parseFloat(latMin) || 0);
  const lSec = Math.abs(parseFloat(latSec) || 0);
  const lHem = String(latHem).toUpperCase();

  const oDeg = Math.abs(parseFloat(lonDeg) || 0);
  const oMin = Math.abs(parseFloat(lonMin) || 0);
  const oSec = Math.abs(parseFloat(lonSec) || 0);
  const oHem = String(lonHem).toUpperCase();

  let lat = lDeg + (lMin / 60) + (lSec / 3600);
  if (lHem === 'S') lat = -lat;

  let lon = oDeg + (oMin / 60) + (oSec / 3600);
  if (oHem === 'W') lon = -lon;

  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    return { valid: false, error: 'Calculated coordinates are out of bounds (-90..90, -180..180)' };
  }

  return getCoordinateDetails(lat, lon, 'DMS');
}

/**
 * Helper to build full representations object for a valid lat/lon
 */
export function getCoordinateDetails(lat, lon, detectedFormat = 'DD') {
  return {
    valid: true,
    lat,
    lon,
    detectedFormat,
    representations: {
      dd: toDD(lat, lon).formatted,
      ddSigned: toDD(lat, lon).signed,
      ddm: toDDM(lat, lon).formatted,
      dms: toDMS(lat, lon).formatted,
      mgrs: toMGRS(lat, lon)
    },
    error: null
  };
}

/**
 * Smart Auto-Detecting Coordinate Parser
 * Parses single-line input in:
 * - MGRS: '56K KV 07094 92417', '56KKV0709492417', '56KKV07099241'
 * - DD: '-22.65, 150.15', '-22.65 150.15', '22.65 S, 150.15 E'
 * - DDM: '22° 39.00\' S, 150° 09.00\' E', '22 39.0 S 150 9.0 E'
 * - DMS: '22° 39\' 00" S, 150° 09\' 00" E', '22 39 00 S 150 09 00 E'
 */
export function parseCoordinateInput(input) {
  if (!input || (typeof input !== 'string' && typeof input !== 'object')) {
    return { valid: false, error: 'Please enter a coordinate or MGRS string.' };
  }

  // If object with lat and lon
  if (typeof input === 'object' && input.lat !== undefined && input.lon !== undefined) {
    const lat = Number(input.lat);
    const lon = Number(input.lon);
    if (!isNaN(lat) && !isNaN(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
      return getCoordinateDetails(lat, lon, 'DD');
    }
    return { valid: false, error: 'Invalid lat/lon values' };
  }

  const str = String(input).trim();
  if (!str) {
    return { valid: false, error: 'Coordinate string is empty' };
  }

  // 1. Try MGRS (with or without spaces)
  const mgrsClean = str.replace(/\s+/g, '').toUpperCase();
  // Valid MGRS: 1-2 digits GZD, 1 letter band (C-X except I, O), 2 letters 100k square (A-Z except I, O), even number of digits (2 to 10)
  const mgrsRegex = /^([0-9]{1,2}[C-HJ-NP-X])([A-HJ-NP-Z]{2})(\d{2,10})$/;
  if (mgrsRegex.test(mgrsClean)) {
    try {
      const match = mgrsClean.match(mgrsRegex);
      const digits = match[3];
      if (digits.length % 2 === 0) {
        const pt = toPoint(mgrsClean);
        const lon = pt[0];
        const lat = pt[1];
        if (lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
          return getCoordinateDetails(lat, lon, 'MGRS');
        }
      }
    } catch {
      // Not valid MGRS point, continue to other formats
    }
  }

  // 2. Try parsing as Lat/Lon pair
  let parts = null;

  // Split on punctuation: comma, semicolon, slash, pipe
  if (/[,;/|]/.test(str)) {
    const splitParts = str.split(/[,;/|]/).map(s => s.trim()).filter(Boolean);
    if (splitParts.length === 2) {
      parts = splitParts;
    }
  }

  // If not split by punctuation, check if separated by N/S/E/W hemisphere letters
  if (!parts) {
    const nsMatch = str.match(/([0-9.\s°'"dms:]+[NS])\s*([0-9.\s°'"dms:]+[EW])/i);
    if (nsMatch) {
      parts = [nsMatch[1], nsMatch[2]];
    } else {
      const snMatch = str.match(/([NS]\s*[0-9.\s°'"dms:]+)\s*([EW]\s*[0-9.\s°'"dms:]+)/i);
      if (snMatch) {
        parts = [snMatch[1], snMatch[2]];
      }
    }
  }

  // If still not split, try splitting space-separated tokens
  if (!parts) {
    const tokens = str.split(/\s+/).filter(Boolean);
    if (tokens.length === 2) {
      // e.g. -22.65 150.15
      parts = [tokens[0], tokens[1]];
    } else if (tokens.length === 4) {
      // e.g. 22 39.0 150 9.0
      parts = [tokens.slice(0, 2).join(' '), tokens.slice(2).join(' ')];
    } else if (tokens.length === 6) {
      // e.g. 22 39 00 150 9 00
      parts = [tokens.slice(0, 3).join(' '), tokens.slice(3).join(' ')];
    }
  }

  if (parts && parts.length === 2) {
    let pLat = parts[0];
    let pLon = parts[1];

    // Reorder if Longitude was provided before Latitude (detected via E/W and N/S markers)
    if (/[EW]/i.test(pLat) && /[NS]/i.test(pLon)) {
      pLat = parts[1];
      pLon = parts[0];
    }

    const latRes = parseSingleComponent(pLat, true);
    const lonRes = parseSingleComponent(pLon, false);

    if (latRes !== null && lonRes !== null) {
      const format = latRes.detected === lonRes.detected 
        ? latRes.detected 
        : (latRes.detected === 'DD' ? lonRes.detected : latRes.detected);

      return getCoordinateDetails(latRes.val, lonRes.val, format);
    }
  }

  return {
    valid: false,
    error: 'Unrecognized format. Please enter coordinates in DD (e.g. -22.65, 150.15), DDM, DMS, or MGRS (e.g. 56K KV 07094 92417).'
  };
}
