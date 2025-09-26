const express = require('express');
const path = require('path');
const fs = require('fs');
const shapefile = require('shapefile');

// Path to shapefile
const shpPath = path.join(__dirname, 'raw_data', 'shapefiles', 'mcws_crowns_newclass.shp');
const dbfPath = path.join(__dirname, 'raw_data', 'shapefiles', 'mcws_crowns_newclass.dbf');

async function main() {
  try {
    console.log('Reading shapefile...');
    // Load the shapefile
    const geojson = await shapefile.read(shpPath, dbfPath, { encoding: 'ISO-8859-1' });
    
    console.log(`Loaded ${geojson.features.length} features.`);
    
    // Group mapping analysis
    const groupToSpeciesMap = {};
    
    // Count trees per species and group
    const speciesCount = {};
    const groupCount = {};
    const speciesByGroup = {};
    
    // Process all features
    geojson.features.forEach(feature => {
      const props = feature.properties;
      
      const commonName = props.Cmmn_Nm || 'Unknown';
      const group = props.group_d || 'unknown';
      
      // Count by common name
      speciesCount[commonName] = (speciesCount[commonName] || 0) + 1;
      
      // Count by group
      groupCount[group] = (groupCount[group] || 0) + 1;
      
      // Track species within each group
      if (!speciesByGroup[group]) {
        speciesByGroup[group] = {};
      }
      speciesByGroup[group][commonName] = (speciesByGroup[group][commonName] || 0) + 1;
    });
    
    // Log species counts
    console.log('\nSpecies counts:');
    Object.entries(speciesCount)
      .sort((a, b) => b[1] - a[1]) // Sort by count descending
      .forEach(([species, count]) => {
        console.log(`  ${species}: ${count}`);
      });
    
    // Log group counts
    console.log('\nGroup counts:');
    Object.entries(groupCount)
      .sort(([a], [b]) => a - b) // Sort by group number
      .forEach(([group, count]) => {
        console.log(`  Group ${group}: ${count} trees`);
      });
    
    // Analyze which species dominate each group
    console.log('\nDominant species by group:');
    Object.entries(speciesByGroup).forEach(([group, species]) => {
      console.log(`\nGroup ${group}:`);
      
      // Sort species by count within this group
      const sortedSpecies = Object.entries(species).sort((a, b) => b[1] - a[1]);
      
      sortedSpecies.forEach(([name, count]) => {
        const percentage = ((count / groupCount[group]) * 100).toFixed(1);
        console.log(`  ${name}: ${count} (${percentage}%)`);
      });
      
      // Suggest the dominant species for this group
      if (sortedSpecies.length > 0) {
        const [dominantSpecies, dominantCount] = sortedSpecies[0];
        const dominantPercentage = ((dominantCount / groupCount[group]) * 100).toFixed(1);
        
        if (dominantPercentage > 50) {
          groupToSpeciesMap[group] = dominantSpecies;
        } else {
          // If no clear dominant species, use the top 2 with "mixed"
          if (sortedSpecies.length > 1) {
            const top2 = sortedSpecies.slice(0, 2).map(s => s[0]).join('/');
            groupToSpeciesMap[group] = top2;
          } else {
            groupToSpeciesMap[group] = dominantSpecies;
          }
        }
      }
    });
    
    // Generate the updated mapping
    console.log('\nSuggested mapping for prediction_results.csv:');
    console.log('const groupToSpecies = {');
    Object.entries(groupToSpeciesMap)
      .sort(([a], [b]) => a - b) // Sort by group number
      .forEach(([group, species]) => {
        console.log(`  '${group}.0': '${species}',`);
      });
    console.log('};');
    
  } catch (error) {
    console.error('Error reading shapefile:', error);
  }
}

main();