export const config = {
  port: parseInt(process.env.PORT || '8080', 10),
  dbPath: process.env.DB_PATH || '/data/charteris.db',
  apiToken: process.env.CHARTERIS_API_TOKEN || '',
  nodeEnv: process.env.NODE_ENV || 'development',
};
