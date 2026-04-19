const GRADE_COLORS: Record<string, string> = { 'A+': '#4c1', A: '#4c1', B: '#97ca00', C: '#dfb317', D: '#e05', F: '#e05' };

export function generateBadgeSvg(grade: string, score: number): string {
  const color = GRADE_COLORS[grade] ?? '#9f9f9f';
  const value = `${grade} (${score})`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="20">
  <rect width="45" height="20" fill="#555"/>
  <rect x="45" width="75" height="20" fill="${color}"/>
  <g fill="#fff" text-anchor="middle" font-family="DejaVu Sans,Verdana,Geneva,sans-serif" font-size="11">
    <text x="22" y="14">grasp</text>
    <text x="82" y="14">${value}</text>
  </g>
</svg>`;
}

export async function getBadgeForRepo(_owner: string, _repo: string): Promise<string> {
  return generateBadgeSvg('?', 0);
}
