import { describe, expect, it } from 'vitest';
import { fileStem, identifierFromLink, isGenericName, itemsFromMetadata, parseLength, pickPlayableFiles, type IaFile } from './ia';

// Trimmed from real archive.org metadata responses.
const getSmart: IaFile[] = [
  { source: 'derivative', format: 'h.264 IA', name: 'Get Smart S01E01 (Mr. Big).ia.mp4', length: '1535.49', original: 'Get Smart S01E01 (Mr. Big).mp4' },
  { source: 'original', format: 'MPEG4', name: 'Get Smart S01E01 (Mr. Big).mp4', length: '1535.45', original: 'Get Smart.torrent' },
  { source: 'derivative', format: 'h.264 IA', name: "Get Smart S01E02 (Diplomat's Daughter).ia.mp4", length: '1521.1', original: "Get Smart S01E02 (Diplomat's Daughter).mp4" },
  { source: 'original', format: 'MPEG4', name: "Get Smart S01E02 (Diplomat's Daughter).mp4", length: '1521.06', original: 'Get Smart.torrent' },
  { source: 'derivative', format: 'Thumbnail', name: 'Get Smart S01E01 (Mr. Big).thumbs/x_000001.jpg', original: 'Get Smart S01E01 (Mr. Big).mp4' },
];

const prelinger: IaFile[] = [
  { source: 'original', format: 'Cinepack', name: 'AboutBan1935.avi', length: '664.29' },
  { source: 'derivative', format: 'MP3', name: 'AboutBan1935.mp3', length: '11:03', original: 'AboutBan1935.mpeg' },
  { source: 'derivative', format: 'h.264', name: 'AboutBan1935.mp4', length: '664.03', original: 'AboutBan1935.mpeg' },
  { source: 'original', format: 'MPEG2', name: 'AboutBan1935.mpeg', length: '663.99' },
  { source: 'derivative', format: 'Ogg Video', name: 'AboutBan1935.ogv', length: '664.03', original: 'AboutBan1935.mpeg' },
  { source: 'derivative', format: '512Kb MPEG4', name: 'AboutBan1935_512kb.mp4', length: '664.03', original: 'AboutBan1935.mpeg' },
  { source: 'original', format: 'HiRes MPEG4', name: 'AboutBan1935_edit.mp4', length: '663.89' },
];

const cartoon: IaFile[] = [
  { source: 'original', format: 'MPEG2', name: 'popeye_patriotic_popeye.mpeg', length: '362.98' },
  { source: 'derivative', format: 'Ogg Video', name: 'popeye_patriotic_popeye.ogv', length: '363.16', original: 'popeye_patriotic_popeye.mpeg' },
  { source: 'derivative', format: '512Kb MPEG4', name: 'popeye_patriotic_popeye_512kb.mp4', length: '363.16', original: 'popeye_patriotic_popeye.mpeg' },
];

describe('parseLength', () => {
  it('handles seconds and clock formats', () => {
    expect(parseLength('1535.49')).toBe(1535.49);
    expect(parseLength('11:03')).toBe(663);
    expect(parseLength('1:00:01')).toBe(3601);
    expect(parseLength(undefined)).toBe(0);
    expect(parseLength('junk')).toBe(0);
  });
});

describe('fileStem', () => {
  it('strips extensions, .ia and _512kb', () => {
    expect(fileStem('Get Smart S01E01 (Mr. Big).ia.mp4')).toBe('Get Smart S01E01 (Mr. Big)');
    expect(fileStem('popeye_512kb.mp4')).toBe('popeye');
    expect(fileStem('dir/sub/x.mpeg')).toBe('x');
  });
});

describe('pickPlayableFiles', () => {
  it('returns one h.264 file per episode', () => {
    const files = pickPlayableFiles(getSmart);
    expect(files.map((f) => f.name)).toEqual([
      'Get Smart S01E01 (Mr. Big).ia.mp4',
      "Get Smart S01E02 (Diplomat's Daughter).ia.mp4",
    ]);
    expect(files[0]!.durationSec).toBe(1535.49);
  });

  it('collapses multiple originals of the same film', () => {
    const files = pickPlayableFiles(prelinger);
    expect(files.map((f) => f.name)).toEqual(['AboutBan1935.mp4']);
  });

  it('falls back to 512Kb MPEG4 when that is all there is', () => {
    expect(pickPlayableFiles(cartoon).map((f) => f.name)).toEqual(['popeye_patriotic_popeye_512kb.mp4']);
  });
});

describe('itemsFromMetadata', () => {
  it('titles multi-file items by file and single-file items by item title', () => {
    const multi = itemsFromMetadata('get-smart', { metadata: { title: 'Get Smart', mediatype: 'movies' }, files: getSmart });
    expect(multi.map((i) => i.title)).toEqual(['Get Smart S01E01 (Mr. Big)', "Get Smart S01E02 (Diplomat's Daughter)"]);
    expect(multi[0]!.url).toBe('https://archive.org/download/get-smart/Get%20Smart%20S01E01%20(Mr.%20Big).ia.mp4');

    const single = itemsFromMetadata('AboutBan1935', { metadata: { title: 'About Bananas', mediatype: 'movies' }, files: prelinger });
    expect(single).toHaveLength(1);
    expect(single[0]!.title).toBe('About Bananas');
  });

  it('skips dark and non-video items', () => {
    expect(itemsFromMetadata('x', { is_dark: true, metadata: { mediatype: 'movies' }, files: cartoon })).toEqual([]);
    expect(itemsFromMetadata('x', { metadata: { mediatype: 'audio' }, files: cartoon })).toEqual([]);
  });
});

describe('identifierFromLink', () => {
  it('reads the item from pasted archive.org links', () => {
    expect(identifierFromLink('https://archive.org/details/deathmatch-barbed-wire-wrestlin')).toBe('deathmatch-barbed-wire-wrestlin');
    expect(identifierFromLink(' archive.org/details/his_girl_friday?tab=about ')).toBe('his_girl_friday');
    expect(identifierFromLink('https://archive.org/download/commercials-clean/x.zip')).toBe('commercials-clean');
  });

  it('ignores ordinary searches', () => {
    expect(identifierFromLink('barbed wire deathmatch')).toBeNull();
    expect(identifierFromLink('archive.org')).toBeNull();
  });
});

describe('generic file names', () => {
  it('recognises names that say nothing', () => {
    for (const n of ['VTS_01_1', 'VTS 02 1', 'video', 'Tape 2', '3', 'VIDEO_TS']) expect(isGenericName(n)).toBe(true);
    for (const n of ['Duet S01E01 - Prelude', 'Bonanza s01e20', 'The Exorcist']) expect(isGenericName(n)).toBe(false);
  });

  it('names DVD-rip parts after the tape', () => {
    const files = ['VTS_01_1', 'VTS_01_2'].map((stem) => ({ name: `ABC 11-16-80 WOC/VIDEO_TS/${stem}.mp4`, format: 'h.264', length: '2640', size: '1000' }));
    const items = itemsFromMetadata('vts-01-1_20200818', { metadata: { mediatype: 'movies', title: 'ABC Primetime 11-16-80 WOC' }, files } as never);
    expect(items.map((i) => i.title)).toEqual(['ABC Primetime 11-16-80 WOC (part 1)', 'ABC Primetime 11-16-80 WOC (part 2)']);
    const untitled = itemsFromMetadata('vts-01-1_20220914', { metadata: { mediatype: 'movies', title: 'VTS 01 1' }, files } as never);
    expect(untitled[0]!.title).toBe('ABC 11-16-80 WOC (part 1)');
  });
});
