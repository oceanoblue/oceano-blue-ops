import { describe, expect, it } from 'vitest';
import { episodeBasename, resolveEpisodeSource } from './episode-source';

describe('episodeBasename', () => {
  it('strips folders + video extension and lower-cases (matches Make ref_base)', () => {
    expect(episodeBasename('oceanoblue_MindYourHealthAugust_mindyourhealthaugustSophiaTownes_v1.mp4')).toBe(
      'oceanoblue_mindyourhealthaugust_mindyourhealthaugustsophiatownes_v1'
    );
    expect(episodeBasename('/Podcasts/mind-your-health/02-Edited/ep.MOV')).toBe('ep');
    expect(episodeBasename('  noext ')).toBe('noext');
  });
});

/** Minimal chainable fake of the supabase-js query builder, one table at a time. */
function fakeAdmin(rows: Record<string, unknown | null>) {
  return {
    from(table: string) {
      const q: any = {
        select: () => q,
        eq: () => q,
        limit: () => q,
        maybeSingle: async () => ({ data: rows[table] ?? null }),
      };
      return q;
    },
  };
}

describe('resolveEpisodeSource', () => {
  it('walks external_links → podcast_episodes.metadata', async () => {
    const admin = fakeAdmin({
      external_links: { job_id: 'job1' },
      podcast_episodes: { id: 'ep1', job_id: 'job1', metadata: { dropbox_path: '/Podcasts/mind-your-health/02-Edited/X_v1.mp4', filename: 'X_v1.mp4' } },
    });
    expect(await resolveEpisodeSource(admin, 'abc')).toEqual({
      episodeId: 'ep1',
      jobId: 'job1',
      dropboxPath: '/Podcasts/mind-your-health/02-Edited/X_v1.mp4',
      basename: 'x_v1',
    });
  });

  it('falls back to the source asset when metadata has no dropbox_path', async () => {
    const admin = fakeAdmin({
      external_links: { job_id: 'job1' },
      podcast_episodes: { id: 'ep1', job_id: 'job1', metadata: {} },
      assets: { local_path: '/old/RENDERS/Y.mp4', filename: 'Y.mp4' },
    });
    expect((await resolveEpisodeSource(admin, 'abc'))?.basename).toBe('y');
  });

  it('returns null when the chain breaks', async () => {
    expect(await resolveEpisodeSource(fakeAdmin({}), 'abc')).toBeNull();
    expect(await resolveEpisodeSource(fakeAdmin({ external_links: { job_id: 'job1' } }), 'abc')).toBeNull();
    expect(
      await resolveEpisodeSource(fakeAdmin({ external_links: { job_id: 'job1' }, podcast_episodes: { id: 'ep1', job_id: 'job1', metadata: {} } }), 'abc')
    ).toBeNull();
  });

  it('never throws', async () => {
    const broken = { from() { throw new Error('db down'); } };
    expect(await resolveEpisodeSource(broken, 'abc')).toBeNull();
  });
});
