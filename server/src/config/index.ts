import fs from 'fs';
import path from 'path';

function readBuildInfo(): { version: string; commit: string } {
  try {
    const raw = fs.readFileSync(path.join(__dirname, '..', 'build-info.json'), 'utf8');
    const info = JSON.parse(raw);
    return {
      version: typeof info.version === 'string' ? info.version : 'dev',
      commit: typeof info.commit === 'string' ? info.commit : '',
    };
  } catch {
    return { version: 'dev', commit: '' };
  }
}

const buildInfo = readBuildInfo();

export const config = {
  port: parseInt(process.env.PORT || '8080', 10),
  dbPath: process.env.DB_PATH || '/data/charteris.db',
  apiToken: process.env.CHARTERIS_API_TOKEN || '',
  nodeEnv: process.env.NODE_ENV || 'development',
  appVersion: process.env.CHARTERIS_VERSION || buildInfo.version,
  appCommit: (process.env.CHARTERIS_GIT_SHA || buildInfo.commit).slice(0, 7),
};
