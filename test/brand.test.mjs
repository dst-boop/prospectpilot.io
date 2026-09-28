import test from 'node:test';import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=file=>readFileSync(new URL('../'+file,import.meta.url),'utf8');

test('every page shows the ProspectPilot logo and uses it as the browser icon',()=>{
 const pages=['home.html','login.html','lab.html','prospect.html','warn.html','linkedin.html','source/discovery.html','source/research.html','source/enrichment.html','source/beta.html','source/wealthfeed.html'];
 for(const page of pages){
  const html=read(page);
  assert.match(html,/<link rel="icon" href="\/brand.svg" type="image\/svg\+xml">/,`${page} sets the logo as its icon`);
  assert.match(html,/<header[^>]*>.*?<img[^>]*src="\/brand.svg"[^>]*>.*?ProspectPilot/s,`${page} shows the logo beside the name`);
  assert.doesNotMatch(html,/brandmark">LQ<|brand-icon">P<|class="mark">P<|<b>P<\/b>/,`${page} has no leftover letter mark`);
 }
});

test('the logo is the brand navy and blue, and the palettes use the same two colors',()=>{
 const svg=read('brand.svg');
 assert.match(svg,/fill="#0c2149"/);assert.match(svg,/fill="#1570ef"/);assert.doesNotMatch(svg,/<script|href=/i,'static artwork only');
 for(const css of ['site.css','lab.css','prospect.css'])assert.match(read(css),/#1570ef/,`${css} uses the logo blue`);
 for(const css of ['lab.css','prospect.css'])assert.doesNotMatch(read(css),/--blue:#1b5544/,`${css} no longer uses the old green accent`);
});
