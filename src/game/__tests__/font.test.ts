import { toGlyphText } from '../render/font';

describe('pixel font text', () => {
  it('drops accents so names draw instead of showing "?"', () => {
    expect(toGlyphText('J. Ramírez')).toBe('J. RAMIREZ');
    expect(toGlyphText('José Muñoz')).toBe('JOSE MUNOZ');
    expect(toGlyphText('Á. Ortíz')).toBe('A. ORTIZ');
  });

  it('keeps length, so centred text stays centred', () => {
    expect(toGlyphText('Rodríguez')).toHaveLength('Rodríguez'.length);
  });

  it('turns curly apostrophes into the font’s straight one', () => {
    expect(toGlyphText('O’Hearn')).toBe("O'HEARN");
  });
});
