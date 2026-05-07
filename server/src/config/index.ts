export const config = {
  port: parseInt(process.env.PORT || '8080', 10),
  dbPath: process.env.DB_PATH || '/data/charteris.db',
  apiToken: process.env.CHARTERIS_API_TOKEN || '',
  nodeEnv: process.env.NODE_ENV || 'development',
  appVersion: process.env.CHARTERIS_VERSION || process.env.npm_package_version || 'dev',
  appCommit: (process.env.CHARTERIS_GIT_SHA || process.env.GIT_COMMIT || '').slice(0, 7),
};
