export async function loadPredictionData(url = '/raw_data/prediction_results_top5.csv', treeDataMap = null) {
    try {
        const response = await fetch(url);
        const csv = await response.text();

        const lines = csv.split('\n');
        
        // Create a mapping of tree_id to species name from the shapefile data
        const treeIdToSpecies = {};
        // Create a mapping of group to species names (to find the most common species per group)
        const groupToSpeciesMap = {};
        
        if (treeDataMap && Array.isArray(treeDataMap)) {
            treeDataMap.forEach(tree => {
                const treeId = tree.properties?.tree_id?.toString();
                const species = tree.properties?.Cmmn_Nm || tree.properties?.cmmn_nm || null;
                if (treeId && species) {
                    treeIdToSpecies[treeId] = species;
                }
            });
            console.log(`Created species mapping for ${Object.keys(treeIdToSpecies).length} trees`);
        }

        const allTreeData = [];
        
        // First pass: collect all species per group to determine the most representative species
        const groupSpeciesCounts = {};

        for (let i = 1; i < lines.length; i++) {
            if (!lines[i].trim()) continue;

            const values = lines[i].split(',');
            let treeId = values[0].trim();
            if (treeId.endsWith('.0')) {
                treeId = treeId.substring(0, treeId.length - 2);
            }

            const actualGroup = values[1].trim();
            const cleanActualGroup = actualGroup.replace('.0', '');
            const actualSpecies = treeIdToSpecies[treeId];
            
            // Count species per group
            if (actualSpecies && cleanActualGroup) {
                if (!groupSpeciesCounts[cleanActualGroup]) {
                    groupSpeciesCounts[cleanActualGroup] = {};
                }
                groupSpeciesCounts[cleanActualGroup][actualSpecies] = 
                    (groupSpeciesCounts[cleanActualGroup][actualSpecies] || 0) + 1;
            }
        }
        
        // Determine the most common species for each group
        for (const group in groupSpeciesCounts) {
            const speciesCounts = groupSpeciesCounts[group];
            let maxCount = 0;
            let mostCommonSpecies = null;
            
            for (const species in speciesCounts) {
                if (speciesCounts[species] > maxCount) {
                    maxCount = speciesCounts[species];
                    mostCommonSpecies = species;
                }
            }
            
            if (mostCommonSpecies) {
                groupToSpeciesMap[group] = mostCommonSpecies;
            }
        }
        
        console.log('Group to Species mapping:', groupToSpeciesMap);

        // Second pass: create the prediction data with proper species names
        for (let i = 1; i < lines.length; i++) {
            if (!lines[i].trim()) continue;

            const values = lines[i].split(',');

            let treeId = values[0].trim();
            if (treeId.endsWith('.0')) {
                treeId = treeId.substring(0, treeId.length - 2);
            }

            const actualGroup = values[1].trim();
            const splitType = values[2].trim();
            // Remove .0 suffix if present for cleaner display
            const cleanActualGroup = actualGroup.replace('.0', '');
            
            // Get the actual species name from the shapefile data
            const actualSpecies = treeIdToSpecies[treeId] || `Group ${cleanActualGroup}`;

            if (splitType === 'test' && values[3] && values[3].trim() !== '') {
                const predictedGroup = values[3].trim();
                const cleanPredictedGroup = predictedGroup.replace('.0', '');
                const isCorrect = values[4] && values[4].trim() === '1.0';
                
                // Get the predicted species name from the group mapping
                const predictedSpecies = groupToSpeciesMap[cleanPredictedGroup] || `Group ${cleanPredictedGroup}`;

                allTreeData.push({
                    treeId,
                    actualGroup: cleanActualGroup,
                    predictedGroup: cleanPredictedGroup,
                    actual: actualSpecies,
                    predicted: predictedSpecies,
                    correct: isCorrect,
                    isTraining: false,
                    dataType: 'test',
                });
            } else if (splitType === 'train') {
                allTreeData.push({
                    treeId,
                    actualGroup: cleanActualGroup,
                    actual: actualSpecies,
                    isTraining: true,
                    dataType: 'train',
                });
            }
        }

        const testTrees = allTreeData.filter((tree) => tree.dataType === 'test');
        const trainingTrees = allTreeData.filter((tree) => tree.dataType === 'train');

        console.log(`Loaded ${testTrees.length} test trees and ${trainingTrees.length} training trees`);

        if (testTrees.length > 0) {
            console.log('Example predictions (species to species):');
            for (let i = 0; i < Math.min(5, testTrees.length); i++) {
                const tree = testTrees[i];
                console.log(`Tree ${tree.treeId}: ${tree.actual} → ${tree.predicted} (${tree.correct ? '✓ Correct' : '✗ Incorrect'})`);
            }
        }

        return allTreeData;
    } catch (error) {
        console.error('Error loading prediction data:', error);
        return [];
    }
}
