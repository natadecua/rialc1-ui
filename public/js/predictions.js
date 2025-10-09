export async function loadPredictionData(url = '/raw_data/prediction_results.csv') {
    try {
        const response = await fetch(url);
        const csv = await response.text();

        const lines = csv.split('\n');
        const groupToSpecies = {
            '1.0': 'Rosids',
            '2.0': 'Basals',
            '3.0': 'Asterids',
            '4.0': 'Monocots',
            '5.0': 'Others',
        };

        console.log('Using species mapping:', groupToSpecies);

        const allTreeData = [];

        for (let i = 1; i < lines.length; i++) {
            if (!lines[i].trim()) continue;

            const values = lines[i].split(',');

            let treeId = values[0].trim();
            if (treeId.endsWith('.0')) {
                treeId = treeId.substring(0, treeId.length - 2);
            }

            const actualGroup = values[1].trim();
            const splitType = values[2].trim();
            const actualSpecies = groupToSpecies[actualGroup] || `Group ${actualGroup}`;

            if (splitType === 'test' && values[3] && values[3].trim() !== '') {
                const predictedGroup = values[3].trim();
                const isCorrect = values[4] && values[4].trim() === '1.0';

                allTreeData.push({
                    treeId,
                    actualGroup,
                    predictedGroup,
                    actual: `${actualSpecies} (Group ${actualGroup})`,
                    predicted: `${groupToSpecies[predictedGroup] || `Group ${predictedGroup}`} (Group ${predictedGroup})`,
                    correct: isCorrect,
                    isTraining: false,
                    dataType: 'test',
                });
            } else if (splitType === 'train') {
                allTreeData.push({
                    treeId,
                    actualGroup,
                    actual: `${actualSpecies} (Group ${actualGroup})`,
                    isTraining: true,
                    dataType: 'train',
                });
            }
        }

        const testTrees = allTreeData.filter((tree) => tree.dataType === 'test');
        const trainingTrees = allTreeData.filter((tree) => tree.dataType === 'train');

        console.log(`Loaded ${testTrees.length} test trees and ${trainingTrees.length} training trees`);

        if (testTrees.length > 0) {
            console.log('Example mappings:');
            for (let i = 0; i < Math.min(5, testTrees.length); i++) {
                const tree = testTrees[i];
                console.log(`Tree ${tree.treeId}: Group ${tree.actualGroup} (${tree.actual}) → Group ${tree.predictedGroup} (${tree.predicted})`);
            }
        }

        return allTreeData;
    } catch (error) {
        console.error('Error loading prediction data:', error);
        return [];
    }
}
