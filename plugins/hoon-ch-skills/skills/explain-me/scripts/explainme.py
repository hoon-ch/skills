#!/usr/bin/env python3
from __future__ import annotations

import argparse, html, json, re, sys, xml.etree.ElementTree as ET
from pathlib import Path

TRUTH={"observed","declared","intended","inferred","unknown"}
CONF={"high","medium","low"}
MODES={"overview","onboarding","flow","deployment","review","change"}
AUDIENCES={"novice","mixed","expert"}
SECRET=re.compile(r"(?i)(api[_-]?key|access[_-]?token|client[_-]?secret|password|private[_-]?key)\s*[:=]\s*[^\s,;]{6,}")


def load(path):
    obj=json.loads(Path(path).read_text())
    if not isinstance(obj,dict): raise ValueError(f"{path}: expected JSON object")
    return obj


def validate(model,evidence):
    out=[]
    add=lambda level,msg: out.append((level,msg))
    if model.get("schema_version")!="1.0": add("error","explainer.schema_version must be 1.0")
    if evidence.get("schema_version")!="1.0": add("error","evidence.schema_version must be 1.0")
    scope=evidence.get("scope") if isinstance(evidence.get("scope"),dict) else {}
    claims=evidence.get("claims") if isinstance(evidence.get("claims"),list) else []
    claim_map={}
    for i,c in enumerate(claims):
        if not isinstance(c,dict): add("error",f"claims[{i}] must be object"); continue
        cid=c.get("id")
        if not isinstance(cid,str) or not re.fullmatch(r"C-\d{3,}",cid): add("error",f"claims[{i}].id must look like C-001"); continue
        if cid in claim_map: add("error",f"duplicate claim {cid}")
        claim_map[cid]=c
        if c.get("state") not in TRUTH: add("error",f"{cid}: invalid state")
        if c.get("confidence") not in CONF: add("error",f"{cid}: invalid confidence")
        statement=c.get("statement","")
        if not isinstance(statement,str) or not statement.strip(): add("error",f"{cid}: statement required")
        elif SECRET.search(statement): add("error",f"{cid}: possible secret value")
        if c.get("sensitive") is True: add("error",f"{cid}: sensitive content must be redacted")
        sources=c.get("sources",[])
        if c.get("state")!="unknown" and not sources: add("warning",f"{cid}: no direct source")
        if c.get("state")=="observed":
            if scope.get("runtime_access","none")=="none": add("error",f"{cid}: observed but runtime_access is none")
            rs=[s for s in sources if isinstance(s,dict) and s.get("type") in {"runtime","command"}]
            if not rs: add("error",f"{cid}: observed claim needs runtime/command source")
            for s in rs:
                if not s.get("observed_at"): add("error",f"{cid}: observed_at required")
                if not (s.get("command") or s.get("inspection")): add("error",f"{cid}: command or inspection required")
    meta=model.get("meta") if isinstance(model.get("meta"),dict) else {}
    if meta.get("mode") not in MODES: add("error","invalid meta.mode")
    if meta.get("audience") not in AUDIENCES: add("error","invalid meta.audience")
    comps=model.get("components") if isinstance(model.get("components"),list) else []
    rels=model.get("relations") if isinstance(model.get("relations"),list) else []
    if len(comps)>9: add("error",f"{len(comps)} components exceeds 9-node budget")
    if len(rels)>12: add("error",f"{len(rels)} relations exceeds 12-edge budget")
    if sum(bool(c.get("focal")) for c in comps if isinstance(c,dict))>2: add("error","more than 2 focal components")
    ids={c.get("id") for c in comps if isinstance(c,dict)}
    def refs(item,label,truth_check=False):
        r=item.get("claim_ids")
        if not isinstance(r,list) or not r: add("error",f"{label}: claim_ids required"); return
        for x in r:
            if x not in claim_map: add("error",f"{label}: unknown claim {x}")
        if truth_check and item.get("truth") in TRUTH and not any(claim_map.get(x,{}).get("state")==item.get("truth") for x in r):
            add("error",f"{label}: truth state lacks matching claim")
    for c in comps:
        if not isinstance(c,dict): continue
        refs(c,f"component {c.get('id')}",True)
    for r in rels:
        if not isinstance(r,dict): continue
        if r.get("from") not in ids or r.get("to") not in ids: add("error",f"relation {r.get('id')}: bad endpoint")
        refs(r,f"relation {r.get('id')}",True)
    for key in ("findings","next_moves"):
        for i,item in enumerate(model.get(key,[]) if isinstance(model.get(key),list) else []):
            if isinstance(item,dict): refs(item,f"{key}[{i}]")
    return out


