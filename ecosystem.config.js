module.exports = {
    apps: [
        {
            name: 'apex-md-v2',
            script: 'index.js',
            cwd: './',
            instances: 1,
            autorestart: true,
            watch: false,
            max_memory_restart: '512M',
            restart_delay: 5000,
            max_restarts: 10,
            min_uptime: '10s',
            env: {
                NODE_ENV: 'production'
            },
            log_date_format: 'YYYY-MM-DD HH:mm:ss',
            error_file: './logs/error.log',
            out_file: './logs/out.log',
            merge_logs: true,
            kill_timeout: 5000
        }
    ]
};
