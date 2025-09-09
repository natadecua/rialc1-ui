// las-worker.js

// Helper to send messages back to the main thread
const post = (type, payload) => postMessage({ type, payload });

// Initialize las-wasm library
let lasLoader = null;
async function initializeLasWasm() {
    if (!lasLoader) {
        // The las-wasm script is imported via importScripts in the worker
        const { LASLoader } = await lasWasm();
        lasLoader = LASLoader;
        post('status', { text: 'LAS library ready.' });
    }
    return lasLoader;
}

// Main message handler
onmessage = async (event) => {
    const { file } = event.data;

    try {
        post('status', { text: 'Worker received file. Initializing parser...' });
        
        // Dynamically import the las-wasm script.
        // The path is relative to the main script's location.
        importScripts('https://unpkg.com/las-wasm@2.2.0/dist/las-wasm.js');
        
        const LASLoader = await initializeLasWasm();
        if (!LASLoader) {
            throw new Error('las-wasm could not be initialized in worker.');
        }

        post('status', { text: 'Reading file into memory...' });
        const arrayBuffer = await file.arrayBuffer();
        
        post('status', { text: `Parsing ${file.name}... This may take a while.` });
        const lasFile = await LASLoader.load(arrayBuffer);
        
        post('status', { text: 'Extracting points...' });
        // For very large files, we should process points in chunks to avoid memory spikes
        const totalPoints = lasFile.pointsCount;
        const points = await LASLoader.getPoints(lasFile, 0, totalPoints);

        // Create a transferable version of the point cloud data
        const pointCloudData = {
            points: points.map(p => ({
                x: p.x,
                y: p.y,
                z: p.z,
                intensity: p.intensity || 0,
                classification: p.classification || 0,
                returnNumber: p.returnNumber || 1,
                numberOfReturns: p.numberOfReturns || 1
            })),
            header: lasFile.header,
            bounds: {
                minX: lasFile.header.minX,
                maxX: lasFile.header.maxX,
                minY: lasFile.header.minY,
                maxY: lasFile.header.maxY,
                minZ: lasFile.header.minZ,
                maxZ: lasFile.header.maxZ
            },
            statistics: {
                totalPoints: totalPoints,
                groundPoints: points.filter(p => p.classification === 2).length,
                vegetationPoints: points.filter(p => p.classification >= 3 && p.classification <= 5).length,
                buildingPoints: points.filter(p => p.classification === 6).length
            }
        };

        post('status', { text: 'Processing complete. Sending data back to main page.' });
        post('done', pointCloudData);

    } catch (error) {
        console.error('Error in LAS worker:', error);
        post('error', { message: error.message, stack: error.stack });
    }
};
