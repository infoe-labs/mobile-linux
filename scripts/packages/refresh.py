#!/usr/bin/env python3
"""Explicit maintainer action: resolve real APK dependencies and review new pins.
Requires Linux capable of executing Alpine x86 ELF binaries. Never used at runtime.
"""
import argparse,hashlib,io,json,os,pathlib,shutil,subprocess,sys,tarfile,tempfile,urllib.request
ROOT=pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'scripts/build-alpine'))
from build import INPUTS,download_asset

def main():
 parser=argparse.ArgumentParser();parser.add_argument('packages',nargs='*',default=['go','curl','git','busybox-extras','nodejs','npm']);args=parser.parse_args()
 with tempfile.TemporaryDirectory(prefix='pocket-apk-') as directory:
  work=pathlib.Path(directory);fs=work/'root';fs.mkdir();archives=work/'archives';archives.mkdir()
  url,digest=INPUTS['rootfs.tar.gz']
  with tarfile.open(download_asset('rootfs.tar.gz',url,digest)) as archive:archive.extractall(fs,filter='fully_trusted')
  command=[str(fs/'lib/ld-musl-i386.so.1'),'--library-path',str(fs/'lib')+':'+str(fs/'usr/lib'),str(fs/'sbin/apk'),'--root',str(fs),'--arch','x86']
  env={**os.environ,'SSL_CERT_FILE':os.environ.get('SSL_CERT_FILE','/etc/ssl/certs/ca-certificates.crt')}
  def run(*arguments):
   result=subprocess.run([*command,*arguments],env=env,capture_output=True)
   if result.returncode:raise RuntimeError('Alpine dependency resolution or signature verification failed; no snapshot was published.')
  run('update');run('fetch','--recursive','--output',str(archives),*args.packages)
  run('verify',*[str(path) for path in archives.glob('*.apk')])
  indexes={};locations={}
  for repo in ['main','community']:
   data=urllib.request.urlopen(f'https://dl-cdn.alpinelinux.org/alpine/v3.23/{repo}/x86/APKINDEX.tar.gz',timeout=120).read();indexes[repo]=data
   with tarfile.open(fileobj=io.BytesIO(data)) as archive:
    for record in archive.extractfile('APKINDEX').read().decode().split('\n\n'):
     fields=dict(line.split(':',1) for line in record.splitlines() if ':' in line)
     if 'P' in fields:locations[fields['P']+'-'+fields['V']+'.apk']=repo
  files=[]
  for archive in archives.glob('*.apk'):
   if archive.name not in locations:raise RuntimeError('Upstream changed during resolution; retry.')
   path=f'{locations[archive.name]}/x86/{archive.name}';data=archive.read_bytes()
   files.append({'path':path,'url':'https://dl-cdn.alpinelinux.org/alpine/v3.23/'+path,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()})
  for repo,data in indexes.items():
   dest=ROOT/'public/packages'/repo/'x86';dest.mkdir(parents=True,exist_ok=True);(dest/'APKINDEX.tar.gz.bin').write_bytes(data)
  for entry in files:shutil.copyfile(archives/pathlib.Path(entry['path']).name,ROOT/'public/packages'/entry['path'])
  (ROOT/'scripts/packages/lock.json').write_text(json.dumps({'supported':args.packages,'files':sorted(files,key=lambda e:e['path'])},indent=2)+'\n')
 print('Reviewed package snapshot ready; rebuild assets, sources and notices before publishing.')
if __name__=='__main__':main()
