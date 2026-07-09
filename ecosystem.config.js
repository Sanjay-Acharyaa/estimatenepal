module.exports = {
  apps: [
    {
      name: "nepali-estimate",
      script: "server.js",
      instances: 2,
      exec_mode: "cluster",
      // env (not env_production) so NODE_ENV=production is always applied
      env: {
        NODE_ENV: "production",
        PORT: 3000,
      },
      max_memory_restart: "1024M",
      wait_ready: true,
      listen_timeout: 60000,
      restart_delay: 5000,
      out_file: "/var/log/pm2/nepali-estimate-out.log",
      error_file: "/var/log/pm2/nepali-estimate-err.log",
      merge_logs: true,
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
    },
  ],
};
