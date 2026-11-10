export function thumbnailReady(thumbnail: { status?: string; storage_path?: string | null; youtube_id?: string } | null, videoId: string) {
  return thumbnail?.status === 'ready' && Boolean(thumbnail.storage_path) && thumbnail.youtube_id === videoId;
}

