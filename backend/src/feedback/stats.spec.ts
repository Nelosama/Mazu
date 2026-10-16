import { categorize, meanWithInterval, wilsonInterval } from './stats';

describe('feedback stats', () => {
  it('wilson interval is wide for small samples', () => {
    const small = wilsonInterval(2, 2)!;
    const large = wilsonInterval(200, 200)!;
    expect(small.low).toBeLessThan(0.4);
    expect(large.low).toBeGreaterThan(0.98);
  });

  it('flags small samples as unreliable', () => {
    expect(meanWithInterval([5, 5, 4]).reliable).toBe(false);
    expect(meanWithInterval(Array(12).fill(4)).reliable).toBe(true);
    expect(meanWithInterval([]).mean).toBeNull();
  });

  it('categorizes comments by keywords in es/en', () => {
    expect(categorize('La espera fue larga y el precio caro')).toEqual(['waiting_time', 'price']);
    expect(categorize('Very friendly staff')).toEqual(['attention']);
    expect(categorize(null)).toEqual([]);
  });
});
