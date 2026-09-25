import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { Presentation, PresentationFile } from '@oai/artifact-tool';

const skill = 'E:/Data/Codex/home/plugins/cache/openai-primary-runtime/presentations/26.904.11930/skills/presentations';
const workspaceDir = 'E:/roguems-laya/deck';
const build = path.join(workspaceDir, '.build');
const out = path.join(workspaceDir, 'output');
const finalPath = path.join(out, 'LayA_Rogue_Team_Demo_6_Slides.pptx');
const runtimePython = 'C:/Users/marowe/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe';
const { finalizePresentation } = await import(pathToFileURL(path.join(skill, 'container_tools/artifact_tool_utils.mjs')).href);
await fs.mkdir(build, {recursive:true});
await fs.mkdir(out, {recursive:true});

const C = {bg:'#101827', ink:'#F5F7FB', muted:'#AEBED1', mint:'#72E0BC', blue:'#83B7FF', orange:'#FFC98C', line:'#3A4A60'};
const font = 'Aptos';
const p = Presentation.create({slideSize:{width:1280,height:720}});
function box(slide, text, x,y,w,h,size=30,color=C.ink,bold=false,align='left') {
  const q=slide.shapes.add({geometry:'textbox',position:{left:x,top:y,width:w,height:h},fill:'none',line:{fill:'none',width:0}});
  q.text=text;
  q.text.style={typeface:font,fontSize:size,bold,color,alignment:align,verticalAlignment:'middle',autoFit:'none',wrap:true};
  return q;
}
function rule(slide,y,x=70,w=1140,color=C.line){
  slide.shapes.add({geometry:'rect',position:{left:x,top:y,width:w,height:2},fill:color,line:{fill:'none',width:0}});
}
function base(title,n){
  const s=p.slides.add(); s.background.fill=C.bg;
  box(s,title,70,42,1120,75,43,C.ink,true);
  rule(s,127);
  box(s,`LayA + RogueRNG  ·  ${n}/6`,70,669,1120,26,17,C.muted);
  return s;
}
function notes(slide,t){slide.speakerNotes.textFrame.setText(t);}

