import React, { useEffect } from 'react';
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  useMapEvents,
  useMap,
  GeoJSON,
  LayersControl,
  Circle,
  Rectangle,
  Tooltip
} from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { toMGRS, toDD, toDDM, toDMS } from '../utils/coordinates';

// Fix Leaflet's default marker icons in Vite/bundlers
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png'
});

const { BaseLayer } = LayersControl;

// Default center coordinates: Shoalwater Bay Training Area (SWBTA, Australia)
const SWBTA_CENTER = [-22.7397, 150.13];
const SWBTA_DEFAULT_ZOOM = 10;

// Custom colored tactical radar/threat marker icon (clean, non-pulsing)
function createThreatIcon(color = '#ff3333', name = '') {
  return L.divIcon({
    className: 'custom-threat-icon-wrapper',
    html: `
      <div class="tactical-marker-pin" style="--marker-color: ${color}">
        <div class="marker-core"></div>
        <div class="marker-label">${escapeHtml(name)}</div>
      </div>
    `,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
    popupAnchor: [0, -14]
  });
}

function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Controller component to zoom and center when DEM bounds change or threat focused
function MapController({ demBbox, triggerFitBounds, focusTarget }) {
  const map = useMap();

  useEffect(() => {
    if (demBbox && demBbox.length === 4) {
      const [minX, minY, maxX, maxY] = demBbox;
      map.fitBounds(
        [
          [minY, minX],
          [maxY, maxX]
        ],
        { padding: [36, 36], maxZoom: 13, animate: true }
      );
    }
  }, [demBbox, triggerFitBounds, map]);

  useEffect(() => {
    if (focusTarget && focusTarget.lat !== undefined && focusTarget.lon !== undefined) {
      map.flyTo([focusTarget.lat, focusTarget.lon], Math.max(map.getZoom(), 12), {
        duration: 1.2
      });
    }
  }, [focusTarget, map]);

  return null;
}

