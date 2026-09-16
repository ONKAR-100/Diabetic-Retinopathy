export const gradeNames:Record<number,string>={0:'No DR',1:'Mild DR',2:'Moderate DR',3:'Severe DR',4:'Proliferative DR'};
export const pct=(x:number)=>Math.round(x*100)+'%';
export const cn=(...xs:(string|false|null|undefined)[])=>xs.filter(Boolean).join(' ');
