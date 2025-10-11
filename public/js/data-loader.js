const SHAPEFILE_SOURCES = [
  {
    id: 'primary',
    shp: '/raw_data/shapefiles/mcws_crowns_newclass.shp',
    dbf: '/raw_data/shapefiles/mcws_crowns_newclass.dbf',
    prj: '/raw_data/shapefiles/mcws_crowns_newclass.prj',
  },
  {
    id: 'fallback',
    shp: '/raw_data/crown_shp/mcws_crowns.shp',
    dbf: '/raw_data/crown_shp/mcws_crowns.dbf',
    prj: '/raw_data/crown_shp/mcws_crowns.prj',
  },
];

function ensureProjDefinitions() {
  if (typeof proj4 === 'undefined') {
    throw new Error('proj4 library is required before loading shapefiles.');
  }

  if (!proj4.defs('EPSG:3123')) {
    proj4.defs(
      'EPSG:3123',
      '+proj=tmerc +lat_0=0 +lon_0=121 +k=0.99995 +x_0=500000 +y_0=0 +ellps=clrk66 +towgs84=-127.62,-67.24,-47.04,-3.068,4.903,1.578,-1.06 +units=m +no_defs',
    );
  }

  if (!proj4.defs('EPSG:4326')) {
    proj4.defs('EPSG:4326', '+proj=longlat +datum=WGS84 +no_defs');
  }
}

function transformCoordinates(coordinates, type) {
  switch (type) {
    case 'Point':
      return proj4('EPSG:3123', 'EPSG:4326', coordinates);
    case 'LineString':
    case 'MultiPoint':
      return coordinates.map((point) => proj4('EPSG:3123', 'EPSG:4326', point));
    case 'Polygon':
    case 'MultiLineString':
      return coordinates.map((ring) => ring.map((point) => proj4('EPSG:3123', 'EPSG:4326', point)));
    case 'MultiPolygon':
      return coordinates.map((polygon) =>
        polygon.map((ring) => ring.map((point) => proj4('EPSG:3123', 'EPSG:4326', point))),
      );
    default:
      return coordinates;
  }
}

async function probeShapefile(shpUrl) {
  const response = await fetch(shpUrl, { method: 'HEAD' });
  if (!response.ok) {
    throw new Error(`Shapefile not reachable at ${shpUrl} (status ${response.status})`);
  }
}

async function readProjectionFile(prjUrl) {
  try {
    const response = await fetch(prjUrl);
    if (!response.ok) {
      return null;
    }

    return response.text();
  } catch (error) {
    console.warn('[data-loader] Unable to read PRJ file:', error);
    return null;
  }
}

function analyseGeometryTypes(features) {
  return features.reduce((acc, feature) => {
    const type = feature?.geometry?.type || 'Unknown';
    acc[type] = (acc[type] || 0) + 1;
    return acc;
  }, {});
}

export async function loadTreeCrownGeoJSON() {
  if (typeof shapefile === 'undefined') {
    throw new Error('Shapefile.js is required before loading shapefiles.');
  }

  ensureProjDefinitions();

  let selectedSource = null;
  let lastError = null;

  for (const source of SHAPEFILE_SOURCES) {
    try {
      await probeShapefile(source.shp);
      selectedSource = source;
      break;
    } catch (error) {
      lastError = error;
      console.warn(`[data-loader] ${source.id} shapefile unavailable:`, error.message);
    }
  }

  if (!selectedSource) {
    throw new Error(lastError?.message || 'Unable to locate a tree-crown shapefile.');
  }

  const options = { encoding: 'ISO-8859-1' };
  const geojson = await shapefile.read(selectedSource.shp, selectedSource.dbf, options);

  if (!geojson || !Array.isArray(geojson.features) || geojson.features.length === 0) {
    throw new Error('Shapefile loaded but contains no features.');
  }

  const transformedFeatures = geojson.features.map((feature) => {
    if (!(feature?.geometry?.type) || !feature.geometry.coordinates) {
      return feature;
    }

    return {
      ...feature,
      geometry: {
        ...feature.geometry,
        coordinates: transformCoordinates(feature.geometry.coordinates, feature.geometry.type),
      },
    };
  });

  const prjText = await readProjectionFile(selectedSource.prj);

  return {
    geojson: { ...geojson, features: transformedFeatures },
    metadata: {
      sourceId: selectedSource.id,
      sourcePaths: selectedSource,
      geometryTypes: analyseGeometryTypes(transformedFeatures),
      prjText,
    },
  };
}

export function summariseTreeDataset(features) {
  if (!Array.isArray(features)) {
    return { speciesCounts: {}, totalArea: 0 };
  }

  const speciesCounts = {};
  let totalArea = 0;

  features.forEach((feature) => {
    const props = feature?.properties || {};
    const species =
      props.Cmmn_Nm ||
      props.cmmn_nm ||
      props.species ||
      props.SPECIES ||
      props.Species ||
      props.ground_truth_species ||
      'Unknown';

    speciesCounts[species] = (speciesCounts[species] || 0) + 1;

    if (feature.geometry?.type?.includes('Polygon')) {
      try {
        const layer = L.geoJSON(feature);
        const area = L.GeometryUtil.geodesicArea(layer.getLayers()[0].getLatLngs()[0]);
        totalArea += area;
      } catch (error) {
        console.warn('[data-loader] Area calculation skipped:', error);
      }
    }
  });

  return { speciesCounts, totalArea };
}
