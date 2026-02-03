/**
 * ╔════════════════════════════════════════════════════════╗
 * ║   APEX-MD SPEED MODE V2 - PURE OPTIMIZATION          ║
 * ║   ⚡ Features complete - just faster!                 ║
 * ║   RAM & CPU optimize කරන්න නොවෙයි feature lose     ║
 * ╚════════════════════════════════════════════════════════╝
 */

class SpeedModeV2 {
    constructor(config = {}) {
        this.enabled = config.enabled || false;
        
        // ==================== OPTIMIZATION LEVELS ====================
        // Levels: all features complete - just different optimization strategies
        this.optimizationLevel = config.level || 'balanced'; 
        // light = aggressive caching + message batching
        // balanced = moderate caching + smart processing
        // turbo = minimal caching + fast processing
        // ultra = no caching restrictions + maximum speed
        
        // ==================== ADVANCED CACHING ====================
        this.cache = new Map();
        this.commandCache = new Map();
        this.mediaCache = new Map();
        this.aiCache = new Map();
        
        this.cacheConfig = {
            light: {
                commandTTL: 600000,      // 10 min - repeat commands faster
                mediaTTL: 300000,        // 5 min - media downloads cached
                aiTTL: 300000,           // 5 min - AI responses cached
                maxSize: 200,            // More cache storage
                ttlCheck: 60000          // Check every 1 min
            },
            balanced: {
                commandTTL: 300000,      // 5 min
                mediaTTL: 180000,        // 3 min
                aiTTL: 180000,           // 3 min
                maxSize: 150,
                ttlCheck: 120000         // Check every 2 min
            },
            turbo: {
                commandTTL: 180000,      // 3 min
                mediaTTL: 120000,        // 2 min
                aiTTL: 120000,           // 2 min
                maxSize: 100,
                ttlCheck: 180000         // Check every 3 min
            },
            ultra: {
                commandTTL: 60000,       // 1 min (minimal)
                mediaTTL: 60000,         // 1 min
                aiTTL: 60000,            // 1 min
                maxSize: 50,
                ttlCheck: 300000         // Check every 5 min
            }
        };
        
        // ==================== MESSAGE QUEUING ====================
        // Smart batching - CPU friendly
        this.messageQueue = [];
        this.isProcessing = false;
        this.processingConfig = {
            light: {
                batchSize: 10,           // Process 10 at a time
                delayBetweenBatches: 50, // 50ms between batches
                priorityQueue: true      // Important messages first
            },
            balanced: {
                batchSize: 15,
                delayBetweenBatches: 30,
                priorityQueue: true
            },
            turbo: {
                batchSize: 20,
                delayBetweenBatches: 20,
                priorityQueue: true
            },
            ultra: {
                batchSize: 30,
                delayBetweenBatches: 10,
                priorityQueue: false     // Direct processing
            }
        };
        
        // ==================== CONNECTION POOLING ====================
        // Reuse connections instead of creating new ones
        this.connectionPool = new Map();
        this.poolConfig = {
            maxConnections: 5,
            connectionTimeout: 30000,
            idleTimeout: 60000
        };
        
        // ==================== MEMORY MANAGEMENT ====================
        this.memoryOptimization = {
            gcInterval: 60000,           // Run GC every 1 min
            checkInterval: 30000,        // Check memory every 30s
            maxMemoryUsage: 300 * 1024 * 1024 // 300MB limit
        };
        
        // ==================== REQUEST DEDUPLICATION ====================
        // Avoid duplicate processing
        this.requestTracker = new Map();
        this.deduplicationConfig = {
            window: 1000,                // 1 second window
            enabled: true
        };
        
        // ==================== STATS ====================
        this.stats = {
            enabled: true,
            messagesProcessed: 0,
            cacheHits: 0,
            cacheMisses: 0,
            duplicatesBlocked: 0,
            avgResponseTime: 0,
            peakMemory: 0,
            startTime: Date.now()
        };
    }
    
