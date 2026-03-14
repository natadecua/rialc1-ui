// Integration for opening the standalone 3D viewer
document.addEventListener('DOMContentLoaded', function() {
    // Find any buttons or links that need to open the 3D viewer
    const openViewerButtons = document.querySelectorAll('.open-3d-viewer');
    
    openViewerButtons.forEach(button => {
        button.addEventListener('click', function(e) {
            e.preventDefault();
            
            // Get tree data if available
            const treeId = button.getAttribute('data-tree-id');
            const treeData = button.getAttribute('data-tree-data');
            
            // Build URL with tree parameters if available
            let url = '/view_lamesa.html';
            
            if (treeId) {
                url += `?treeId=${encodeURIComponent(treeId)}`;
                
                if (treeData) {
                    url += `&treeData=${encodeURIComponent(treeData)}`;
                }
            }
            
            // Open viewer in new tab
            window.open(url, '_blank', 'noopener');
        });
    });
    
    // Also add a global function to open the viewer programmatically
    window.openPotreeViewer = function(treeId, treeData) {
        let url = '/view_lamesa.html';
        
        if (treeId) {
            url += `?treeId=${encodeURIComponent(treeId)}`;
            
            if (treeData) {
                url += `&treeData=${encodeURIComponent(JSON.stringify(treeData))}`;
            }
        }
        
        window.open(url, '_blank', 'noopener');
    };
});