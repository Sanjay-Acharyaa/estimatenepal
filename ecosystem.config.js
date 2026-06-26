module.exports = {
  apps: [
    {
      name: "nepaliestimate",
      script: "server.js",
      instances: "max",   // one worker per CPU core
      exec_mode: "cluster",
      env_production: {
        NODE_ENV: "production",
      },
      // Restart a worker if it exceeds 512 MB — prevents memory leaks from taking down all workers
      max_memory_restart: "512M",
      // Wait 5s before restarting a crashed worker to avoid rapid restart loops
      restart_delay: 5000,
      // Log to files so all workers' output goes to one place
      out_file: "/var/log/pm2/nepaliestimate-out.log",
      error_file: "/var/log/pm2/nepaliestimate-err.log",
      merge_logs: true,
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
    },
  ],
};
