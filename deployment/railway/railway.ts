import { defineRailway, postgres, project, redis, service, volume } from "railway/iac";

export default defineRailway(() => {
  const Postgres = postgres("Postgres", { region: "asia-southeast1-eqsg3a" });
  Postgres.networking = { privateNetworkEndpoint: "postgres" };
  const Redis = redis("Redis", { region: "asia-southeast1-eqsg3a" });
  Redis.deploy = { startCommand: "/bin/sh -c \"rm -rf $RAILWAY_VOLUME_MOUNT_PATH/lost+found/ && exec docker-entrypoint.sh redis-server --requirepass $REDIS_PASSWORD --save 60 1 --dir $RAILWAY_VOLUME_MOUNT_PATH\"" };
  Redis.networking = { privateNetworkEndpoint: "redis" };
  const conciergeDocsgptVolume = volume("concierge-docsgpt-volume", { alerts: { usage: { "100": {}, "80": {}, "95": {} } }, allowOnlineResize: true, region: "asia-southeast1-eqsg3a", sizeMB: 5000 });
  const postgresVolume = volume("postgres-volume", { alerts: { usage: { "100": {}, "80": {}, "95": {} } }, allowOnlineResize: true, region: "asia-southeast1-eqsg3a", sizeMB: 5000 });
  const redisVolume = volume("redis-volume", { alerts: { usage: { "100": {}, "80": {}, "95": {} } }, allowOnlineResize: true, region: "asia-southeast1-eqsg3a", sizeMB: 5000 });
  const conciergeWebVolume = volume("concierge-web-volume", { alerts: { usage: { "100": {}, "80": {}, "95": {} } }, allowOnlineResize: true, region: "asia-southeast1-eqsg3a", sizeMB: 5000 });
  const conciergeDocsgpt = service("concierge-docsgpt", {
    build: { buildEnvironment: "V3", builder: "RAILPACK" },
    healthcheck: "/api/health",
    healthcheckTimeout: 300,
    replicas: { "asia-southeast1-eqsg3a": 1 },
    volumeMounts: { "/data": conciergeDocsgptVolume },
  });
  const conciergeWeb = service("concierge-web", {
    build: { buildEnvironment: "V3", builder: "RAILPACK" },
    healthcheck: "/api/health",
    healthcheckTimeout: 120,
    replicas: { "asia-southeast1-eqsg3a": 1 },
    volumeMounts: { "/data": conciergeWebVolume },
  });

  return project("motto-kosodate-concierge", {
    variables: { managed: false },
    resources: [Postgres, conciergeDocsgpt, Redis, conciergeWeb, conciergeDocsgptVolume, postgresVolume, redisVolume, conciergeWebVolume],
  });
});
