import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { Presentation, PresentationFile } from '@oai/artifact-tool';

const skill='E:/Data/Codex/home/plugins/cache/openai-primary-runtime/presentations/26.904.11930/skills/presentations';
const root='E:/roguems-laya/deck';
const build=path.join(root,'.build','htn-teaching');
const final=path.join(root,'output','One_Forward_Pass_Then_A_Plan_v3.pptx');
const runtimePython='C:/Users/marowe/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe';
const {finalizePresentation}=await import(pathToFileURL(path.join(skill,'container_tools/artifact_tool_utils.mjs')).href);
await fs.mkdir(build,{recursive:true});
await fs.mkdir(path.dirname(final),{recursive:true});
const C={bg:'#101827',ink:'#F4F7FB',dim:'#AABBD0',line:'#3B4A5D',mint:'#72E0BC',blue:'#86B8FF',amber:'#FFD193',coral:'#FF9F91',panel:'#192638'};
const p=Presentation.create({slideSize:{width:1280,height:720}});
const font='Aptos',mono='Consolas';
function t(s,str,x,y,w,h,size=28,color=C.ink,bold=false,face=font){
 const q=s.shapes.add({geometry:'textbox',position:{left:x,top:y,width:w,height:h},fill:'none',line:{fill:'none',width:0}});
 q.text=str;q.text.style={typeface:face,fontSize:size,color,bold,autoFit:'none',wrap:true,verticalAlignment:'middle'};return q;
}
function rect(s,x,y,w,h,fill=C.panel){return s.shapes.add({geometry:'rect',position:{left:x,top:y,width:w,height:h},fill,line:{fill:'none',width:0}})}
function line(s,y){rect(s,68,y,1144,2,C.line)}
function base(title,n){const s=p.slides.add();s.background.fill=C.bg;t(s,title,68,36,1145,80,42,C.ink,true);line(s,126);t(s,`LayA · RogueRNG    ${n}/8`,68,673,1120,24,16,C.dim);return s}
function note(s,str){s.speakerNotes.textFrame.setText(str)}
function code(s,str,x,y,w,h,size=23){rect(s,x,y,w,h,C.panel);t(s,str,x+22,y+13,w-44,h-26,size,C.ink,false,mono)}

