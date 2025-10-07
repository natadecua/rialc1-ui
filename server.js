const express = require('express');
const path = require('path');
const cors = require('cors');
const fs = require('fs');

const app = express();
const port = 3000;

// Enable CORS for all routes
app.use(cors());

// --- Static File Serving ---
// 1. Serve the main frontend files (index.html, script.js, etc.) from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// 2. Serve the raw_data directory from the project root
app.use('/raw_data', express.static(path.join(__dirname, 'raw_data')));

// 3. Serve the pre-generated map tiles from our final tiles directory
app.use('/tiles', express.static(path.join(__dirname, 'lamesa_forest_final_fixed')));

// 4. Serve the Potree library files
app.use('/Potree_1.8.2', express.static(path.join(__dirname, 'Potree_1.8.2')));

    
// --- API Endpoints ---
// A simple endpoint to check if the server is running
app.get('/api/status', (req, res) => {
    res.json({ status: 'Server is running' });
});

app.listen(port, () => {
    console.log(`Server listening at http://localhost:${port}`);
    console.log('Serving frontend from the "public" directory.');
    console.log('Serving raw data from the "raw_data" directory.');
    console.log('Serving map tiles from the "lamesa_forest_final_fixed" directory.');
});