#!/usr/bin/env python3
"""Collect exact Alpine packaging and checksum-verified sources alongside binaries.
No APKBUILD is executed. Every checksum-listed source must be present or this fails.
"""
import hashlib, html, json, pathlib, re, tarfile, urllib.request
ROOT=pathlib.Path(__file__).resolve().parents[2]
CACHE=ROOT/'.asset-cache/sources';OUT=ROOT/'public/sources'
def fetch(url,path):
 if not path.exists():
  path.parent.mkdir(parents=True,exist_ok=True)
  with urllib.request.urlopen(url,timeout=120) as response: path.write_bytes(response.read())
 return path

def main():
 OUT.mkdir(parents=True,exist_ok=True);CACHE.mkdir(parents=True,exist_ok=True)
 packages=json.loads((ROOT/'public/vm/packages.json').read_text())
 origins={p['o']:p['c'] for p in packages}
 records=[]
 for origin,commit in sorted(origins.items()):
  print('Collecting corresponding sources:',origin,flush=True)
  url=f'https://gitlab.alpinelinux.org/alpine/aports/-/archive/{commit}/aports-{commit}.tar.gz?path=main/{origin}'
  archive=fetch(url,CACHE/(origin+'-'+commit+'.tar.gz'))
  dest=OUT/origin;dest.mkdir(exist_ok=True)
  with tarfile.open(archive) as t:
   for entry in t:
    if not entry.isfile(): continue
    parts=pathlib.PurePosixPath(entry.name).parts
    if 'main' not in parts: continue
    i=parts.index('main')
    if len(parts)<=i+2 or parts[i+1]!=origin: continue
    rel=pathlib.PurePosixPath(*parts[i+2:])
    if '..' in rel.parts: raise RuntimeError('Unsafe packaging archive')
    path=dest/rel;path.parent.mkdir(parents=True,exist_ok=True);path.write_bytes(t.extractfile(entry).read())
  build=(dest/'APKBUILD').read_text()
  checks=re.findall(r'^([a-f0-9]{128})\s+([^\s]+)\s*$',build,re.M)
  for digest,name in checks:
   if '/' in name or name in ['.','..']: raise RuntimeError('Unsafe source name')
   source=dest/name
   if not source.exists():
    cached=fetch('https://distfiles.alpinelinux.org/distfiles/v3.23/'+name,CACHE/(digest+'-'+name))
    if hashlib.sha512(cached.read_bytes()).hexdigest()!=digest: raise RuntimeError('Source digest mismatch: '+name)
    source.write_bytes(cached.read_bytes())
   if hashlib.sha512(source.read_bytes()).hexdigest()!=digest: raise RuntimeError('Packaging digest mismatch: '+name)
  records.append({'origin':origin,'commit':commit,'packaging':url,'checksumFiles':len(checks)})
 for name,url in [
  ('seabios-rel-1.16.2.tar.gz','https://codeload.github.com/coreboot/seabios/tar.gz/refs/tags/rel-1.16.2'),
  ('v86-cc37f35.tar.gz','https://codeload.github.com/copy/v86/tar.gz/cc37f35c43bf14865d74ad76879ecf9410f69eb1')]:
  (OUT/name).write_bytes(fetch(url,CACHE/name).read_bytes())
 files={str(p.relative_to(OUT)):{'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in sorted(OUT.rglob('*')) if p.is_file() and p.name not in ['index.html','manifest.json']}
 (OUT/'manifest.json').write_text(json.dumps({'format':1,'packages':packages,'origins':records,'files':files},indent=2)+'\n')
 links=''.join(f'<li><a href="{html.escape(path,quote=True)}">{html.escape(path)}</a></li>' for path in files)
 (OUT/'index.html').write_text('<!doctype html><meta charset="utf-8"><title>Alpine Pocket corresponding sources</title><h1>Corresponding sources</h1><p>Exact packaging recipes, patches, configurations and upstream source archives for the bundled Alpine image and SeaBIOS. Source files are not cached automatically. See manifest.json for hashes and versions.</p><a href="manifest.json">Source manifest</a><ul>'+links+'</ul>')
 print('Collected source files:',len(files),flush=True)
if __name__=='__main__': main()
