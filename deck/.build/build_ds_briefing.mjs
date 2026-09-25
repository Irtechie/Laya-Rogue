import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {Presentation,PresentationFile} from '@oai/artifact-tool';
const root='E:/roguems-laya/deck';
const build=path.join(root,'.build','ds-briefing');
const final=path.join(root,'output','LayA_HTN_Engineering_Briefing_v3.pptx');
const skill='E:/Data/Codex/home/plugins/cache/openai-primary-runtime/presentations/26.904.11930/skills/presentations';
const runtimePython='C:/Users/marowe/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe';
const {finalizePresentation}=await import(pathToFileURL(path.join(skill,'container_tools/artifact_tool_utils.mjs')).href);
await fs.mkdir(build,{recursive:true});await fs.mkdir(path.dirname(final),{recursive:true});
const C={bg:'#0C121B',surface:'#152131',ink:'#F2F6FA',muted:'#B2C1D1',line:'#395069',blue:'#86BDF4',mint:'#79DBB4',amber:'#F4CA7B',red:'#F49893'};
const font='Aptos',mono='Consolas',p=Presentation.create({slideSize:{width:1280,height:720}});
function sh(s,text,x,y,w,h,size=23,color=C.ink,bold=false,face=font){const q=s.shapes.add({geometry:'textbox',position:{left:x,top:y,width:w,height:h},fill:'none',line:{fill:'none',width:0}});q.text=text;q.text.style={typeface:face,fontSize:size,color,bold,autoFit:'none',wrap:true,verticalAlignment:'middle'};return q}
function bar(s,y,x=56,w=1168,color=C.line){s.shapes.add({geometry:'rect',position:{left:x,top:y,width:w,height:2},fill:color,line:{fill:'none',width:0}})}
function bg(s,x,y,w,h,color=C.surface){s.shapes.add({geometry:'rect',position:{left:x,top:y,width:w,height:h},fill:color,line:{fill:'none',width:0}})}
function base(title,n,kicker){const s=p.slides.add();s.background.fill=C.bg;sh(s,kicker.toUpperCase(),57,27,900,27,17,C.blue,true);sh(s,title,56,57,1166,66,37,C.ink,true);bar(s,133);sh(s,`${n} / 7   ·   LayA + RogueRNG   ·   engineering briefing`,56,676,1166,24,16,C.muted);return s}
function code(s,text,x,y,w,h,size=20){bg(s,x,y,w,h);sh(s,text,x+18,y+13,w-36,h-26,size,C.ink,false,mono)}
function notes(s,text){s.speakerNotes.textFrame.setText(text)}

