/** Trimmed-down responses in the exact shape the MLB Stats API returns. */
export const TEAMS_JSON = {
  teams: [
    { id: 147, name: 'New York Yankees', abbreviation: 'NYY', teamName: 'Yankees', sport: { id: 1 }, active: true },
    { id: 111, name: 'Boston Red Sox', abbreviation: 'BOS', teamName: 'Red Sox', sport: { id: 1 }, active: true },
    { id: 999, name: 'Some Minor Club', abbreviation: 'MIN', teamName: 'Minors', sport: { id: 11 }, active: true },
  ],
};

const hit = (stat: Record<string, string | number>) => ({ group: { displayName: 'hitting' }, splits: [{ stat }] });
const pit = (stat: Record<string, string | number>) => ({ group: { displayName: 'pitching' }, splits: [{ stat }] });

export const ROSTER_JSON = {
  roster: [
    {
      jerseyNumber: '99',
      position: { abbreviation: 'RF', type: 'Outfielder' },
      person: {
        id: 1, fullName: 'Aaron Slugger', firstName: 'Aaron', lastName: 'Slugger',
        batSide: { code: 'R' }, pitchHand: { code: 'R' },
        stats: [hit({ plateAppearances: 650, atBats: 540, hits: 170, doubles: 30, triples: 1, homeRuns: 50, baseOnBalls: 100, strikeOuts: 150, stolenBases: 8 })],
      },
    },
    {
      jerseyNumber: '2',
      position: { abbreviation: 'SS', type: 'Infielder' },
      person: {
        id: 2, fullName: 'Slappy Speedster', firstName: 'Slappy', lastName: 'Speedster',
        batSide: { code: 'L' }, pitchHand: { code: 'R' },
        stats: [hit({ plateAppearances: 600, atBats: 560, hits: 140, doubles: 20, triples: 8, homeRuns: 2, baseOnBalls: 25, strikeOuts: 90, stolenBases: 45 })],
      },
    },
    {
      jerseyNumber: '45',
      position: { abbreviation: 'P', type: 'Pitcher' },
      person: {
        id: 3, fullName: 'Gerrit Ace', firstName: 'Gerrit', lastName: 'Ace',
        batSide: { code: 'R' }, pitchHand: { code: 'R' },
        stats: [pit({ inningsPitched: '190.1', earnedRuns: 55, strikeOuts: 230, baseOnBalls: 40, hits: 140, homeRuns: 20, gamesStarted: 31, gamesPitched: 31 })],
      },
    },
    {
      jerseyNumber: '17',
      position: { abbreviation: 'C', type: 'Catcher' },
      person: { id: 4, fullName: 'Rookie Callup', firstName: 'Rookie', lastName: 'Callup', batSide: { code: 'S' }, pitchHand: { code: 'R' } },
    },
    {
      jerseyNumber: '17',
      position: { abbreviation: 'TWP', type: 'Two-Way Player' },
      person: {
        id: 5, fullName: 'Shohei Both', firstName: 'Shohei', lastName: 'Both',
        batSide: { code: 'L' }, pitchHand: { code: 'R' },
        stats: [
          hit({ plateAppearances: 700, atBats: 600, hits: 180, doubles: 30, triples: 5, homeRuns: 45, baseOnBalls: 90, strikeOuts: 160, stolenBases: 20 }),
          pit({ inningsPitched: '40.0', earnedRuns: 12, strikeOuts: 50, baseOnBalls: 10, hits: 30, gamesStarted: 8, gamesPitched: 8 }),
        ],
      },
    },
  ],
};
