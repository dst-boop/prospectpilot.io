import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stagingPage} from '../scripts/staging-ui.mjs';
const read=f=>readFileSync(new URL('../'+f,import.meta.url),'utf8');
test('staging import modal discloses exact fixture restriction before both input modes',()=>{
 const html=stagingPage(read('prospect.html'));
 const modal=html.slice(html.indexOf('<form id="importForm">'),html.indexOf('</form>',html.indexOf('<form id="importForm">')));
 assert.match(modal,/<h2>Import the fictional test CSV<\/h2>/);
 assert.match(modal,/Only the supplied, unchanged fictional CSV is accepted/);
 assert.match(modal,/<a href="\/staging-fixture.csv">Download fictional-staging.csv<\/a>/);
 assert.match(modal,/without editing or re-saving/);
 assert.match(modal,/including the header and both rows/);
 assert.match(modal,/Real contacts, provider exports, contact exports and row reports are not accepted/);
 assert.ok(modal.indexOf('id="stagingFixtureOnly"')<modal.indexOf('id="csvFile"'));
 for(const id of ['csvFile','csvText'])assert.match(modal,new RegExp('id="'+id+'" aria-describedby="stagingFixtureOnly"'));
 assert.doesNotMatch(modal,/Up to 5,000|placeholder="First Name,Last Name,Company,Email"/);
 assert.match(modal,/Preview does not save contacts/);
});
test('original production HTML untouched; unrelated staging pages still render',()=>{
 assert.match(read('prospect.html'),/<h2>Import professional contacts<\/h2>/);
 assert.doesNotMatch(read('prospect.html'),/id="stagingFixtureOnly"/);
 assert.match(stagingPage(read('prospect.html').replace('ProspectPilot — Contacts','Renamed contacts')),/id="stagingFixtureOnly"/);
 for(const file of ['lab.html','audience.html'])assert.ok(stagingPage(read(file)).includes('Fictional exercise'));
});
test('changed import markup fails closed instead of silently losing disclosure',()=>{
 assert.throws(()=>stagingPage(read('prospect.html').replace('CSV file<input id="csvFile"','Different<input id="csvFile"')),/disclosure adapter needs review/);
});
