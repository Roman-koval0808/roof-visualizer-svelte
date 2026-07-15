module.exports = {
  apps: [
    {
      name: 'roof-visualizer',
      script: 'build/index.js',
      cwd: '/root/roof-visualizer-svelte',
      instances: 1,
      exec_mode: 'fork',
      node_args: '--env-file=.env',
      env: {
        NODE_ENV: 'production',
        PORT: 3012,
        HOST: '0.0.0.0',
        BODY_SIZE_LIMIT: '52428800'
      },
      error_file: './logs/pm2-error.log',
      out_file: './logs/pm2-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      watch: false
    }
  ]
};
