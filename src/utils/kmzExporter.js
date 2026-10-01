import JSZip from 'jszip';

/**
 * Utility to generate and download Google Earth KMZ files directly in the browser
 * using JSZip and HTML5 Canvas.
 */

// Converts hex color (#RRGGBB) to { r, g, b }
function hexToRgb(hex) {
  let cleanHex = hex.replace('#', '');
  if (cleanHex.length === 3) {
    cleanHex = cleanHex.split('').map(c => c + c).join('');
  }
  const num = parseInt(cleanHex, 16);
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255
  };
}

/**
 * Creates a PNG blob from grid values using an HTML5 Canvas.
 */
function createOverlayPngBlob(width, height, gridValues, colorHex, opacity = 0.7) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  const imgData = ctx.createImageData(width, height);
  const data = imgData.data;
  const { r, g, b } = hexToRgb(colorHex);
  const alphaVal = Math.round(opacity * 255);

  for (let i = 0; i < gridValues.length; i++) {
    if (gridValues[i] === 255) {
      const idx = i * 4;
      data[idx] = r;
      data[idx + 1] = g;
      data[idx + 2] = b;
      data[idx + 3] = alphaVal;
    }
  }

  ctx.putImageData(imgData, 0, 0);

  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), 'image/png');
  });
}

/**
 * Triggers a browser download for a Blob.
 */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/**
 * Exports complete multi-threat, multi-tier mission viewshed to a KMZ file.
 */
export async function exportMissionKmz({ threats, losResults, filename = 'mission_viewshed.kmz' }) {
  const zip = new JSZip();
  let kmlOverlays = '';
  let kmlPlacemarks = '';

  for (const res of losResults) {
    if (res.error) continue;

    // Find threat
    const threat = threats.find(t => t.id === res.threatId) || { name: res.threatName, lat: 0, lon: 0 };

    kmlPlacemarks += `
      <Placemark>
        <name>${escapeXml(threat.name)}</name>
        <description>Ground Elev: ${res.groundElevation ? res.groundElevation.toFixed(1) + 'm' : 'N/A'}, Eye Alt: ${res.eyeAltitude ? res.eyeAltitude.toFixed(1) + 'm' : 'N/A'}</description>
        <Point>
          <coordinates>${threat.lon},${threat.lat},${res.eyeAltitude || 0}</coordinates>
        </Point>
      </Placemark>`;

    for (const tier of res.tierResults) {
      if (!tier.gridValues || tier.gridValues.length === 0) continue;

      const pngFilename = `overlay_${res.threatId}_${tier.tierId}.png`;
      const pngBlob = await createOverlayPngBlob(
        tier.gridWidth,
        tier.gridHeight,
        tier.gridValues,
        tier.color || '#FFFF00',
        0.65
      );

      zip.file(pngFilename, pngBlob);

      kmlOverlays += `
      <GroundOverlay>
        <name>${escapeXml(threat.name)} - ${escapeXml(tier.tierName)}</name>
        <description>Altitude: ${tier.altitudeFt} ft AGL</description>
        <Icon>
          <href>${pngFilename}</href>
        </Icon>
        <LatLonBox>
          <north>${tier.bounds.north}</north>
          <south>${tier.bounds.south}</south>
          <east>${tier.bounds.east}</east>
          <west>${tier.bounds.west}</west>
        </LatLonBox>
      </GroundOverlay>`;
    }
  }

  const kmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>Mission Viewshed Analysis</name>
    <Folder>
      <name>Threat Placemarks</name>
      ${kmlPlacemarks}
    </Folder>
    <Folder>
      <name>Altitude Tier Overlays (Copernicus GLO-30)</name>
      ${kmlOverlays}
    </Folder>
  </Document>
</kml>`;

  zip.file('doc.kml', kmlContent);

  const kmzBlob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 }
  });

  downloadBlob(kmzBlob, filename);
}

/**
 * Exports an edited viewshed (GeoJSON with possible eraser cuts) to KMZ.
 */
export async function exportEditedGeoJsonKmz({ geojson, color = '#FFFF00', name = 'Edited_Viewshed', filename = 'viewshed_edited.kmz' }) {
  const zip = new JSZip();

  // Convert GeoJSON MultiPolygon coordinates to KML Polygons
  let kmlPolygons = '';

  const features = geojson.features || (geojson.type === 'Feature' ? [geojson] : []);

  for (let i = 0; i < features.length; i++) {
    const f = features[i];
    if (f.properties && f.properties.DN !== 255) continue;

    const geom = f.geometry;
    if (!geom) continue;

    if (geom.type === 'Polygon') {
      kmlPolygons += renderKmlPolygon(geom.coordinates, color);
    } else if (geom.type === 'MultiPolygon') {
      for (const polyCoords of geom.coordinates) {
        kmlPolygons += renderKmlPolygon(polyCoords, color);
      }
    }
  }

  const hex = color.replace('#', '');
  const r = hex.substring(0, 2);
  const g = hex.substring(2, 4);
  const b = hex.substring(4, 6);
  // KML color format: aabbggrr
  const kmlColor = `b0${b}${g}${r}`;

  const kmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${escapeXml(name)}</name>
    <Style id="viewshedStyle">
      <LineStyle>
        <width>0</width>
        <color>00000000</color>
      </LineStyle>
      <PolyStyle>
        <color>${kmlColor}</color>
        <fill>1</fill>
        <outline>0</outline>
      </PolyStyle>
    </Style>
    <Folder>
      <name>Visible Areas</name>
      ${kmlPolygons}
    </Folder>
  </Document>
</kml>`;

  zip.file('doc.kml', kmlContent);

  const kmzBlob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE'
  });

  downloadBlob(kmzBlob, filename);
}

function renderKmlPolygon(rings) {
  if (!rings || rings.length === 0) return '';
  const outerRing = rings[0];
  const innerRings = rings.slice(1);

  const outerCoordsStr = outerRing.map(pt => `${pt[0]},${pt[1]},0`).join(' ');

  let innerRingsKml = '';
  for (const inner of innerRings) {
    const innerCoordsStr = inner.map(pt => `${pt[0]},${pt[1]},0`).join(' ');
    innerRingsKml += `
        <innerBoundaryIs>
          <LinearRing>
            <coordinates>${innerCoordsStr}</coordinates>
          </LinearRing>
        </innerBoundaryIs>`;
  }

  return `
      <Placemark>
        <styleUrl>#viewshedStyle</styleUrl>
        <Polygon>
          <tessellate>1</tessellate>
          <outerBoundaryIs>
            <LinearRing>
              <coordinates>${outerCoordsStr}</coordinates>
            </LinearRing>
          </outerBoundaryIs>
          ${innerRingsKml}
        </Polygon>
      </Placemark>`;
}

function escapeXml(unsafe) {
  return String(unsafe).replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '\'': return '&apos;';
      case '"': return '&quot;';
    }
  });
}
