import { describe, expect, it } from 'vitest';
import { isMirrored, unmirror } from './mirror';

describe('unmirror', () => {
  it('turns mirrored file names round, keeping dates and part markers', () => {
    expect(unmirror('1997-4-13 lageL yleraB WCE')).toBe('1997-4-13 ECW Barely Legal');
    expect(unmirror('2000-12-3 teertS ht43 no ercassaM WCE .cd1')).toBe('2000-12-3 ECW Massacre on 34th Street .cd1');
    expect(unmirror('1999-3-21 ylsuoregnaD gniviL WCE  .cd2')).toBe('1999-3-21 ECW Living Dangerously  .cd2');
    expect(unmirror('1998-8-2 evawtaeH WCE')).toBe('1998-8-2 ECW Heatwave');
  });

  it('turns mirrored descriptions round', () => {
    expect(unmirror('.gniltserW pihsnoipmahC emertxE sa denetsirhcer saw noitomorp eht ,namyeH rednU')).toBe(
      'Under Heyman, the promotion was rechristened as Extreme Championship Wrestling.',
    );
  });

  it('leaves ordinary titles alone', () => {
    for (const t of ['2001-1-7 ECW Guilty as Charged .cd1', 'Mr. Robinson Crusoe', 'WWF Superstars of Wrestling Nov 11 1989', 'Bonanza S01E01', 'Private Life of a Cat', 'ABC Primetime 11-30-80'])
      expect(unmirror(t)).toBe(t);
  });

  it('in a mirrored item, flips titles mirrored word by word', () => {
    expect(unmirror('WCE Yap Rep Weiv', { mirroredItem: true })).toBe('ECW Pay Per View');
    expect(unmirror('2001-1-7 ECW Guilty as Charged .cd1', { mirroredItem: true })).toBe('2001-1-7 ECW Guilty as Charged .cd1');
  });

  it('spots a mirrored item', () => {
    expect(isMirrored(['WCE Yap Rep Weiv', '1997-4-13 lageL yleraB WCE', '1998-8-2 evawtaeH WCE', '2001-1-7 ECW Guilty as Charged .cd1'])).toBe(true);
    expect(isMirrored(['Bonanza', 'Bonanza S01E01 A Rose for Lotta', 'Bonanza S01E02 Death on Sun Mountain'])).toBe(false);
  });
});

describe('backwards initials', () => {
  it('puts reversed network and promotion initials right', () => {
    expect(unmirror('WCE on NNT (RE-C-DUB) (540p)')).toBe('ECW on TNN (RE-C-DUB) (540p)');
    expect(unmirror('Fan-made restoration of WCE Wrestling on NNT, piecing together the episodes')).toBe('Fan-made restoration of ECW Wrestling on TNN, piecing together the episodes');
    expect(unmirror('1997-4-13 lageL yleraB WCE')).toBe('1997-4-13 ECW Barely Legal');
    for (const t of ['ABC Primetime', 'WWF Superstars', 'The CIA Files', 'NBA Finals 1986']) expect(unmirror(t)).toBe(t);
  });
});
