import { describe, it, expect, afterEach } from 'vitest';
import { showFolderPath, isDropboxConfigured } from './dropbox';

describe('showFolderPath', () => {
  it('joins the default root with the slug', () => {
    expect(showFolderPath('defining-wealth', '/Podcasts')).toBe('/Podcasts/defining-wealth');
  });

  it('normalizes missing leading slash and trailing slash on the root', () => {
    expect(showFolderPath('mind-your-health', 'Podcasts/')).toBe('/Podcasts/mind-your-health');
  });

  it('collapses duplicate slashes', () => {
    expect(showFolderPath('x', '//Clients//Podcasts//')).toBe('/Clients/Podcasts/x');
  });

  it('strips stray slashes around the slug', () => {
    expect(showFolderPath('/foo/', '/Podcasts')).toBe('/Podcasts/foo');
  });
});

describe('isDropboxConfigured', () => {
  const keys = ['DROPBOX_APP_KEY', 'DROPBOX_APP_SECRET', 'DROPBOX_REFRESH_TOKEN'];
  afterEach(() => keys.forEach((k) => delete process.env[k]));

  it('false when nothing is set', () => {
    expect(isDropboxConfigured()).toBe(false);
  });

  it('false when only some are set', () => {
    process.env.DROPBOX_APP_KEY = 'a';
    expect(isDropboxConfigured()).toBe(false);
  });

  it('true when all three are set', () => {
    process.env.DROPBOX_APP_KEY = 'a';
    process.env.DROPBOX_APP_SECRET = 'b';
    process.env.DROPBOX_REFRESH_TOKEN = 'c';
    expect(isDropboxConfigured()).toBe(true);
  });
});
