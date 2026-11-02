"""Pinned VM inputs must not reuse stale or partially downloaded packages."""
import hashlib
import importlib.util
import io
from pathlib import Path
import sys
import tarfile
import tempfile
import unittest
from unittest.mock import patch

scripts = Path(__file__).parents[1] / 'scripts/build-alpine'
with patch.object(sys, 'path', [str(scripts), *sys.path]):
    spec = importlib.util.spec_from_file_location('image_builder', scripts / 'build.py')
    builder = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(builder)


class AssetDownloads(unittest.TestCase):
    def test_pin_update_ignores_legacy_cache_and_caches_verified_bytes(self):
        with tempfile.TemporaryDirectory() as directory:
            cache = Path(directory)
            (cache / 'kernel.apk').write_bytes(b'old package')
            digest = hashlib.sha256(b'new package').hexdigest()
            with patch.object(builder, 'CACHE', cache), patch('urllib.request.urlopen', return_value=io.BytesIO(b'new package')):
                target = builder.download_asset('kernel.apk', 'https://example.invalid/kernel.apk', digest)
            self.assertEqual(target.read_bytes(), b'new package')
            self.assertEqual(target.name, 'kernel.apk.' + digest)
            self.assertEqual((cache / 'kernel.apk').read_bytes(), b'old package')
            with patch.object(builder, 'CACHE', cache), patch('urllib.request.urlopen') as request:
                self.assertEqual(builder.download_asset('kernel.apk', 'https://example.invalid/kernel.apk', digest), target)
                request.assert_not_called()

    def test_mismatched_download_never_enters_cache(self):
        with tempfile.TemporaryDirectory() as directory:
            cache = Path(directory)
            digest = hashlib.sha256(b'expected').hexdigest()
            with patch.object(builder, 'CACHE', cache), patch('urllib.request.urlopen', return_value=io.BytesIO(b'wrong package')):
                with self.assertRaises(RuntimeError):
                    builder.download_asset('kernel.apk', 'https://example.invalid/kernel.apk', digest)
            self.assertEqual(list(cache.iterdir()), [])

    def test_truncated_response_leaves_no_partial_cache(self):
        class InterruptedResponse(io.BytesIO):
            def read(self, *args):
                raise OSError('Interrupted synthetic download')
        with tempfile.TemporaryDirectory() as directory:
            cache = Path(directory)
            digest = hashlib.sha256(b'expected').hexdigest()
            with patch.object(builder, 'CACHE', cache), patch('urllib.request.urlopen', side_effect=lambda *a, **kw: InterruptedResponse()), patch('time.sleep'):
                with self.assertRaises(RuntimeError):
                    builder.download_asset('kernel.apk', 'https://example.invalid/kernel.apk', digest)
            self.assertEqual(list(cache.iterdir()), [])

    def record(self, metadata):
        with tempfile.TemporaryDirectory() as directory:
            archive = Path(directory) / 'kernel.apk'
            with tarfile.open(archive, 'w:gz') as package:
                member = tarfile.TarInfo('.PKGINFO')
                member.size = len(metadata)
                package.addfile(member, io.BytesIO(metadata))
            return builder.kernel_package_record(archive)

    def test_kernel_record_comes_from_control_metadata(self):
        metadata = b'pkgname = linux-virt\npkgver = 1.2.3-r4\narch = x86\nlicense = GPL-2.0-only\norigin = linux-lts\ncommit = example-source-commit\nmaintainer = Example\n'
        self.assertEqual(self.record(metadata), {
            'P': 'linux-virt', 'V': '1.2.3-r4', 'A': 'x86',
            'L': 'GPL-2.0-only', 'o': 'linux-lts', 'c': 'example-source-commit',
        })

    def test_kernel_record_rejects_wrong_architecture(self):
        with self.assertRaises(RuntimeError):
            self.record(b'pkgname = linux-virt\narch = aarch64\n')
