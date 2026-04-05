module.exports = {
    apps: [{
        name:                'apex-md-v2',
        script:              'index.js',
        instances:           1,          // WhatsApp bot — ALWAYS 1 instance only!
        autorestart:         true,
        watch:               false,
        max_memory_restart:  '400M',
        restart_delay:       5000,
        max_restarts:        10,
        min_uptime:          '15s',
        log_date_format:     'YYYY-MM-DD HH:mm:ss',
        error_file:          './logs/error.log',
        out_file:            './logs/out.log',
        merge_logs:          true
    }]
};