    /**
     * Enable Speed Mode (V2 - all features)
     */
    enable(level = 'balanced') {
        const validLevels = ['light', 'balanced', 'turbo', 'ultra'];
        if (!validLevels.includes(level)) {
            console.log(`❌ Invalid level: ${level}. Use: ${validLevels.join(', ')}`);
            return false;
        }
        
        this.enabled = true;
        this.optimizationLevel = level;
        
        console.log(`
╔═════════════════════════════════════════╗
║   ⚡ SPEED MODE V2 ENABLED            ║
║   Level: ${level.toUpperCase().padEnd(31)}║
║   All Features: ✅ ACTIVE             ║
╚═════════════════════════════════════════╝
        `);
        
        return true;
    }
    
    /**
     * Disable Speed Mode
     */
    disable() {
        this.enabled = false;
        console.log('⏸️  Speed Mode V2 DISABLED - Normal operation');
        return true;
    }
    
    /**
     * Advanced Smart Cache - Commands
     */
    cacheCommand(command, result) {
        if (!this.enabled) return;
        
        const level = this.optimizationLevel;
        const config = this.cacheConfig[level];
        const key = `cmd:${command}`;
        
        // Clear old cache if limit reached
        if (this.commandCache.size >= config.maxSize) {
            const firstKey = this.commandCache.keys().next().value;
            this.commandCache.delete(firstKey);
        }
        
        this.commandCache.set(key, {
            data: result,
            timestamp: Date.now(),
            ttl: config.commandTTL
        });
    }
    
    /**
     * Get cached command
     */
    getCachedCommand(command) {
        const key = `cmd:${command}`;
        const cached = this.commandCache.get(key);
        
        if (!cached) {
            this.stats.cacheMisses++;
            return null;
        }
        
        // Check if expired
        if (Date.now() - cached.timestamp > cached.ttl) {
            this.commandCache.delete(key);
            this.stats.cacheMisses++;
            return null;
        }
        
        this.stats.cacheHits++;
        return cached.data;
    }
    
    /**
     * Cache Media Downloads
     */
    cacheMedia(url, mediaData) {
        if (!this.enabled) return;
        
        const level = this.optimizationLevel;
        const config = this.cacheConfig[level];
        const key = `media:${this.hashString(url)}`;
        
        if (this.mediaCache.size >= config.maxSize / 2) {
            const firstKey = this.mediaCache.keys().next().value;
            this.mediaCache.delete(firstKey);
        }
        
        this.mediaCache.set(key, {
            data: mediaData,
            url: url,
            timestamp: Date.now(),
            ttl: config.mediaTTL
        });
    }
    
    /**
     * Get cached media
     */
    getCachedMedia(url) {
        const key = `media:${this.hashString(url)}`;
        const cached = this.mediaCache.get(key);
        
        if (!cached) return null;
        
        if (Date.now() - cached.timestamp > cached.ttl) {
            this.mediaCache.delete(key);
            return null;
        }
        
        return cached.data;
    }
    
    /**
     * Cache AI Responses
     */
    cacheAI(prompt, response) {
        if (!this.enabled) return;
        
        const level = this.optimizationLevel;
        const config = this.cacheConfig[level];
        const key = `ai:${this.hashString(prompt)}`;
        
        if (this.aiCache.size >= config.maxSize / 2) {
            const firstKey = this.aiCache.keys().next().value;
            this.aiCache.delete(firstKey);
        }
        
        this.aiCache.set(key, {
            data: response,
            prompt: prompt,
            timestamp: Date.now(),
            ttl: config.aiTTL
        });
    }
    
    /**
     * Get cached AI response
     */
    getCachedAI(prompt) {
        const key = `ai:${this.hashString(prompt)}`;
        const cached = this.aiCache.get(key);
        
        if (!cached) return null;
        
        if (Date.now() - cached.timestamp > cached.ttl) {
            this.aiCache.delete(key);
            return null;
        }
        
        return cached.data;
    }
    
