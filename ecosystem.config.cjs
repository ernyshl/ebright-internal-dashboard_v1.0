const path = require('path');

const root = __dirname;

module.exports = {
  apps: [
    {
      name: 'ebright-backend',
      cwd: path.join(root, 'backend'),
      script: path.join(root, 'backend', 'src', 'server.js'),
      autorestart: true,
      max_restarts: 20,
      min_uptime: '15s',
      restart_delay: 3000,
      max_memory_restart: '512M',
      out_file: path.join(root, 'logs', 'backend-out.log'),
      error_file: path.join(root, 'logs', 'backend-err.log'),
      merge_logs: true,
      time: true,
      env: { NODE_ENV: 'development' }
    },
    {
      name: 'ebright-frontend',
      cwd: path.join(root, 'frontend'),
      script: path.join(root, 'frontend', 'node_modules', 'vite', 'bin', 'vite.js'),
      args: '--host',
      autorestart: true,
      max_restarts: 20,
      min_uptime: '15s',
      restart_delay: 3000,
      max_memory_restart: '512M',
      out_file: path.join(root, 'logs', 'frontend-out.log'),
      error_file: path.join(root, 'logs', 'frontend-err.log'),
      merge_logs: true,
      time: true,
      env: { NODE_ENV: 'development' }
    }
  ]
};
