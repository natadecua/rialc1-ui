const shapefile = require('shapefile');

(async () => {
  try {
    const geojson = await shapefile.read(
      'raw_data/shapefiles/mcws_crowns_newclass.shp',
      'raw_data/shapefiles/mcws_crowns_newclass.dbf'
    );

    const count = geojson.features.length;
    const first = geojson.features[0];
    const keys = Object.keys(first.properties);
    const groupDValues = new Set();
    const groupIdValues = new Set();

    for (const feature of geojson.features) {
      if (feature.properties.group_d !== undefined && feature.properties.group_d !== null) {
        groupDValues.add(feature.properties.group_d);
      }
      if (feature.properties.group_id !== undefined && feature.properties.group_id !== null) {
        groupIdValues.add(feature.properties.group_id);
      }
    }

    console.log('Feature count:', count);
    console.log('Property keys:', keys);
    console.log('group_d values:', Array.from(groupDValues).sort());
    console.log('group_id values:', Array.from(groupIdValues).sort());

    const sample = geojson.features.slice(0, 5).map(f => ({
      tree_id: f.properties.tree_id,
      group_d: f.properties.group_d,
      group_id: f.properties.group_id,
      common: f.properties.Cmmn_Nm,
    }));
    console.log('Sample:', sample);
  } catch (error) {
    console.error('Error reading shapefile:', error);
  }
})();