    /**
     * Request Deduplication - Block duplicate requests
     */
    isDuplicate(key) {
        const config = this.deduplicationConfig;
        if (!config.enabled) return false;
        
        if (this.requestTracker.has(key)) {
            const lastTime = this.requestTracker.get(key);
            if (Date.now() - lastTime < config.window) {
                this.stats.duplicatesBlocked++;
                return true;
            }
        }
        
        this.requestTracker.set(key, Date.now());
        return false;
    }
    
    /**
     * Optimize Message Processing - Batch Processing
     */
    async queueMessage(message, handler) {
        return new Promise((resolve, reject) => {
            this.messageQueue.push({
                message,
                handler,
                resolve,
                reject,
                timestamp: Date.now(),
                priority: message.isOwner ? 1 : 0
            });
            
            if (!this.isProcessing) {
                this.processQueue();
            }
        });
    }
    
    /**
     * Process message queue efficiently
     */
    async processQueue() {
        if (this.isProcessing || this.messageQueue.length === 0) return;
        
        this.isProcessing = true;
        const level = this.optimizationLevel;
        const config = this.processingConfig[level];
        
        // Sort by priority if enabled
        if (config.priorityQueue) {
            this.messageQueue.sort((a, b) => b.priority - a.priority);
        }
        
        while (this.messageQueue.length > 0) {
            const batch = this.messageQueue.splice(0, config.batchSize);
            
            for (const item of batch) {
                try {
                    const startTime = Date.now();
                    const result = await item.handler(item.message);
                    
                    // Update response time
                    const responseTime = Date.now() - startTime;
                    this.updateAvgResponseTime(responseTime);
                    
                    item.resolve(result);
                    this.stats.messagesProcessed++;
                } catch (error) {
                    item.reject(error);
                }
            }
            
            // Delay between batches
            if (this.messageQueue.length > 0) {
                await this.sleep(config.delayBetweenBatches);
            }
        }
        
        this.isProcessing = false;
    }
    
    /**
     * Connection Pooling - Reuse connections
     */
    getConnection(id) {
        if (this.connectionPool.has(id)) {
            const conn = this.connectionPool.get(id);
            conn.lastUsed = Date.now();
            return conn;
        }
        return null;
    }
    
    /**
     * Store connection in pool
     */
    poolConnection(id, connection) {
        if (this.connectionPool.size >= this.poolConfig.maxConnections) {
            // Remove oldest connection
            let oldest = null;
            let oldestTime = Infinity;
            
            for (const [key, conn] of this.connectionPool) {
                if (conn.lastUsed < oldestTime) {
                    oldest = key;
                    oldestTime = conn.lastUsed;
                }
            }
            
            if (oldest) this.connectionPool.delete(oldest);
        }
        
        this.connectionPool.set(id, {
            connection,
            createdAt: Date.now(),
            lastUsed: Date.now()
        });
    }
    
    /**
     * Memory Management - Automatic cleanup
     */
    optimizeMemory() {
        const used = process.memoryUsage().heapUsed;
        
        if (used > this.memoryOptimization.maxMemoryUsage) {
            // Clear old cache entries
            this.clearExpiredCache();
            
            // Force garbage collection if available
            if (global.gc) {
                global.gc();
            }
        }
    }
    
    /**
     * Clear expired cache entries
     */
    clearExpiredCache() {
        const now = Date.now();
        let cleared = 0;
        
        // Clear commands
        for (const [key, value] of this.commandCache) {
            if (now - value.timestamp > value.ttl) {
                this.commandCache.delete(key);
                cleared++;
            }
        }
        
        // Clear media
        for (const [key, value] of this.mediaCache) {
            if (now - value.timestamp > value.ttl) {
                this.mediaCache.delete(key);
                cleared++;
            }
        }
        
        // Clear AI
        for (const [key, value] of this.aiCache) {
            if (now - value.timestamp > value.ttl) {
                this.aiCache.delete(key);
                cleared++;
            }
        }
        
        return cleared;
    }
    
    /**
     * Hash string for cache keys
     */
    hashString(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return hash.toString(36);
    }
    
