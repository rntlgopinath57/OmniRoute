import { readdir, readFile, stat, mkdir, writeFile } from "node:fs/promises";
import { basename, extname, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const IGNORE = new Set([".git","node_modules",".next","dist","build","coverage",".venv","venv","__pycache__",".cache","target","vendor"]);
const TEXT = new Set([".js",".mjs",".cjs",".ts",".tsx",".jsx",".py",".java",".go",".rs",".rb",".php",".cs",".c",".cpp",".h",".sql",".sh",".yml",".yaml",".json",".toml",".ini",".cfg",".conf",".env",".md",".txt",".html",".css",".xml",".tf"]);
const RANK = {info:0,low:1,medium:2,high:3,critical:4};
const PROFILE = {
  full:null,
  security:new Set(["security","privacy","supply-chain"]),
  reliability:new Set(["reliability","data","deployment"]),
  architecture:new Set(["architecture","data","deployment","maintainability"]),
  quality:new Set(["quality","testing","maintainability","supply-chain"])
};

function finding(severity,category,rule,title,path,line,evidence,recommendation){
  return {severity,category,rule,title,path,line:line||null,evidence:evidence||"",recommendation:recommendation||""};
}
function redact(s){s=String(s||"");return s.length<9?"<redacted>":s.slice(0,4)+"…"+s.slice(-4);}
function lineNo(text,index){return text.slice(0,index).split("\n").length;}
function isText(path){
  const name=basename(path);
  return name.startsWith(".env") || ["package.json","requirements.txt","pyproject.toml","Dockerfile"].includes(name) || TEXT.has(extname(name).toLowerCase());
}
async function walk(root,maxFiles=5000){
  const out=[];
  async function visit(dir){
    if(out.length>=maxFiles)return;
    for(const e of await readdir(dir,{withFileTypes:true})){
      if(IGNORE.has(e.name))continue;
      const abs=join(dir,e.name), rel=relative(root,abs).replaceAll("\\","/");
      if(e.isDirectory())await visit(abs);
      else if(e.isFile()){
        const s=await stat(abs);
        out.push({abs,rel,size:s.size,text:isText(rel),oversize:s.size>524288});
      }
    }
  }
  await visit(root);
  return out;
}
function detect(files,contents){
  const all=[...contents.values()].join("\n").toLowerCase();
  const frameworks=[], stores=[];
  for(const [n,r] of [["Flask",/\bflask\b/],["Django",/\bdjango\b/],["FastAPI",/\bfastapi\b/],["React",/\breact\b/],["Next.js",/\bnext\b/],["Express",/\bexpress\b/]]) if(r.test(all))frameworks.push(n);
  for(const [n,r] of [["Firestore",/firestore|firebase_admin/],["SQLite",/sqlite|sqlite3/],["PostgreSQL",/postgres|psycopg/],["Redis",/\bredis\b/],["MongoDB",/mongodb|mongoose/]]) if(r.test(all))stores.push(n);
  return {frameworks:[...new Set(frameworks)],dataStores:[...new Set(stores)]};
}
function scanFile(file,text,out){
  const path=file.rel, lines=text.split("\n"), add=(...a)=>out.push(finding(...a));
  if(basename(path).startsWith(".env")&&!/\.example$|\.sample$|\.template$/i.test(path)) add("high","security","committed-env","Environment file is present in source control",path,null,"","Keep runtime secrets outside the repository.");
  const secrets=[
    ["critical","private-key",/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g],
    ["critical","github-token",/\bgh[pousr]_[A-Za-z0-9]{20,}\b/g],
    ["critical","openai-key",/\bsk-[A-Za-z0-9_-]{20,}\b/g],
    ["high","google-api-key",/\bAIza[0-9A-Za-z_-]{20,}\b/g],
    ["critical","aws-key",/\bAKIA[0-9A-Z]{16}\b/g]
  ];
  for(const [sev,rule,re] of secrets)for(const m of text.matchAll(re)) add(sev,"security",rule,"Potential committed credential",path,lineNo(text,m.index||0),redact(m[0]),"Rotate/revoke it and move it to a secret manager.");
  for(const m of text.matchAll(/\b(api[_-]?key|secret|password|token)\s*[:=]\s*["']([^"'\n]{12,})["']/gi)){
    if(/example|dummy|changeme|test|placeholder/i.test(m[2]))continue;
    add("high","security","hardcoded-secret","Possible hard-coded secret",path,lineNo(text,m.index||0),m[1]+"="+redact(m[2]),"Use runtime secrets instead of literals.");
  }
  const risks=[
    ["high","security","tls-disabled",/verify\s*=\s*False|rejectUnauthorized\s*:\s*false/g,"TLS verification appears disabled"],
    ["high","security","shell-exec",/shell\s*=\s*True|child_process\.exec\s*\(/g,"Shell execution path detected"],
    ["high","security","dynamic-eval",/\beval\s*\(/g,"Dynamic evaluation detected"],
    ["medium","deployment","debug-enabled",/debug\s*=\s*True|DEBUG\s*=\s*true/g,"Debug mode appears enabled"]
  ];
  for(const [sev,cat,rule,re,title] of risks)for(const m of text.matchAll(re)) add(sev,cat,rule,title,path,lineNo(text,m.index||0),lines[lineNo(text,m.index||0)-1]?.trim().slice(0,160),"Review and harden this path for production.");
  if(path.endsWith(".py")) lines.forEach((line,i)=>{
    if(/\brequests\.(get|post|put|patch|delete)\s*\(/.test(line)&&!/timeout\s*=/.test(line)) add("medium","reliability","http-no-timeout","HTTP request has no explicit timeout",path,i+1,line.trim().slice(0,160),"Add bounded network timeouts and timeout handling.");
    if(/^\s*except(?:\s+Exception)?\s*:\s*(?:pass)?\s*$/.test(line)) add("medium","reliability","broad-exception","Broad exception handling can hide failures",path,i+1,line.trim(),"Catch expected errors and preserve failure context.");
  });
  if(/^\.github\/workflows\/.*\.ya?ml$/i.test(path)) lines.forEach((line,i)=>{
    const m=line.match(/uses:\s*([^\s#]+)@([^\s#]+)/);
    if(m&&!/^[0-9a-f]{40}$/i.test(m[2])) add("medium","supply-chain","action-unpinned","GitHub Action is not pinned to an immutable SHA",path,i+1,line.trim(),"Pin external actions to reviewed commit SHAs.");
  });
}
function projectFindings(files,contents,stack){
  const out=[], add=(...a)=>out.push(finding(...a)), rels=files.map(f=>f.rel.toLowerCase());
  if(!rels.some(p=>/(^|\/)(test|tests|__tests__)(\/|$)|\.(test|spec)\./.test(p))) add("medium","testing","no-tests","No automated tests were detected","<project>",null,"","Add regression tests for critical flows.");
  if(stack.dataStores.length>1) add("medium","data","multiple-stores","Multiple persistence technologies detected","<project>",null,stack.dataStores.join(", "),"Document source-of-truth, synchronization, failure order, and recovery.");
  if(!rels.some(p=>p.startsWith(".github/workflows/"))) add("low","quality","no-ci","No GitHub Actions workflow detected","<project>",null,"","Add a read-only CI gate.");
  for(const [path,text] of contents){
    const loc=text.split("\n").length;
    if(loc>2000)add("high","architecture","very-large-file","Very large source file increases change risk",path,null,loc+" lines","Split responsibilities behind explicit interfaces.");
    else if(loc>1000)add("medium","maintainability","large-file","Large source file may carry multiple responsibilities",path,null,loc+" lines","Review module boundaries and coupling.");
  }
  if(contents.has("package.json")&&!rels.some(p=>["package-lock.json","pnpm-lock.yaml","yarn.lock"].includes(p))) add("medium","supply-chain","no-lockfile","Node project has no detected lockfile","package.json",null,"","Commit one lockfile for reproducible dependencies.");
  return out;
}
function md(report){
  const s=report.summary.severity, lines=["# Universal Audit — "+report.target.name,"","- Profile: **"+report.profile+"**","- Files inventoried: **"+report.summary.files+"**","- Text files inspected: **"+report.summary.textFiles+"**","- Findings: **"+report.summary.findings+"** (critical "+s.critical+", high "+s.high+", medium "+s.medium+", low "+s.low+")","- Frameworks: "+(report.stack.frameworks.join(", ")||"not identified"),"- Data stores: "+(report.stack.dataStores.join(", ")||"not identified")];
  if(report.focus)lines.push("- Focus: "+report.focus);
  lines.push("","## Priority findings","");
  if(!report.findings.length)lines.push("No findings matched this profile.");
  for(const f of report.findings.slice(0,100)){lines.push("### "+f.severity.toUpperCase()+" — "+f.title,"","- Category: "+f.category,"- Rule: "+f.rule,"- Location: "+f.path+(f.line?":"+f.line:""));if(f.evidence)lines.push("- Evidence: "+String(f.evidence));if(f.recommendation)lines.push("- Recommendation: "+f.recommendation);lines.push("");}
  lines.push("## Reliability contract","","- Target code is never executed.","- Secrets are redacted in evidence.","- The evidence scan does not depend on any AI provider.","- Model review is an optional second layer, so provider outages cannot erase the audit.");
  return lines.join("\n");
}
export async function scanTarget({root,profile="full",focus="",name="",outputDir=""}={}){
  const target=resolve(root||process.cwd()), p=PROFILE[profile]?profile:(profile==="full"?"full":"full"), files=await walk(target), contents=new Map();
  for(const f of files)if(f.text&&!f.oversize)try{contents.set(f.rel,await readFile(f.abs,"utf8"));}catch{}
  const stack=detect(files,contents); let findings=[];
  for(const f of files){const text=contents.get(f.rel);if(text!==undefined)scanFile(f,text,findings);}
  findings.push(...projectFindings(files,contents,stack));
  const allowed=PROFILE[p]; if(allowed)findings=findings.filter(f=>allowed.has(f.category));
  findings.sort((a,b)=>RANK[b.severity]-RANK[a.severity]||a.path.localeCompare(b.path)||(a.line||0)-(b.line||0));
  const severity={critical:0,high:0,medium:0,low:0,info:0}; for(const f of findings)severity[f.severity]++;
  const report={schemaVersion:1,generatedAt:new Date().toISOString(),target:{name:name||basename(target),root:target},profile:p,focus:String(focus||""),stack,summary:{files:files.length,textFiles:contents.size,findings:findings.length,severity},findings};
  if(outputDir){const dir=resolve(outputDir);await mkdir(dir,{recursive:true});await writeFile(join(dir,"audit-report.json"),JSON.stringify(report,null,2));await writeFile(join(dir,"audit-report.md"),md(report));for(const cat of ["security","reliability","architecture","data","testing","quality","maintainability","supply-chain","deployment","privacy"]){const x=findings.filter(f=>f.category===cat);if(x.length)await writeFile(join(dir,"specialist-"+cat+".json"),JSON.stringify({category:cat,findings:x},null,2));}}
  return report;
}
async function main(){const r=await scanTarget({root:process.env.AUDIT_ROOT||process.cwd(),profile:process.env.AUDIT_PROFILE||"full",focus:process.env.AUDIT_FOCUS||"",name:process.env.AUDIT_TARGET_NAME||"",outputDir:process.env.AUDIT_OUTPUT_DIR||"audit-output"});console.log(JSON.stringify(r.summary));const t=String(process.env.AUDIT_FAIL_ON||"none").toLowerCase();if(t!=="none"&&r.findings.some(f=>RANK[f.severity]>=(RANK[t]??99)))process.exitCode=2;}
if(import.meta.url===pathToFileURL(process.argv[1]||"").href)main().catch(e=>{console.error(e);process.exitCode=1;});
