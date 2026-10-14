import { describe, expect, it } from 'vitest';
import { browserPlayable } from './plex';

describe('browserPlayable', () => {
  it('plays MP4/MOV with H.264 and AAC or MP3 directly', () => {
    expect(browserPlayable({ container: 'mp4', videoCodec: 'h264', audioCodec: 'aac' })).toBe(true);
    expect(browserPlayable({ container: 'm4v', videoCodec: 'h264', audioCodec: 'mp3' })).toBe(true);
    expect(browserPlayable({ container: 'MOV', videoCodec: 'H264', audioCodec: 'AAC' })).toBe(true);
  });

  it('converts anything else', () => {
    expect(browserPlayable({ container: 'mkv', videoCodec: 'h264', audioCodec: 'aac' })).toBe(false);
    expect(browserPlayable({ container: 'mp4', videoCodec: 'hevc', audioCodec: 'aac' })).toBe(false);
    expect(browserPlayable({ container: 'mp4', videoCodec: 'h264', audioCodec: 'ac3' })).toBe(false);
    expect(browserPlayable({ container: 'avi', videoCodec: 'mpeg4', audioCodec: 'mp3' })).toBe(false);
    expect(browserPlayable(undefined)).toBe(false);
  });
});
