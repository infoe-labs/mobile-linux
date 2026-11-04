#!/usr/bin/env python3
"""Build a genuine Alpine ext4 root disk and direct-boot initramfs without Docker/root."""
import gzip, hashlib, json, os, pathlib, shutil, subprocess, tarfile, tempfile
from sources import fetch
ROOT = pathlib.Path(__file__).resolve().parents[2]
OUT = ROOT / 'public/vm'
CACHE = ROOT / '.asset-cache'
INPUTS = {
 'rootfs.tar.gz': ('https://dl-cdn.alpinelinux.org/alpine/v3.23/releases/x86/alpine-minirootfs-3.23.7-x86.tar.gz', '41978b24040bf632b4d60e865a39ad1f57372ca202c011cde41ef36a7eed8dd3'),
 'kernel.apk': ('https://dl-cdn.alpinelinux.org/alpine/v3.23/main/x86/linux-virt-6.18.60-r0.apk', '41fd208494fc74b38e46a13445bc7c7135e762ee04540cc9222d82bfee7a7ba4'),
}
SSH_PACKAGES = {
 'dropbear-dbclient': ('2025.88-r1', 'aa89b2fbb7e4d9345594b3f297b149e0f833adc4361c02636b39f0135ffa6163'),
 'utmps-libs': ('0.1.3.1-r0', '35940c7c0813542f649e81f49196bdb4bd5364a70ed800583ca5071bf2703de7'),
 'skalibs-libs': ('2.14.4.0-r0', 'b25a3c06df435d1d6640654ee2fc48d5cea29deae94e3ded7bfb48f2c4f3ea6f'),
 'zlib': ('1.3.2-r1', 'f6a0303e5203a43635d2c8a360a8ef0a6c462d72a123ba96ca82407d5536e2be'),
}
RESIZE_PACKAGES = {'e2fsprogs-extra': ('1.47.3-r0', '3b34ca407ec5073498f727405be4ee5365c29db0ca6f03b25de3789dcfcc6f3e'), 'e2fsprogs-libs': ('1.47.3-r0', 'a5c05b94ce57ffc6964e2725ba9da5c84108d2403ccb07ec3c1b727c3ed98b81'), 'libblkid': ('2.41.6-r1', '837d056ab4be1c0ad177a078076f98d3696643d87c668bd1df53037db550126b'), 'libeconf': ('0.8.3-r0', '9cb6ec3718db06ef307a74e1615639bb9592e6b44242599ef148f93103975fe6'), 'libuuid': ('2.41.6-r1', '1ee8265815ff661e734c6470642ea2dbf1b9abe658aae0911244d197b572ab08'), 'e2fsprogs': ('1.47.3-r0', '98c07f04690a52b58e4293db27888eb4afce325f671d3355dc4a7269410700fb'), 'libcom_err': ('1.47.3-r0', '32f390c959c36d06f6e15e591e8081bcb322280c79b95f8be7c8360af8d61b3e')}
def download_asset(name, url, expected):
 # A pin change must not reuse a previous package under the same cache name.
 path = CACHE / (name + '.' + expected)
 return fetch(url, path, validate=lambda p: hashlib.sha256(p.read_bytes()).hexdigest() == expected)

def kernel_package_record(archive):
 # APKs concatenate signature, control and data tar streams. Read the verified
 # control metadata so the SBOM and corresponding sources follow the actual APK.
 with tarfile.open(archive, ignore_zeros=True) as package:
  metadata = package.extractfile('.PKGINFO').read().decode()
 fields = dict(line.split(' = ', 1) for line in metadata.splitlines() if ' = ' in line)
 if fields.get('pkgname') != 'linux-virt' or fields.get('arch') != 'x86':
  raise RuntimeError('Unexpected kernel package identity')
 return {key: fields[field] for key, field in {'P':'pkgname','V':'pkgver','A':'arch','L':'license','o':'origin','c':'commit'}.items()}