    /**
     * Update average response time
     */
    updateAvgResponseTime(newTime) {
        const processed = this.stats.messagesProcessed;
        const old = this.stats.avgResponseTime;
        this.stats.avgResponseTime = (old * processed + newTime) / (processed + 1);
    }
    
    /**
     * Get comprehensive stats
     */
    getStats() {
        const memory = process.memoryUsage();
        const uptime = Date.now() - this.stats.startTime;
        
        return {
            enabled: this.enabled,
            level: this.optimizationLevel,
            messagesProcessed: this.stats.messagesProcessed,
            cacheHits: this.stats.cacheHits,
            cacheMisses: this.stats.cacheMisses,
            cacheHitRate: this.stats.cacheHits + this.stats.cacheMisses > 0
                ? ((this.stats.cacheHits / (this.stats.cacheHits + this.stats.cacheMisses)) * 100).toFixed(2) + '%'
                : '0%',
            duplicatesBlocked: this.stats.duplicatesBlocked,
            avgResponseTime: this.stats.avgResponseTime.toFixed(2) + 'ms',
            queueLength: this.messageQueue.length,
            memory: {
                heapUsed: Math.round(memory.heapUsed / 1024 / 1024) + ' MB',
                heapTotal: Math.round(memory.heapTotal / 1024 / 1024) + ' MB',
                rss: Math.round(memory.rss / 1024 / 1024) + ' MB'
            },
            uptime: this.formatUptime(uptime),
            caches: {
                commands: this.commandCache.size,
                media: this.mediaCache.size,
                ai: this.aiCache.size
            }
        };
    }
    
    /**
     * Format uptime
     */
    formatUptime(ms) {
        const seconds = Math.floor(ms / 1000) % 60;
        const minutes = Math.floor(ms / 60000) % 60;
        const hours = Math.floor(ms / 3600000) % 24;
        const days = Math.floor(ms / 86400000);
        
        return `${days}d ${hours}h ${minutes}m ${seconds}s`;
    }
    
    /**
     * Display Status
     */
    showStatus() {
        const stats = this.getStats();
        
        console.log(`
╔══════════════════════════════════════════════╗
║        ⚡ SPEED MODE V2 STATUS              ║
╠══════════════════════════════════════════════╣
║ Status: ${this.enabled ? '🟢 ACTIVE' : '🔴 DISABLED'}${' '.repeat(30)}║
║ Level: ${stats.level.toUpperCase().padEnd(37)}║
║ Messages Processed: ${stats.messagesProcessed.toString().padEnd(26)}║
║ Cache Hit Rate: ${stats.cacheHitRate.padEnd(30)}║
║ Avg Response Time: ${stats.avgResponseTime.padEnd(28)}║
║ Duplicates Blocked: ${stats.duplicatesBlocked.toString().padEnd(26)}║
╠══════════════════════════════════════════════╣
║ Memory Usage:                                ║
║   Heap Used: ${stats.memory.heapUsed.padEnd(33)}║
║   RSS: ${stats.memory.rss.padEnd(39)}║
╠══════════════════════════════════════════════╣
║ Caches:                                      ║
║   Commands: ${stats.caches.commands.toString().padEnd(34)}║
║   Media: ${stats.caches.media.toString().padEnd(37)}║
║   AI: ${stats.caches.ai.toString().padEnd(39)}║
╠══════════════════════════════════════════════╣
║ Uptime: ${stats.uptime.padEnd(35)}║
╚══════════════════════════════════════════════╝
        `);
    }
    
    /**
     * Reset stats
     */
    resetStats() {
        this.stats = {
            enabled: true,
            messagesProcessed: 0,
            cacheHits: 0,
            cacheMisses: 0,
            duplicatesBlocked: 0,
            avgResponseTime: 0,
            peakMemory: 0,
            startTime: Date.now()
        };
        console.log('✅ Stats reset successfully');
    }
    
    /**
     * Utility sleep
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

module.exports = SpeedModeV2;
