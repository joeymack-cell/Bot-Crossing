import test from 'node:test';
import assert from 'node:assert/strict';
import { historyView, projectIdentity } from './history.js';
const now=1800000000000, day=86400000;
const t=(id,days,extra={})=>({id,project:'Sample Project',harness:'codex',lastActivityAt:now-days*day,...extra});
test('history hides older work, keeps running and pinned sessions, and expands without losing projects',()=>{
 const rows=[t('new',1),t('old',20),t('mechanic',80),t('active',30,{running:true}),t('pinned',80,{starred:true}),t('archived',1,{archived:true,project:'Websites'})];
 const view=historyView(rows,{now,days:14,kept:['mechanic'],archived:['new']});
 assert.deepEqual(view.visible.map(t=>t.id),['new','mechanic','active','pinned']);
 assert.deepEqual(view.projects,['Sample Project','Websites']);
 assert.equal(view.hiddenCount,1);
 assert.deepEqual(view.archived.map(t=>t.id),['archived']);
 assert.equal(historyView(rows,{now,days:0}).visible.length,5);
 assert.equal(historyView(rows,{now,days:1}).visible.length,3);
});
test('cutoff boundary is inclusive and older projects retain headquarters',()=>{
 const view=historyView([t('boundary',14),t('older',14.01),t('ancient',300,{project:'Mechanic'})],{now,days:14});
 assert.deepEqual(view.visible.map(t=>t.id),['boundary']);
 assert.equal(view.projects.length,2);
});
test('project signs infer requested badges and preserve user choices',()=>{
 assert.equal(projectIdentity('Websites').badge,'website');
 assert.equal(projectIdentity('Example Business').badge,'business');
 assert.equal(projectIdentity('mechanic').icon,'🔧');
 assert.equal(projectIdentity('Websites',{badge:'coast',displayName:'Sample Project'}).displayName,'Sample Project');
 assert.equal(projectIdentity('Websites',{badge:'bad'}).badge,'website');
});
