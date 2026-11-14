/**
 * YouTube URL Parser for MusicFY
 * Extracts valid YouTube 11-character video IDs from various URL formats or raw IDs.
 */

export function extractYouTubeVideoId(input: string): string | null {
  if (!input || typeof input !== 'string') return null;
  const trimmed = input.trim();

  // 1. Raw 11-char Video ID
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
    return trimmed;
  }

  // 2. youtu.be/VIDEO_ID
  const youtuBeMatch = trimmed.match(/(?:youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/);
  if (youtuBeMatch && youtuBeMatch[1]) {
    return youtuBeMatch[1];
  }

  // 3. youtube.com/watch?v=VIDEO_ID or music.youtube.com/watch?v=VIDEO_ID
  const watchMatch = trimmed.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
  if (watchMatch && watchMatch[1]) {
    return watchMatch[1];
  }

  // 4. General regex fallback
  const genericMatch = trimmed.match(/(?:youtube(?:-nocookie)?\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?)\/|\S*?[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/i);
  if (genericMatch && genericMatch[1]) {
    return genericMatch[1];
  }

  return null;
}