def main():
 OUT.mkdir(parents=True, exist_ok=True); CACHE.mkdir(exist_ok=True)
 inputs = {name: download_asset(name, url, expected) for name, (url, expected) in INPUTS.items()}
 with tempfile.TemporaryDirectory(prefix='pocket-build-') as tmp:
  tmp = pathlib.Path(tmp); fs = tmp / 'fs'; kernel = tmp / 'kernel'; init = tmp / 'init'
  for target, archive in [(fs,'rootfs.tar.gz'),(kernel,'kernel.apk')]:
   target.mkdir()
   with tarfile.open(inputs[archive]) as t: t.extractall(target, filter='fully_trusted')
  shutil.copytree(fs, init, symlinks=True)
  # Keep modules with their dependency metadata. No network/firmware is required.
  shutil.copytree(kernel / 'lib/modules', init / 'lib/modules', symlinks=True)
  modules=next((init/'lib/modules').iterdir())
  deps={line.split(':')[0]:line.split(':')[1].split() for line in (modules/'modules.dep').read_text().splitlines()}
  wanted=set()
  def keep(name):
   if name in wanted: return
   wanted.add(name)
   for dependency in deps.get(name,[]): keep(dependency)
  for name in deps:
   if pathlib.Path(name).name in ['ext4.ko.gz','sd_mod.ko.gz','virtio_net.ko.gz','virtio_pci.ko.gz']: keep(name)
  for p in modules.rglob('*.ko.gz'):
   if str(p.relative_to(modules)) not in wanted: p.unlink()
  package_records=[]
  for record in (fs/'lib/apk/db/installed').read_text().split('\n\n'):
   fields={line[:1]:line[2:] for line in record.splitlines() if len(line)>1 and line[1]==':' and line[:1] in ['P','V','A','L','o','c','U']}
   if 'P' in fields: package_records.append(fields)
  package_records.append(kernel_package_record(inputs['kernel.apk']))
  # Versioned app-owned payload is installed from initramfs on every cold boot,
  # including existing disks. It never replaces the disk seed or user SSH files.
  payload=init/'pocket-ssh'; payload.mkdir()
  for name,(version,digest) in SSH_PACKAGES.items():
   archive=download_asset(name+'.apk',f'https://dl-cdn.alpinelinux.org/alpine/v3.23/main/x86/{name}-{version}.apk',digest)
   with tarfile.open(archive,ignore_zeros=True) as package:
    fields=dict(line.split(' = ',1) for line in package.extractfile('.PKGINFO').read().decode().splitlines() if ' = ' in line)
    record={key:fields[field] for key,field in {'P':'pkgname','V':'pkgver','A':'arch','L':'license','o':'origin','c':'commit'}.items()}
    if not any((p['P'],p['V'],p['A']) == (record['P'],record['V'],record['A']) for p in package_records): package_records.append(record)
    for member in package:
     if member.name.startswith(('lib/','usr/lib/','usr/bin/')): package.extract(member,payload,filter='data')
  for name,dest in [('pocket-ssh','ssh'),('pocket-ssh-proxy','proxy')]:
   shutil.copyfile(ROOT/'scripts/build-alpine'/name,payload/dest)
   (payload/dest).chmod(0o755)
  for name,(version,digest) in RESIZE_PACKAGES.items():
   archive=download_asset(name+'.apk',f'https://dl-cdn.alpinelinux.org/alpine/v3.23/main/x86/{name}-{version}.apk',digest)
   with tarfile.open(archive,ignore_zeros=True) as package:
    fields=dict(line.split(' = ',1) for line in package.extractfile('.PKGINFO').read().decode().splitlines() if ' = ' in line)
    record={key:fields[field] for key,field in {'P':'pkgname','V':'pkgver','A':'arch','L':'license','o':'origin','c':'commit'}.items()}
    if not any(p['P']==record['P'] for p in package_records): package_records.append(record)
    for member in package:
     if member.name.startswith(('lib/','usr/lib/')) or member.name.endswith('/resize2fs'): package.extract(member,init,filter='data')
  for entry in json.loads((ROOT/'scripts/packages/lock.json').read_text())['files']:
   with tarfile.open(ROOT/'public/packages'/entry['path'],ignore_zeros=True) as package:
    fields=dict(line.split(' = ',1) for line in package.extractfile('.PKGINFO').read().decode().splitlines() if ' = ' in line)
    record={key:fields[field] for key,field in {'P':'pkgname','V':'pkgver','A':'arch','L':'license','o':'origin','c':'commit'}.items()}
    if not any((p['P'],p['V'])==(record['P'],record['V']) for p in package_records): package_records.append(record)
  (OUT/'packages.json').write_text(json.dumps(package_records,indent=2)+'\n')
  for target, name in [(init / 'init','init'),(fs / 'sbin/pocket-init','pocket-init'),(fs / 'sbin/pocket-bridge','pocket-bridge')]:
   shutil.copyfile(ROOT / 'scripts/build-alpine' / name, target); target.chmod(0o755)
  (fs/'etc/hostname').write_text('alpine-pocket\n')
  (fs/'etc/profile.d/pocket.sh').write_text("export TERM=xterm-256color\nexport PS1='\\w \\$ '\n")
  (fs/'root').chmod(0o700)
  # Host uid/gid and timestamps must not leak into the generated guest.
  for tree in [fs,init]:
   for p in [tree,*tree.rglob('*')]:
    try: os.utime(p,(0,0),follow_symlinks=False)
    except OSError: pass
  disk=tmp/'root.img'
  subprocess.run(['truncate','-s','512M',str(disk)],check=True)
  env={**os.environ,'E2FSPROGS_FAKE_TIME':'1'}
  subprocess.run(['mke2fs','-q','-t','ext4','-b','4096','-U','7bf02af6-4abb-4bb6-9ed7-d47920120800','-E','root_owner=0:0,lazy_itable_init=0,lazy_journal_init=0,hash_seed=7bf02af6-4abb-4bb6-9ed7-d47920120800','-d',str(fs),str(disk)],check=True,env=env)
  # mke2fs -d preserves uid/gid from source; explicitly normalize every inode.
  commands=[]
  for p in [fs,*fs.rglob('*')]:
   rel='/' + str(p.relative_to(fs)) if p!=fs else '/'
   commands.extend([f'set_inode_field "{rel}" uid 0',f'set_inode_field "{rel}" gid 0',*[f'set_inode_field "{rel}" {field} 0' for field in ['atime','mtime','ctime','crtime','generation']]])
  batch=tmp/'debugfs.commands';batch.write_text('\n'.join(commands)+'\n')
  subprocess.run(['debugfs','-w','-f',str(batch),str(disk)],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,env=env)
  with open(OUT/'rootfs.img.gzip.bin','wb') as out: out.write(gzip.compress(disk.read_bytes(),mtime=0))
  files=subprocess.check_output(['find','.','-print0'],cwd=init)
  archive=subprocess.check_output(['cpio','--null','-o','--format=newc','--owner=0:0','--reproducible','--quiet'],cwd=init,input=files)
  (OUT/'initramfs.gzip.bin').write_bytes(gzip.compress(archive,mtime=0))
  shutil.copyfile(kernel/'boot/vmlinuz-virt', OUT/'vmlinuz')
 # BIOS pinned to the exact v86 source commit matching the npm package.
 commit='cc37f35c43bf14865d74ad76879ecf9410f69eb1'
 for name in ['seabios.bin','vgabios.bin']:
  expected={'seabios.bin':'73e3f359102e3a9982c35fce98eb7cd08f18303ac7f1ba6ebfbe6cdc1c244d98','vgabios.bin':'a4bc0d80cc3ca028c73dafa8fee396b8d054ce87ebd8abfbd31b06b437607880'}[name]
  p=download_asset(name, f'https://raw.githubusercontent.com/copy/v86/{commit}/bios/{name}', expected)
  shutil.copyfile(p,OUT/name)
 shutil.copyfile(ROOT/'node_modules/v86/build/v86.wasm',OUT/'v86.wasm')
 ort=json.loads((ROOT/'node_modules/onnxruntime-web/package.json').read_text())['version']
 ai=ROOT/'public/ai'/('ort-'+ort);ai.mkdir(parents=True,exist_ok=True)
 for ext in ['mjs','wasm']:
  name='ort-wasm-simd-threaded.'+ext
  shutil.copyfile(ROOT/'node_modules/onnxruntime-web/dist'/name,ai/name)
 manifest={'format':1,'image':'alpine-3.23.7-x86-pocket-1','runtime':'0.5.472','diskBytes':536870912,'inputs':INPUTS,'assets':{}}
 for p in sorted(OUT.iterdir()):
  if p.name!='assets.json' and not p.name.startswith('.'): manifest['assets'][p.name]={'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()}
 (OUT/'assets.json').write_text(json.dumps(manifest,indent=2)+'\n')
 print('Built Alpine 3.23.7 x86 image, kernel 6.18.60, 512 MiB ext4 disk.')
if __name__=='__main__': main()
