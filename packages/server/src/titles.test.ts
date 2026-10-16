import { describe, expect, it } from 'vitest';
import { commercialTitle, looksLikeFilename, prettifyTitle, shortDescription, splitTitle } from './titles';

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

describe('splitTitle', () => {
  it.each([
    ['Get Smart S01E02 (Diplomat\'s Daughter)', undefined, 'Get Smart', "S1E2 · Diplomat's Daughter"],
    ['S01e03The Lone Rangers Triumph', 'The Lone Ranger', 'The Lone Ranger', 'S1E3 · The Lone Rangers Triumph'],
    ['Bonanza S01E19', 'Bonanza', 'Bonanza', 'S1E19'],
    ['Green Acres - 001 - Oliver Buys a Farm', 'Green Acres Complete Series', 'Green Acres', 'Ep. 1 · Oliver Buys a Farm'],
    ['Ken Burns The Civil War (3 of 9) Forever Free', 'Ken Burns The Civil War', 'Ken Burns The Civil War', 'Part 3 of 9 · Forever Free'],
    ['01 a New Germany (1933–1939)', 'The World at War', 'The World at War', 'Ep. 1 · A New Germany (1933–1939)'],
    ['Dragnet - The Big Con', 'Dragnet', 'Dragnet', 'The Big Con'],
    ['1962-01-02 - Password (CBS Primetime) - S01E01 - Carol Burnett & Garry Moore', undefined, 'Password (CBS Primetime)', 'S1E1 · Carol Burnett & Garry Moore'],
    ['002 - Felix the Cat - S01E02 - Into Outer Space', 'Felix the Cat', 'Felix the Cat', 'S1E2 · Into Outer Space'],
    ['1950-10-05 {50-01L01}[1950-10-05] You Bet Your Life (S04E01) SW=Wall', 'You Bet Your Life', 'You Bet Your Life', 'S4E1 · SW=Wall'],
    ['Bonanza - The Abduction Ep 2x08', undefined, 'Bonanza', 'S2E8 · The Abduction'],
    ['01-07-95 - 1 - Saturday Night', 'WCW Saturday Night 1995', 'WCW Saturday Night 1995', '01-07-95 · Saturday Night'],
    ['S00E00 - Here Comes the Nelsons (1952 Movie)', 'The Adventures of Ozzie and Harriet (The Complete Series) [1952 - 1966]', 'The Adventures of Ozzie and Harriet', 'Special · Here Comes the Nelsons (1952 Movie)'],
    ['Annie Oakley S01E01-ANNIE AND THE BRASS COLLAR [360p]', undefined, 'Annie Oakley', 'S1E1 · Annie and the Brass Collar'],
    ['S01E186 to Tell the Truth 1970 04 21 0381', 'To Tell the Truth (1969)', 'To Tell the Truth', 'S1E186 · 1970 04 21 0381'],
    ['01-01 - Life Begins for Andy Panda (1939)', "Woody Woodpecker & Friends: The Collector's Edition", 'Woody Woodpecker & Friends', 'S1E1 · Life Begins for Andy Panda (1939)'],
    ['The Rifleman TV 1958 colorized s01e01 The Sharpshooter', 'The Rifleman', 'The Rifleman', 'S1E1 · The Sharpshooter'],
    ['01 - Baseball Bugs', 'LOONEY TUNES COLLECTION', 'Looney Tunes', 'Ep. 1 · Baseball Bugs'],
  ])('%s', (title, collection, show, episode) => {
    expect(splitTitle(title, collection)).toEqual({ show, episode });
  });
  it('leaves movies and one-offs alone', () => {
    expect(splitTitle('His Girl Friday')).toBeNull();
    expect(splitTitle('Patriotic Popeye', 'Patriotic Popeye')).toBeNull();
    expect(splitTitle('Plan 9 from Outer Space')).toBeNull();
    expect(splitTitle('Fifties Advertising: UNIVAC Computer Commercial (Ad 2 of 2)')).toBeNull();
  });
});
