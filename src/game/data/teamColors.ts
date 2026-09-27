/** Primary / secondary uniform colors per club, keyed by Stats API abbreviation. */
const COLORS: Record<string, [string, string]> = {
  AZ: ['#A71930', '#E3D4AD'], ARI: ['#A71930', '#E3D4AD'],
  ATL: ['#CE1141', '#13274F'], BAL: ['#DF4601', '#000000'],
  BOS: ['#BD3039', '#0C2340'], CHC: ['#0E3386', '#CC3433'],
  CWS: ['#27251F', '#C4CED4'], CIN: ['#C6011F', '#FFFFFF'],
  CLE: ['#00385D', '#E50022'], COL: ['#33006F', '#C4CED4'],
  DET: ['#0C2340', '#FA4616'], HOU: ['#002D62', '#EB6E1F'],
  KC: ['#004687', '#BD9B60'], LAA: ['#BA0021', '#003263'],
  LAD: ['#005A9C', '#FFFFFF'], MIA: ['#00A3E0', '#EF3340'],
  MIL: ['#12284B', '#FFC52F'], MIN: ['#002B5C', '#D31145'],
  NYM: ['#002D72', '#FF5910'], NYY: ['#0C2340', '#C4CED3'],
  ATH: ['#003831', '#EFB21E'], OAK: ['#003831', '#EFB21E'],
  PHI: ['#E81828', '#002D72'], PIT: ['#27251F', '#FDB827'],
  SD: ['#2F241D', '#FFC425'], SF: ['#FD5A1E', '#27251F'],
  SEA: ['#0C2C56', '#005C5C'], STL: ['#C41E3A', '#0C2340'],
  TB: ['#092C5C', '#8FBCE6'], TEX: ['#003278', '#C0111F'],
  TOR: ['#134A8E', '#E8291C'], WSH: ['#AB0003', '#14225A'],
};

export function teamColors(abbr: string): [string, string] {
  return COLORS[abbr] ?? ['#3050c0', '#f0d020'];
}
