const fs = require('fs');
const path = require('path');

/**
 * Clean temp folder periodically to free up disk space
 */
function startCleanupScheduler() {
    const tempFolder = path.join(__dirname, '../temp');
    
    // Initial cleanup
    cleanupTempFolder(tempFolder);
    
    // Schedule cleanup every 10 minutes
    setInterval(() => {
        cleanupTempFolder(tempFolder);
    }, 600000); // 10 minutes
    
    console.log('🧹 Cleanup scheduler started (runs every 10 minutes)');
}

function cleanupTempFolder(tempFolder) {
    try {
        if (!fs.existsSync(tempFolder)) {
            return;
        }
        
        const files = fs.readdirSync(tempFolder);
        const now = Date.now();
        let cleaned = 0;
        
        files.forEach(file => {
            try {
                const filePath = path.join(tempFolder, file);
                const stats = fs.statSync(filePath);
                
                // Delete files older than 10 minutes (600000ms)
                if (now - stats.mtimeMs > 600000) {
                    fs.unlinkSync(filePath);
                    cleaned++;
                }
            } catch (e) {
                // Ignore individual file errors
            }
        });
        
        if (cleaned > 0) {
            console.log(`🧹 Cleaned ${cleaned} temp file(s)`);
        }
    } catch (error) {
        // Ignore cleanup errors
    }
}

/**
 * Force cleanup all temp files (use on startup)
 */
function forceCleanup() {
    const tempFolder = path.join(__dirname, '../temp');
    
    try {
        if (fs.existsSync(tempFolder)) {
            const files = fs.readdirSync(tempFolder);
            files.forEach(file => {
                try {
                    fs.unlinkSync(path.join(tempFolder, file));
                } catch (e) {
                    // Ignore
                }
            });
            console.log('🧹 Temp folder cleaned on startup');
        }
    } catch (error) {
        // Ignore
    }
}

module.exports = { 
    startCleanupScheduler,
    forceCleanup
};