// 1. Concrete decision boundary.
{
 const s=base('When is one decision enough?',1);
 t(s,'This turn',70,173,360,42,28,C.mint,true);
 t(s,'Fight, heal, flee, explore',70,225,1080,62,34,C.ink);
 t(s,'One answer → validate against current facts → act',70,303,1100,65,29,C.dim);
 line(s,394);
 t(s,'Across turns',70,423,360,42,28,C.blue,true);
 t(s,'Leave dungeon, do chores, buy key, return to depth 2',70,476,1120,80,31,C.ink);
 t(s,'Keep a goal until the world says each step is done',70,574,1100,61,28,C.dim);
 note(s,'About 45 seconds. The game gives us two kinds of decisions. Fighting or healing is a choice for this turn. A trip to town is an outcome that needs multiple state changes, and interruptions may happen along the way. That is the dividing line: use a typed judgment plus direct policy for the first kind; use a goal and ordered tasks for the second. Source: bridge/matrix.py, game/src/laya/policy.js, game/src/laya/planner.js.');
}
// 2. Actual matrix code.
{
 const s=base('matrix.py: three question types',2);
 t(s,'Excerpt from GAME_QUESTIONS',70,152,1040,34,22,C.dim,true);
 code(s,'"intent": Choice(\n  "What single move should the adventurer make this turn?",\n  {"fight": "strike a monster", "heal": "use healing", ...}),\n\n"threat": Score(\n  "How dangerous is this turn?",\n  ["harmless", "tense", "dangerous", "lethal"]),\n\n"pack_needs_tending": Noul(\n  "Should the adventurer go to town soon?")',68,200,1144,385,23);
 t(s,'1 Choice (11 intents)  +  1 Score (0–3)  +  5 Noul probabilities  =  7 answers',70,605,1135,49,24,C.mint,true);
 note(s,'About 65 seconds. This is the code I would actually show. Choice picks among eleven intent labels and returns a distribution. Score positions the situation on an ordered danger scale. Noul asks a strict binary proposition and returns P(true). The slide excerpts shorten the descriptions and omit four Noul questions; matrix.py contains the full schema. All seven are submitted in one predict call and one model forward pass. One pass does not imply identical latency to a single question, and the current checkpoint’s confidence should not be described as calibrated for this game. Demo cue: open bridge/matrix.py. Source: local bridge/matrix.py; upstream Laya: https://github.com/NandhaKishorM/laya .');
}
// 3. Real answer and direct use.
{
 const s=base('A typed answer can stay simple',3);
 t(s,'Pasted demo output · one call',70,155,1050,38,23,C.dim,true);
 code(s,'intent        explore  (0.26)\nthreat        1.79 / 3\nhp_critical   0.25\novermatched   0.23',68,210,510,290,22);
 t(s,'Direct policy checks (simplified)',632,155,570,38,23,C.blue,true);
 code(s,'if (f.hpRatio < 0.35)\n  return healOrFlee(f);\n\nif (decision.overmatched > 0.7\n    && f.hpRatio < 0.6 && !f.adj.length)\n  return fleeAction(f);',616,210,596,290,22);
 line(s,533);
 t(s,'Use this when the action can be chosen and checked from the current state.',70,561,1120,75,28,C.mint,true);
 note(s,'About 60 seconds. The left side is an example output supplied with the presenter’s pasted text, not a fresh benchmark from this run. The right side is a shortened version of actual policy checks. The game is below the 35 percent HP safety threshold? Heal or flee. The model says overmatched above 0.7 and the factual conditions agree? Flee. These decisions do not need a long plan. The model proposes a typed signal; code validates and executes. The full policy also has an intent confidence floor and deterministic fallback. Demo cue: run bridge/demo.py or open one live dashboard decision. Sources: pasted text and local game/src/laya/policy.js.');
}
// 4. Goal method and decomposition.
{
 const s=base('When the outcome needs a path',4);
 t(s,'A goal has a trigger and a method',70,158,1080,43,28,C.mint,true);
 code(s,'unpack: bag.length >= 18\n  → gohome → chores → resume\n\nhaveKey: locked chest && no key && gold >= 55\n  → gohome → buy key → resume',68,225,1144,260,25);
 line(s,519);
 t(s,'LayA can also arm a goal',70,549,700,49,30,C.blue,true);
 t(s,'packNeedsTending > 0.75 + bag/gold facts → tending goal',70,600,1120,49,26,C.ink);
 note(s,'About 60 seconds. These are the real goal methods, simplified into readable lines. unpack and haveKey are separate reasons for going to town. Each declares a trigger and a task sequence. The model’s packNeedsTending probability can also arm a tending goal, but only with additional dungeon and bag or gold facts. The planner does not ask LayA to invent this path. The decomposition is authored in planner.js. This matters when the outcome spans many turns or map transitions; a single intent like “travel” cannot remember why we traveled or where to return. Source: local game/src/laya/planner.js.');
}
// 5. Explicit graph and merge.
{
 const s=base('Three goals merge into one path',5);
 t(s,'ACTIVE GOALS',70,159,465,36,23,C.dim,true);
 t(s,'unpack     resupply     haveKey',70,208,1080,52,30,C.amber,true);
 t(s,'↓  shared tasks run once; resume goes last',70,293,1100,51,27,C.mint,true);
 line(s,374);
 const xs=[70,358,646,934], labels=['1  gohome','2  chores','3  buy key','4  resume'];
 for(let i=0;i<4;i++){
  rect(s,xs[i],425,245,100,C.panel);t(s,labels[i],xs[i]+14,443,218,64,25,C.ink,true);
  if(i<3)t(s,'→',xs[i]+247,449,40,50,28,C.blue,true);
 }
 t(s,'Result: one town visit, then return to the saved dungeon depth.',70,570,1120,68,28,C.ink);
 note(s,'About 65 seconds. Here is the graph the earlier explanation alluded to. The three goal methods all ask for some overlapping steps. mergePlans sorts active goals by weight, deduplicates shared gohome and chores steps, retains buy key, and hoists the terminal resume task to the end. The resulting path is one trip. The code also handles a descend task specially so a terminal resume is not added when we are already diving deeper. This is HTN-style method decomposition and plan merging, not graph search or an automatically synthesized plan. Source: local game/src/laya/planner.js, mergePlans.');
}
// 6. Execution over time.
{
 const s=base('How the chain survives each turn',6);
 t(s,'Execution loop (simplified)',70,144,1000,34,21,C.dim,true);
 code(s,'const step = plan.steps[plan.i]\nif (step.done(f)) plan.i++\nelse return step.act(f)\n// next turn: read fresh facts, repeat',68,190,1144,259,25);
 t(s,'Example done checks',70,479,1050,39,23,C.blue,true);
 t(s,'gohome: mapKind === "town"     resume: same zone and depth reached',70,526,1135,67,26,C.ink);
 t(s,'Safety can interrupt; the goal remains. 400-tick fuse and 80-tick cooldown bound stalls.',70,605,1135,51,21,C.dim);
 note(s,'About 65 seconds. This is the step the original deck skipped. The planner keeps a plan in working memory, points to the head task, tests its done predicate against fresh game facts, and advances only when the world has changed enough. It skips later tasks already completed on the way. If combat appears, the action layer can fight through the plan, while the plan remains. The code has a 400-tick fuse per task and an 80-tick cooldown on completed goals. For general workflows, this is the key design rule: chain by observable completion conditions, not by a fixed delay or by assuming the previous call succeeded. Source: local game/src/laya/planner.js and game/src/laya/policy.js.');
}
// 7. Bridge to model routing.
{
 const s=base('The same boundary in model routing',7);
 t(s,'Simple decision',70,168,400,45,28,C.mint,true);
 t(s,'Which eligible model suits this task?',70,223,1050,65,32,C.ink);
 line(s,329);
 t(s,'Chained work',70,365,400,45,28,C.blue,true);
 t(s,'plan → choose model → execute → verify → retry or escalate',70,422,1120,78,30,C.ink);
 line(s,541);
 t(s,'Replace broad size tiers with task-specific evidence, then check the outcome.',70,570,1120,76,27,C.amber,true);
 note(s,'About 50 seconds. The same distinction applies outside the game. A classifier may choose among eligible models for one bounded task. But a work item with planning, tool use, verification and repair needs a chain whose steps have observable success criteria. In the working-skills repository, current planning uses broad size tiers; a future classifier could consider task type, context, tools, quality requirements, latency and cost, based on measured outcomes. This is a proposed extension, not a current integration. A claim that Opus or Sol is better requires task-specific eval evidence. Source for tier practice: presenter description; game mechanics: local bridge/matrix.py and game/src/laya/planner.js.');
}
// 8. Domain close.
{
 const s=base('A decision head trained for the domain',8);
 t(s,'Collect labeled decisions from one client or industry workflow',70,175,1110,80,31,C.ink);
 t(s,'→  Train the typed classifier on the recurring judgments',70,304,1100,72,30,C.mint,true);
 t(s,'→  Test quality, calibration, latency, cost and fallback on held-out cases',70,416,1120,93,28,C.blue,true);
 line(s,546);
 t(s,'Where would a fast specialist earn authority in your workflow?',70,576,1100,73,29,C.amber,true);
 note(s,'Close, about 45 seconds. The game is the teaching example. The broader experiment is to label a recurring decision for a client or an industry, train or adapt a typed decision head, and test it on held-out cases. Start with recommendation authority and promote only when its quality and calibration support that role. Keep the task planner, factual guards, and escalation path explicit. Ask the team which bounded, high-volume judgment would be worth testing first. Upstream Laya describes fine-tuning and cautions against using the base checkpoint as a zero-shot production decider. Source: https://github.com/NandhaKishorM/laya .');
}

const candidate=path.join(build,'candidate.pptx');
await (await PresentationFile.exportPptx(p)).save(candidate);
for(let i=0;i<p.slides.items.length;i++){
 const b=await p.export({slide:p.slides.items[i],format:'png',scale:1});
 await fs.writeFile(path.join(build,`slide-${i+1}.png`),new Uint8Array(await b.arrayBuffer()));
}
const result=await finalizePresentation({workspaceDir:root,candidatePath:candidate,finalPath:final,
 explicitTotalSlideCount:8,requiredNativeTableOwnerSlides:[],requiredNativeChartOwnerSlides:[],
 pythonExecutable:runtimePython,
 integrityValidatorPath:path.join(skill,'container_tools/inspect_presentation_package_integrity.py'),
 layoutValidatorPath:path.join(skill,'container_tools/inspect_presentation_layout_geometry.py'),
 layoutArgs:['--expected-slide-size-emu','12192000,6858000','--validate-heading-fit'],
 fontPolicy:{basis:'design',families:[font,mono]},verifyArtifactToolImport:true,
 receiptPath:path.join(build,'validation-v3.json')});
console.log(JSON.stringify({final,result},null,2));
