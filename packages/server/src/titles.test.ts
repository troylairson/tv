import { describe, expect, it } from 'vitest';
import { commercialTitle, looksLikeFilename, prettifyTitle, shortDescription } from './titles';

describe('prettifyTitle', () => {
  it('cleans dotted file names', () => {
    expect(prettifyTitle('Ken.Burns.The.Civil.War.5of9.The.Universe.Of.Battle')).toBe(
      'Ken Burns The Civil War (5 of 9) The Universe of Battle',
    );
    expect(prettifyTitle('The.Matrix.1999.1080p.BluRay.x264')).toBe('The Matrix (1999)');
    expect(prettifyTitle('Some_Show.S02E5.720p.mkv')).toBe('Some Show S02E05');
  });

  it('cleans IA file stems when told they are file names', () => {
    expect(prettifyTitle('s01e01 EntertheLoneRanger', { filename: true })).toBe('S01E01 Enterthe Lone Ranger');
    expect(prettifyTitle('ctvc_BAYER', { filename: true })).toBe('Ctvc BAYER');
    expect(prettifyTitle('Get Smart S01E01 (Mr. Big)', { filename: true })).toBe('Get Smart S01E01 (Mr. Big)');
  });

  it('leaves human titles alone', () => {
    for (const title of ['Dr. Sex.', 'Get Smart S01E01 (Mr. Big)', 'His Girl Friday (1940)', 'Patriotic Popeye', 'M*A*S*H']) {
      expect(prettifyTitle(title)).toBe(title);
    }
  });

  it('is idempotent', () => {
    const once = prettifyTitle('Ken.Burns.The.Civil.War.5of9.The.Universe.Of.Battle');
    expect(prettifyTitle(once)).toBe(once);
  });

  it('keeps decimal numbers', () => {
    expect(prettifyTitle('Episode.2.5.Special')).toBe('Episode 2.5 Special');
  });

  it('detects file names', () => {
    expect(looksLikeFilename('Ken.Burns.The.Civil.War')).toBe(true);
    expect(looksLikeFilename('Dr. Sex.')).toBe(false);
    expect(looksLikeFilename('Popeye')).toBe(false);
  });
});

describe('commercialTitle', () => {
  it('strips years, numbering and "commercial" suffixes', () => {
    expect(commercialTitle('Commercials/2003/[2003] Goodyear Tires - Stopping Power Balls in Street.mp4')).toEqual({
      title: 'Goodyear Tires - Stopping Power Balls in Street',
      year: 2003,
    });
    expect(commercialTitle('Commercials/2012/087 - Progressive Ad Featuring Sonic the Hedgehog.mp4').title).toBe(
      'Progressive Ad Featuring Sonic the Hedgehog',
    );
    expect(commercialTitle('Commercials/2002/045 - Super Mario Sunshine US Commercial.mp4').title).toBe('Super Mario Sunshine');
    expect(commercialTitle('Commercials/2004/2004 Doom 3 Xbox TV Spot.mp4').title).toBe('Doom 3 Xbox');
    expect(commercialTitle('Commercials/2009/Lego city - 3.mp4').title).toBe('Lego city');
    expect(commercialTitle('Commercials/2003/Tony Hawk_s Underground.mp4').title).toBe("Tony Hawk's Underground");
    expect(commercialTitle('Commercials/2005/Mario vs. Donkey Kong for Nintendo DS - Commercial⧸Advert.mp4').title).toBe(
      'Mario vs. Donkey Kong for Nintendo DS',
    );
    expect(commercialTitle('Commercials/Holiday Commercials/Santa.mp4')).toEqual({ title: 'Santa', year: undefined });
  });
});

describe('shortDescription', () => {
  it('strips HTML and the uploader talking', () => {
    expect(
      shortDescription('<div>Joe Friday and Bill Gannon investigate a string of burglaries.</div><div>Uploaded by me from my VHS collection. Visit http://example.com</div>'),
    ).toBe('Joe Friday and Bill Gannon investigate a string of burglaries.');
  });
  it('decodes entities and keeps initials inside a sentence', () => {
    expect(shortDescription('Directed by B. Reeves Eason &amp; Otto Brower, starring Gene Autry as himself.')).toBe(
      'Directed by B. Reeves Eason & Otto Brower, starring Gene Autry as himself.',
    );
  });
  it('drops descriptions that only repeat the title', () => {
    expect(shortDescription('Flash Gordon Complete Serial', 'Flash Gordon: The Complete Serial')).toBeUndefined();
    expect(shortDescription('These are episodes from a serial in the Public Domain.')).toBeUndefined();
  });
  it('cuts long text at a sentence end', () => {
    const text = `${'A fine opening sentence about the show and its cast. '.repeat(3)}${'More words '.repeat(40)}`;
    const out = shortDescription(text)!;
    expect(out.length).toBeLessThanOrEqual(240);
    expect(out.endsWith('cast.')).toBe(true);
  });
});