// 1. Architecture and authority.
{
 const s=base('One turn through the decision stack',1,'System boundary');
 sh(s,'facts()  →  buildState()  →  Agent.predict(state, GAME_QUESTIONS)',57,176,1160,57,26,C.ink,false,mono);
 bar(s,254);
 sh(s,'7 typed answers',57,279,405,42,24,C.mint,true);
 sh(s,'plannerTick(f,d)',462,279,352,42,24,C.blue,true,mono);
 sh(s,'macroDecision(f,d)',835,279,380,42,24,C.amber,true,mono);
 sh(s,'choice distribution · threat expectation · five P(true) axes',57,333,1140,49,23,C.muted);
 bar(s,407);
 sh(s,'Authority boundary',57,433,370,45,24,C.blue,true);
 sh(s,'hard safety → model overmatch gate → active plan → factual macro checks → gated intent → fallback',57,483,1150,102,26,C.ink);
 sh(s,'The selected action reaches Core.act(); recovery may issue another. Telemetry records the model vote and execution owner.',57,603,1140,47,20,C.muted);
 notes(s,'About 50 seconds. Lead with the actual call order in game/src/laya.js. The bridge returns a typed decision; the planner may update persistent state; macroDecision chooses one action; commit invokes Core.act. The policy comment summarizes safety, plan, LayA and reflex, but the implementation has a model-derived overmatched flee branch before planStep and factual stair checks before the confidence-gated intent. The execution boundary is code, not the classifier. Sources: local game/src/laya.js, game/src/laya/policy.js, bridge/matrix.py.');
}
// 2. Inference semantics.
{
 const s=base('Seven rows in one model call',2,'Typed inference');
 sh(s,'matrix.py schema',57,164,500,38,23,C.blue,true);
 code(s,'Choice: intent ∈ 11 classes\nScore:  threat ∈ {0,1,2,3}\nNoul:   hpCritical, canKill,\n        objectiveReachable, overmatched,\n        packNeedsTending',57,214,650,262,21);
 sh(s,'Output semantics',746,164,470,38,23,C.mint,true);
 code(s,'pₖ = softmax(zₖ / T)\nintent = argmaxₖ pₖ\nthreat = Σₖ k · pₖ\nnoul = P(true)\nconf = 1 − H(p)/ln K',732,214,490,262,21);
 sh(s,'Confidence formula: Choice/Score; Noul uses max(p, 1−p).',733,480,490,24,16,C.muted);
 bar(s,508);
 sh(s,'Implementation detail',57,532,340,35,22,C.amber,true);
 sh(s,'One sequence per question → batch shape [7, L] → one encoder forward call. Input tokens exist; generated output tokens = 0.',57,574,1158,72,23,C.ink);
 notes(s,'About 65 seconds. Choice is a closed set of eleven intents. Score is the expected level under a four-level distribution. Each Noul returns P(true). In the local LayA agent, each question is tokenized with the state and its options, collated into seven batch rows, passed through the encoder once, then softmaxed per row. The normalized entropy confidence is not empirical accuracy; the eleven-option temperature bucket is clamped and should be treated as uncalibrated. One forward call does not mean seven questions cost the same as one; a one-versus-seven latency ablation is still needed. Source: local bridge/matrix.py and E:/layaplayground/laya/agent.py, common.py.');
}
// 3. Decision use.
{
 const s=base('A model score becomes a policy input',3,'Per-turn control');
 sh(s,'Representative typed response from the pasted demo',57,162,1120,39,22,C.muted,true);
 code(s,'intent = explore  (confidence 0.26)\nthreat = 1.79 / 3\novermatched = 0.23\npackNeedsTending = 0.25',57,214,566,240,22);
 code(s,'if (hpRatio < .35) healOrFlee();\nif (overmatched > .7 && hpRatio < .6\n    && noAdjacentMonster) flee();\nif (planStep(f)) usePlanAction();',651,214,570,240,21);
 sh(s,'Simplified policy excerpt',651,183,570,27,17,C.muted);
 bar(s,489);
 sh(s,'What the model did',57,514,495,36,22,C.mint,true);
 sh(s,'Produced numerical judgments for this state.',57,555,530,74,23,C.ink);
 sh(s,'What execution requires',651,514,540,36,22,C.amber,true);
 sh(s,'Factual preconditions, policy priority, and an actual Core.act call.',651,555,550,74,23,C.ink);
 notes(s,'About 55 seconds. The left sample is from the user-supplied pasted demo, not a fresh benchmark. The right code is simplified pseudocode matching the policy branches. A top intent of explore with confidence 0.26 is a vote, not evidence of correctness. The policy executes only what facts permit. A separate Noul probability can activate an HTN tending goal with bag or gold guards. Source: pasted demo, local game/src/laya/policy.js and planner.js.');
}
// 4. HTN contract.
{
 const s=base('HTN contract: trigger, method, task',4,'Long-horizon control');
 code(s,'GOAL = { id, weight, trig(f,d), tasks(f) }\nTASK = { id, done(f,st), act(f,st) }',57,165,1166,122,25);
 sh(s,'Authored decomposition',57,323,430,35,22,C.blue,true);
 code(s,'unpack:   bag.length ≥ 18\n          → gohome → chores → resume\n\nhaveKey:  locked chest ∧ no key ∧ gold ≥ 55\n          → gohome → buy:key → resume',57,371,1166,207,22);
 bar(s,603);
 sh(s,'In this planner, LayA supplies one guarded trigger:  P(packNeedsTending) > .75  ∧  dungeon  ∧  (bag ≥ 10 ∨ gold ≥ 90).',57,617,1166,45,19,C.mint);
 notes(s,'About 60 seconds. This is an HTN-style authored method library. Each goal has a trigger, weight and method; each primitive task has a live done predicate and act function. LayA does not synthesize a task graph. Most triggers are factual; tending uses the model axis plus additional facts. An intent is enough for a one-turn choice. A goal is needed when the desired outcome spans town travel, errands and a return to the saved dungeon depth. Source: local game/src/laya/planner.js, GOALS and TASKS.');
}
// 5. Merge and execution.
{
 const s=base('Merge once; advance on live completion',5,'Planner algorithm');
 sh(s,'Active goals by weight',57,164,430,35,22,C.blue,true);
 code(s,'unpack(60)   [home, chores, resume]\nresupply(55) [home, chores, resume]\nhaveKey(40)  [home, buy:key, resume]',57,210,1166,165,22);
 sh(s,'mergePlans → [home, chores, buy:key, resume]',57,405,1166,54,28,C.mint,true,mono);
 bar(s,483);
 sh(s,'Execution state',57,507,390,35,22,C.amber,true);
 sh(s,'steps[i] runs until done(f,st); already-complete later tasks are skipped. Safety can interrupt without clearing the plan.',57,548,1158,78,23,C.ink);
 sh(s,'Limit: age > 400 advances an unproven task; completed goals cool down for 80 ticks.',57,630,1166,32,18,C.red);
 notes(s,'About 65 seconds. This is a code-derived scenario, not an observed trace. Active goals are sorted by weight. mergePlans deduplicates home and chores by task key, includes buy:key once, and hoists resume to the end; descend suppresses resume. The plan is stored with current index. Each tick checks done against fresh facts; it is not continuously re-decomposed. The 400-tick fuse is an unverified skip, not success proof. Cooldown of 80 ticks prevents immediate re-arming. Source: local game/src/laya/planner.js.');
}
// 6. Data boundary.
{
 const s=base('What the recorded telemetry supports',6,'Historical local sample');
 sh(s,'runs/events.jsonl · mixed sessions from 23 Sep 2026',57,158,1140,39,21,C.muted);
 sh(s,'2,037',57,210,260,76,45,C.ink,true);
 sh(s,'logged turns',57,285,260,38,20,C.muted);
 sh(s,'122.6 ms',337,210,300,76,41,C.blue,true);
 sh(s,'median bridge latency · n=2,031',337,285,350,42,19,C.muted);
 sh(s,'206.4 ms',731,210,360,76,41,C.amber,true);
 sh(s,'95th percentile · n=2,031',731,285,370,42,19,C.muted);
 bar(s,355);
 sh(s,'Final action owner tags',57,380,520,37,23,C.mint,true);
 code(s,'macro  2,013    plan  14    reflex  6\nsafety     3    errand 1    laya    0',57,430,1166,111,23);
 sh(s,'Interpretation: this file shows a working loop dominated by deterministic actions. “via” does not capture indirect model influence on goal triggers.',57,564,1166,76,22,C.ink);
 notes(s,'About 65 seconds. These numbers come from parsing local runs/events.jsonl: 2,037 events over mixed historical sessions, 2,031 with latency, median 122.6 milliseconds and 95th percentile 206.4 milliseconds using the bridge/server.py percentile index rule. Final action via prefixes were macro 2,013, plan 14, reflex 6, safety 3, errand 1 and LayA 0. This file is not a controlled current benchmark, and its action-owner tags do not reveal whether a LayA axis indirectly armed a plan. Another earlier run snapshot reports some LayA action share, so avoid turning this mixed log into a global claim. The honest point is that telemetry separates model output from execution authority. Source: local runs/events.jsonl and bridge/server.py stats.');
}
// 7. Evaluation and transfer.
{
 const s=base('Transfer test: task routing and domain tuning',7,'Next experiment');
 sh(s,'Target workflow',57,167,450,36,22,C.blue,true);
 sh(s,'A bounded, recurring decision with labeled outcomes: route a task to an eligible model, or flag a case for escalation.',57,210,1166,87,26,C.ink);
 bar(s,324);
 sh(s,'Evaluation contract',57,349,475,36,22,C.mint,true);
 code(s,'baseline: current simple / small / medium / large route\nlabels: task type, context, tools, outcome\nmetrics: quality, calibration, latency, cost, fallback\ncompare: 1 vs 7 questions; classifier vs LLM route',57,395,1166,166,21);
 sh(s,'Promote authority only where held-out results justify it; retain explicit eligibility rules and verification.',57,589,1166,66,23,C.amber,true);
 notes(s,'Close in about 55 seconds. The game demonstrates the control architecture, not model-routing quality. In the working-skills repository, current difficulty tiers are broad. The next experiment is a task-specific labeled set that measures whether the classifier can recommend the right eligible model compared with that baseline and an LLM router. For a client or industry, train or adapt the typed head on its recurring decisions and test held-out quality and calibration. Evaluate the cost of seven batched questions against one question rather than assuming equivalence. Preserve tool eligibility, fallback and verification. Source for current tier practice: presenter description; technical architecture: local bridge/matrix.py, game/src/laya/planner.js, and upstream LayA code.');
}

const candidate=path.join(build,'candidate.pptx');await (await PresentationFile.exportPptx(p)).save(candidate);
for(let i=0;i<p.slides.items.length;i++){const b=await p.export({slide:p.slides.items[i],format:'png',scale:1});await fs.writeFile(path.join(build,`slide-${i+1}.png`),new Uint8Array(await b.arrayBuffer()))}
const result=await finalizePresentation({workspaceDir:root,candidatePath:candidate,finalPath:final,explicitTotalSlideCount:7,requiredNativeTableOwnerSlides:[],requiredNativeChartOwnerSlides:[],pythonExecutable:runtimePython,integrityValidatorPath:path.join(skill,'container_tools/inspect_presentation_package_integrity.py'),layoutValidatorPath:path.join(skill,'container_tools/inspect_presentation_layout_geometry.py'),layoutArgs:['--expected-slide-size-emu','12192000,6858000','--validate-heading-fit'],fontPolicy:{basis:'design',families:[font,mono]},verifyArtifactToolImport:true,receiptPath:path.join(build,'validation-v3.json')});
console.log(JSON.stringify({final,result},null,2));