def render_svg(model):
    comps=model.get("components",[]); rels=model.get("relations",[])
    title=model.get("meta",{}).get("title","Explain Me"); one=model.get("summary",{}).get("one_liner","")
    W,H,NW,NH=1200,720,200,76; X0,Y0,GX,GY=48,128,64,72
    layers={x.get("id"):i for i,x in enumerate(model.get("layers",[])) if isinstance(x,dict)}
    all_zero=all(int(c.get("row",0))==0 for c in comps if isinstance(c,dict))
    pos={}
    for i,c in enumerate(comps):
        col=int(c.get("column",i%3)); row=int(c.get("row",i//3))
        if all_zero: row=layers.get(c.get("layer"),row)
        pos[c["id"]]=(X0+col*(NW+GX),Y0+row*(NH+GY))
    if pos: H=max(H,max(y for x,y in pos.values())+NH+140)
    esc=lambda v: html.escape(str(v),quote=True)
    parts=[f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" role="img" aria-labelledby="em-title em-desc">',
           f'<title id="em-title">{esc(title)}</title>',f'<desc id="em-desc">Evidence-backed explainer with {len(comps)} components.</desc>',
           '<defs><marker id="em-arrow" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto"><polygon points="0 0,8 3,0 6" fill="var(--muted)"/></marker></defs>',
           '<style>:root{--paper:#f7f6f2;--ink:#24262b;--muted:#687180;--rule:#d7d8db;--accent:#d45d38;--tint:#f8e9e3}@media(prefers-color-scheme:dark){:root{--paper:#191b1f;--ink:#f2f1ec;--muted:#a9b0bb;--rule:#3c4148;--accent:#ed7a55;--tint:#402920}}text{font-family:system-ui,"Noto Sans KR",sans-serif}.mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace}</style>',
           f'<rect width="{W}" height="{H}" fill="var(--paper)"/>',f'<text x="48" y="52" font-size="28" font-weight="650" fill="var(--ink)">{esc(title)}</text>',f'<text x="48" y="82" font-size="14" fill="var(--muted)">{esc(one)}</text>']
    def center(cid): x,y=pos[cid]; return x+NW//2,y+NH//2
    def ports(a,b):
        ax,ay=center(a); bx,by=center(b); x1,y1=pos[a]; x2,y2=pos[b]
        if abs(bx-ax)>=abs(by-ay): return ((x1+NW,ay),(x2,by)) if bx>=ax else ((x1,ay),(x2+NW,by))
        return ((ax,y1+NH),(bx,y2)) if by>=ay else ((ax,y1),(bx,y2+NH))
    for r in rels:
        if r.get("from") not in pos or r.get("to") not in pos: continue
        (x1,y1),(x2,y2)=ports(r["from"],r["to"])
        if x1==x2 or y1==y2: d=f"M{x1} {y1} L{x2} {y2}"
        else:
            mid=((x1+x2)//8)*4; rr=8
            d=f"M{x1} {y1} H{mid-rr} Q{mid} {y1} {mid} {y1+(rr if y2>y1 else -rr)} V{y2-(rr if y2>y1 else -rr)} Q{mid} {y2} {mid+(rr if x2>mid else -rr)} {y2} H{x2}"
        dash=' stroke-dasharray="6 5"' if r.get("truth") in {"intended","inferred","unknown"} else ''
        parts.append(f'<path d="{d}" data-route="orthogonal-rounded" fill="none" stroke="var(--muted)" stroke-width="1.2" marker-end="url(#em-arrow)"{dash}/>')
    for c in comps:
        x,y=pos[c["id"]]; focal=bool(c.get("focal")); truth=c.get("truth","unknown")
        fill='var(--tint)' if focal else 'var(--paper)'; stroke='var(--accent)' if focal else 'var(--rule)'; dash=' stroke-dasharray="5 4"' if truth in {"intended","inferred","unknown"} else ''
        parts += [f'<rect x="{x}" y="{y}" width="{NW}" height="{NH}" rx="8" fill="{fill}" stroke="{stroke}"{dash}/>',f'<text x="{x+16}" y="{y+30}" font-size="14" font-weight="650" fill="var(--ink)">{esc(c.get("label",c["id"]))}</text>',f'<text class="mono" x="{x+16}" y="{y+52}" font-size="9" fill="var(--muted)">{esc(c.get("kind","component"))} · {esc(truth)}</text>']
    parts.append('</svg>'); return '\n'.join(parts)


def check_svg(text):
    out=[]
    try: root=ET.fromstring(text)
    except ET.ParseError as e: return [("error",f"invalid SVG XML: {e}")]
    ids={e.get("id") for e in root.iter() if e.get("id")}; refs=root.get("aria-labelledby","").split(); children=list(root)
    if root.tag.split('}')[-1]!="svg": out.append(("error","root is not svg"))
    if root.get("role")!="img": out.append(("error","SVG needs role=img"))
    if len(refs)<2 or any(x not in ids for x in refs): out.append(("error","aria-labelledby must resolve title/desc"))
    if not children or children[0].tag.split('}')[-1]!="title": out.append(("error","title must be first child"))
    return out


def report(issues,strict):
    errors=[m for l,m in issues if l=="error"]; warnings=[m for l,m in issues if l=="warning"]
    for m in errors: print("ERROR:",m,file=sys.stderr)
    for m in warnings: print("WARNING:",m,file=sys.stderr)
    print(f"Validation: {len(errors)} error(s), {len(warnings)} warning(s)")
    return 1 if errors or (strict and warnings) else 0


def main():
    ap=argparse.ArgumentParser(); sub=ap.add_subparsers(dest="cmd",required=True)
    for name in ("validate","render","check"):
        p=sub.add_parser(name); p.add_argument("model"); p.add_argument("evidence"); p.add_argument("--strict",action="store_true")
        if name=="render": p.add_argument("--svg"); p.add_argument("--html")
        if name=="check": p.add_argument("--svg",required=True)
    a=ap.parse_args()
    try: model,evidence=load(a.model),load(a.evidence)
    except Exception as e: print("ERROR:",e,file=sys.stderr); return 1
    issues=validate(model,evidence)
    if a.cmd=="validate": return report(issues,a.strict)
    if a.cmd=="render":
        if report(issues,a.strict): return 1
        svg=render_svg(model)
        if a.svg: Path(a.svg).write_text(svg); print("svg:",a.svg)
        if a.html: Path(a.html).write_text(f"<!doctype html><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1'>{svg}"); print("html:",a.html)
        if not a.svg and not a.html: print(svg)
        return 0
    issues += check_svg(Path(a.svg).read_text())
    return report(issues,a.strict)

if __name__=="__main__": raise SystemExit(main())