const MapComponent = ({
  onMapClick,
  viewshedData = [],
  threats = [],
  onDeleteThreat,
  onUpdateThreatName,
  demBbox = null,
  triggerFitBounds = 0,
  focusTarget = null,
  visibleTiers = { '50ft': true, '200ft': true, '500ft': true, 'custom': true },
  showRangeRings = true
}) => {
  const MapEvents = () => {
    const map = useMap();

    useEffect(() => {
      map.dragging.enable();
    }, [map]);

    useMapEvents({
      click(e) {
        onMapClick(e.latlng);
      }
    });
    return null;
  };

  // Convert GeoTIFF bbox [minX, minY, maxX, maxY] to Leaflet rectangle [[minY, minX], [maxY, maxX]]
  const demBounds = demBbox && demBbox.length === 4
    ? [
        [demBbox[1], demBbox[0]],
        [demBbox[3], demBbox[2]]
      ]
    : null;

  return (
    <div className="map-container-inner" style={{ height: '100%', width: '100%', position: 'relative' }}>
      <MapContainer
        center={demBounds ? [(demBounds[0][0] + demBounds[1][0]) / 2, (demBounds[0][1] + demBounds[1][1]) / 2] : SWBTA_CENTER}
        zoom={SWBTA_DEFAULT_ZOOM}
        style={{ height: '100%', width: '100%' }}
      >
        <MapController demBbox={demBbox} triggerFitBounds={triggerFitBounds} focusTarget={focusTarget} />

        <LayersControl position="topright">
          <BaseLayer checked name="Satellite Imagery (Esri)">
            <TileLayer
              url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
              attribution="Tiles &copy; Esri &mdash; Esri, USGS, Maxar"
            />
          </BaseLayer>

          <BaseLayer name="Dark Tactical (CartoDB)">
            <TileLayer
              url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
              attribution="&copy; CartoDB"
            />
          </BaseLayer>

          <BaseLayer name="OpenStreetMap">
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution="&copy; OpenStreetMap contributors"
            />
          </BaseLayer>
        </LayersControl>

        <MapEvents />

        {/* DEM Coverage Boundary Box */}
        {demBounds && (
          <Rectangle
            bounds={demBounds}
            pathOptions={{
              color: '#38bdf8',
              weight: 1.5,
              dashArray: '5, 5',
              fillColor: '#38bdf8',
              fillOpacity: 0.03
            }}
          >
            <Tooltip permanent={false} direction="top" className="tactical-tooltip">
              <strong>Copernicus GLO-30 DEM Extent</strong>
              <br />
              Lat: {demBounds[0][0].toFixed(3)}&deg; &rarr; {demBounds[1][0].toFixed(3)}&deg;
              <br />
              Lon: {demBounds[0][1].toFixed(3)}&deg; &rarr; {demBounds[1][1].toFixed(3)}&deg;
            </Tooltip>
          </Rectangle>
        )}

        {/* Range Rings around Threats */}
        {showRangeRings && threats.filter(t => t.enabled !== false).map(t => (
          <Circle
            key={`range-${t.id}`}
            center={[t.lat, t.lon]}
            radius={t.range || 5000}
            pathOptions={{
              color: t.color || '#ff3333',
              weight: 1.2,
              dashArray: '3, 4',
              fillColor: t.color || '#ff3333',
              fillOpacity: 0.02
            }}
            interactive={false}
          />
        ))}

        {/* Threat Markers */}
        {threats.map((threat) => (
          <Marker
            key={threat.id}
            position={[threat.lat, threat.lon]}
            icon={createThreatIcon(threat.color || '#ff3333', threat.name)}
          >
            <Popup className="tactical-leaflet-popup">
              <div className="popup-card">
                <div className="popup-header-row">
                  <div className="popup-color-pill" style={{ backgroundColor: threat.color || '#ff3333' }}></div>
                  <input
                    type="text"
                    className="popup-name-input"
                    value={threat.name}
                    onChange={(e) => onUpdateThreatName && onUpdateThreatName(threat.id, e.target.value)}
                    placeholder="Threat Name..."
                    title="Rename threat"
                  />
                </div>

                <div className="popup-stats-grid">
                  <div className="popup-stat-cell highlight-cell">
                    <span className="stat-label">MGRS GRID</span>
                    <span className="stat-value text-cyan font-mono">{toMGRS(threat.lat, threat.lon)}</span>
                  </div>
                  <div className="popup-stat-cell">
                    <span className="stat-label">DECIMAL DEGREES (DD)</span>
                    <span className="stat-value font-mono">{toDD(threat.lat, threat.lon).formatted}</span>
                  </div>
                  <div className="popup-stat-cell">
                    <span className="stat-label">DEG DECIMAL MIN (DDM)</span>
                    <span className="stat-value font-mono">{toDDM(threat.lat, threat.lon).formatted}</span>
                  </div>
                  <div className="popup-stat-cell">
                    <span className="stat-label">DEG MIN SEC (DMS)</span>
                    <span className="stat-value font-mono">{toDMS(threat.lat, threat.lon).formatted}</span>
                  </div>
                  <div className="popup-stat-cell">
                    <span className="stat-label">OBSERVER HEIGHT</span>
                    <span className="stat-value">{threat.obsHeight} m ({Math.round(threat.obsHeight / 0.3048)} ft)</span>
                  </div>
                  <div className="popup-stat-cell">
                    <span className="stat-label">RADAR RANGE</span>
                    <span className="stat-value">{(threat.range / 1000).toFixed(1)} km ({threat.range} m)</span>
                  </div>
                  {threat.groundElev !== undefined && threat.groundElev !== null && (
                    <div className="popup-stat-cell highlight-cell">
                      <span className="stat-label">TERRAIN ELEVATION</span>
                      <span className="stat-value text-cyan">{threat.groundElev.toFixed(1)} m AMSL</span>
                    </div>
                  )}
                </div>

                {onDeleteThreat && (
                  <button
                    className="popup-delete-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteThreat(threat.id);
                    }}
                  >
                    Delete Threat
                  </button>
                )}
              </div>
            </Popup>
          </Marker>
        ))}

        {/* Viewshed Layers (altitude tiers) */}
        {viewshedData.map((layer) => {
          if (layer.tierId && visibleTiers[layer.tierId] === false) {
            return null;
          }

          if (!layer.geojson || !layer.geojson.features || layer.geojson.features.length === 0) {
            return null;
          }

          return (
            <GeoJSON
              key={layer.key || `${layer.id}-${layer.tierId || 'tier'}-${layer.geojson.features.length}`}
              data={layer.geojson}
              interactive={true}
              style={(feature) => {
                if (feature.properties && feature.properties.DN === 255) {
                  const featureColor = feature.properties.color || layer.color || '#FFFF00';
                  let fillOpacity = 0.45;
                  if (feature.properties.tierId === '50ft') fillOpacity = 0.58;
                  else if (feature.properties.tierId === '200ft') fillOpacity = 0.44;
                  else if (feature.properties.tierId === '500ft') fillOpacity = 0.34;

                  return {
                    color: featureColor,
                    weight: 0.5,
                    fillColor: featureColor,
                    fillOpacity: fillOpacity
                  };
                }
                return { stroke: false, fill: false };
              }}
            />
          );
        })}
      </MapContainer>
    </div>
  );
};

export default MapComponent;
