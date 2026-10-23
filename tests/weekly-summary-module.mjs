import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
const source=stripTypeScriptTypes(readFileSync(new URL('../src/lib/weekly-summary.ts',import.meta.url),'utf8').replace('"./group-display"',JSON.stringify(new URL('../src/lib/group-display.ts',import.meta.url).href)));
export const {weeklyBlocks,weeklyEmailHtml,reportSummaryLines}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
