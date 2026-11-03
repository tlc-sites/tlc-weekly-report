import {register} from 'node:module';
// 원본 .ts를 그대로 불러온다. 상대 경로 import(./group-display, ./team-session 등)는 tsx-loader가 해석한다.
register('./tsx-loader.mjs',import.meta.url);
export const {weeklyBlocks,weeklyEmailHtml,reportSummaryLines}=await import('../src/lib/weekly-summary.ts');