// 1 — problem and test surface
{
 const s=base('A game as a decision workflow',1);
 box(s,'The problem',70,168,350,42,25,C.mint,true);
 box(s,'A roguelike asks for a new choice every turn — while longer goals must survive many turns.',70,218,1040,105,32,C.ink);
 rule(s,361);
 box(s,'What we tested',70,392,350,42,25,C.blue,true);
 box(s,'Can a small decision model handle frequent judgments while a planner handles the trip to town and back?',70,447,1060,120,31,C.ink);
 box(s,'LIVE DEMO  →  game + decision dashboard',70,604,1080,36,22,C.orange,true);
 notes(s,`Opening (about 50 seconds). My son and I built this with OpenCode and a local Qwen model, without using a frontier model for implementation. RogueRNG gives us a compact but realistic workflow: there are immediate choices such as fight, heal or explore, and persistent goals such as selling a full bag and resuming the same dungeon depth. The experiment is whether a classifier can supply cheap typed signals while code and a hierarchical task planner retain control. Show the running game briefly. This is a demonstration of the architecture, not proof of production accuracy. Source: local README.md, bridge/matrix.py, game/src/laya/planner.js.`);
}
// 2 — matrix
{
 const s=base('Jev-style decisions in one pass',2);
 box(s,'GAME STATE',70,173,320,38,25,C.muted,true);
 box(s,'player · monsters · inventory · objectives',70,214,850,55,28,C.ink);
 rule(s,297);
 box(s,'Choice',70,332,240,43,30,C.mint,true);
 box(s,'Which of 11 intents?',330,332,800,43,29,C.ink);
 box(s,'Score',70,403,240,43,30,C.blue,true);
 box(s,'How dangerous is this turn?  0–3',330,403,800,43,29,C.ink);
 box(s,'Noul × 5',70,474,240,43,30,C.orange,true);
 box(s,'P(true): critical HP, overmatched, town needed…',330,474,850,58,29,C.ink);
 rule(s,563);
 box(s,'LayA returns probabilities; policy checks facts before an action runs.',70,584,1100,56,26,C.ink);
 notes(s,`About 75 seconds. matrix.py is the key learning artifact. This uses the Jev-style typed decision interface. It declares one closed-set Choice for eleven possible intentions, one ordered threat Score, and five Noul yes/no probabilities. The bridge sends the state and all seven questions in one predict call. We do not ask it to generate instructions or parse prose. The response includes the intent distribution and typed values. A selected label is not necessarily a correct decision; the policy gates it against confidence and executable game facts. The current base checkpoint is exploratory, so do not describe these probabilities as calibrated for the game. Sources: local bridge/matrix.py, bridge/server.py, game/src/laya/policy.js; upstream Laya README: https://github.com/NandhaKishorM/laya .`);
}
// 3 — HTN
{
 const s=base('HTN planner: one town trip, then resume',3);
 box(s,'Signals and facts',70,172,345,42,25,C.muted,true);
 box(s,'full bag   +   no potions   +   locked chest',70,225,1050,58,30,C.ink);
 box(s,'↓',79,303,70,50,36,C.mint,true);
 box(s,'Active goals merge shared tasks',155,306,1020,47,28,C.mint,true);
 rule(s,379);
 box(s,'1  Go home',70,420,550,48,31,C.ink);
 box(s,'2  Do town chores',650,420,550,48,31,C.ink);
 box(s,'3  Buy key',70,507,550,48,31,C.ink);
 box(s,'4  Resume same dungeon depth',650,507,550,82,31,C.ink);
 notes(s,`About 75 seconds. HTN means hierarchical task network: a goal expands into a method, which is an ordered list of tasks. Here the triggers are a mixture of explicit facts and one model probability for pack tending. The planner merges all active goals, removes repeated tasks, and moves resume to the end. Therefore three reasons to visit town can become one trip. Each task has a done condition and an act method; the plan persists across turns. Immediate safety still has priority, and a combat action can happen while a plan is active. Do not imply the model invents the long plan: planner.js defines the methods. Source: local game/src/laya/planner.js and game/src/laya/policy.js.`);
}
// 4 — where it fits and why
{
 const s=base('Why include a decision model?',4);
 box(s,'Repeated, bounded choices',70,173,1060,44,28,C.mint,true);
 box(s,'One typed response can replace a text-generation step.',70,220,1080,64,30,C.ink);
 rule(s,311);
 box(s,'Control stays in the workflow',70,344,1060,44,28,C.blue,true);
 box(s,'Safety → current plan → validated model signal → fallback',70,392,1100,64,30,C.ink);
 rule(s,483);
 box(s,'What we can measure',70,516,1060,44,28,C.orange,true);
 box(s,'Latency, execution share, errors, and quality against a baseline',70,562,1100,71,29,C.ink);
 notes(s,`About 60 seconds. The classifier is suited to decisions with a bounded set of answers that repeat often. One model request gives us seven typed answers, so there is no generated JSON step to parse. The policy still executes actions in a fixed priority: safety, a current plan, a validated model intent, then deterministic fallback. The dashboard records latency and which layer actually decided each turn. These are useful observability measures, but this game has not established a comparative speed, cost, or quality advantage over an LLM baseline. That is what an evaluation would need to measure. Sources: local bridge/matrix.py, bridge/server.py, game/src/laya/policy.js, dashboard/index.html.`);
}
// 5 — model routing extension
{
 const s=base('Task-aware model routing',5);
 box(s,'Current planning input',70,170,1060,45,27,C.muted,true);
 box(s,'small  /  medium  /  large  /  simple',70,222,1060,60,32,C.ink);
 rule(s,320);
 box(s,'Proposed routing input',70,350,1060,45,27,C.mint,true);
 box(s,'task type · context size · tools · quality bar · time and cost limits',70,401,1120,83,29,C.ink);
 rule(s,519);
 box(s,'Decision',70,548,1060,38,26,C.orange,true);
 box(s,'Choose from measured model performance on tasks like this one.',70,589,1100,61,28,C.ink);
 notes(s,`About 60 seconds. In my working-skills repository, planning currently labels work with broad difficulty tiers. A decision model could use richer task context to recommend the execution model. For example, the question “Opus or Sol for this job?” should be answered from evaluations of similar jobs, with the available tools, required quality, latency and cost taken into account. The classifier would recommend a route; eligibility rules and fallback would remain explicit. This is a proposed extension. It is not wired into the repository today and I have not measured a winner between those named models. Source for the current tier concept: the presenter's working-skills workflow description. The local game demonstrates typed decision routing, not model selection.`);
}
// 6 — close
{
 const s=base('What if the classifier learned our domain?',6);
 box(s,'A client or industry could label recurring decisions:',70,169,1100,55,30,C.ink);
 box(s,'Which route worked?  Which action needed review?  When did we escalate?',70,246,1120,95,31,C.mint,true);
 rule(s,380);
 box(s,'Then test the tuned decision head on held-out cases:',70,415,1100,55,30,C.ink);
 box(s,'quality · calibration · latency · cost · safe fallback rate',70,485,1110,73,29,C.blue,true);
 box(s,'The question is where a fast specialist earns a place in the workflow.',70,602,1120,53,27,C.ink);
 notes(s,`Close (about 60 seconds). The practical next experiment is domain specialization. Gather representative decisions and outcomes from one workflow, define the available actions and abstention path, fine-tune or otherwise adapt the classifier, and evaluate on held-out cases. Measure whether the signal is accurate and calibrated enough for its assigned authority. Start with suggestions or routing recommendations and preserve validation and escalation. The open question for this team is which high-volume bounded decision would be worth testing first. Upstream Laya explicitly describes fine-tuning a fast decision head and warns against treating the base model as a zero-shot engine. Source: https://github.com/NandhaKishorM/laya .`);
}

const candidate=path.join(build,'candidate.pptx');
await (await PresentationFile.exportPptx(p)).save(candidate);
for(let i=0;i<p.slides.items.length;i++){
 const buf=await p.export({slide:p.slides.items[i],format:'png',scale:1});
 await fs.writeFile(path.join(build,`slide-${i+1}.png`),new Uint8Array(await buf.arrayBuffer()));
}
const result=await finalizePresentation({
 workspaceDir,candidatePath:candidate,finalPath,
 explicitTotalSlideCount:6,
 requiredNativeTableOwnerSlides:[],requiredNativeChartOwnerSlides:[],
 pythonExecutable:runtimePython,
 integrityValidatorPath:path.join(skill,'container_tools/inspect_presentation_package_integrity.py'),
 layoutValidatorPath:path.join(skill,'container_tools/inspect_presentation_layout_geometry.py'),
 layoutArgs:['--expected-slide-size-emu','12192000,6858000','--validate-heading-fit'],
 fontPolicy:{basis:'design',families:[font]},
 verifyArtifactToolImport:true,
 receiptPath:path.join(build,'validation-v3.json'),
});
console.log(JSON.stringify({finalPath,result},null,2));
