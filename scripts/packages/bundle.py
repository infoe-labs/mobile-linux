#!/usr/bin/env python3
"""Materialize a checksum-pinned static repository subset; never execute packages."""
import hashlib,json,pathlib,urllib.request
ROOT=pathlib.Path(__file__).resolve().parents[2]
def main():
 lock=json.loads((ROOT/'scripts/packages/lock.json').read_text())
 entries=list(lock['files'])
 for repo in ['main','community']:
  path=f'{repo}/x86/APKINDEX.tar.gz';data=(ROOT/'public/packages'/(path+'.bin')).read_bytes()
  entries.append({'path':path,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()})
 for entry in lock['files']:
  out=ROOT/'public/packages'/entry['path'];out.parent.mkdir(parents=True,exist_ok=True)
  if not out.exists() or hashlib.sha256(out.read_bytes()).hexdigest()!=entry['sha256']:
   with urllib.request.urlopen(entry['url'],timeout=120) as response: data=response.read()
   if hashlib.sha256(data).hexdigest()!=entry['sha256']: raise RuntimeError('Package snapshot changed; review and regenerate the bundle lock.')
   out.write_bytes(data)
 (ROOT/'public/packages/catalog.json').write_text(json.dumps({'supported':lock['supported'],'bytes':sum(e['bytes'] for e in entries),'files':[{k:e[k] for k in ['path','bytes','sha256']} for e in entries]}))
 print('Static package bundle verified.')
if __name__=='__main__':main()
