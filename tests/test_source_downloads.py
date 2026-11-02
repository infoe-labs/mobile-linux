"""Source acquisition failures must never bypass archive/checksum validation."""
import importlib.util
import io
import pathlib
import tempfile
import unittest
import urllib.error
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('sources', pathlib.Path(__file__).parents[1] / 'scripts/build-alpine/sources.py')
sources = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sources)


class Downloads(unittest.TestCase):
    def test_access_rejection_falls_back_and_caches_only_complete_response(self):
        with tempfile.TemporaryDirectory() as directory:
            target = pathlib.Path(directory) / 'asset'
            rejected = urllib.error.HTTPError('https://primary.invalid', 418, 'blocked', None, None)
            with patch.object(sources.urllib.request, 'urlopen', side_effect=[rejected, io.BytesIO(b'archive')]) as request:
                sources.fetch('https://primary.invalid', target, fallback_urls=('https://mirror.invalid',))
            self.assertEqual(request.call_count, 2)
            self.assertEqual(target.read_bytes(), b'archive')
            self.assertFalse(target.with_name('asset.part').exists())

    def test_invalid_archive_is_not_cached_and_uses_fallback(self):
        with tempfile.TemporaryDirectory() as directory:
            target = pathlib.Path(directory) / 'archive'
            with patch.object(sources.urllib.request, 'urlopen', side_effect=[io.BytesIO(b'HTML challenge'), io.BytesIO(b'valid')]):
                sources.fetch('https://primary.invalid', target, fallback_urls=('https://mirror.invalid',), validate=lambda p: p.read_bytes() == b'valid')
            self.assertEqual(target.read_bytes(), b'valid')

    def test_exhaustion_leaves_no_partial_cache(self):
        with tempfile.TemporaryDirectory() as directory:
            target = pathlib.Path(directory) / 'asset'
            with patch.object(sources.urllib.request, 'urlopen', side_effect=TimeoutError), patch.object(sources.time, 'sleep'):
                with self.assertRaises(RuntimeError):
                    sources.fetch('https://primary.invalid', target)
            self.assertFalse(target.exists())
            self.assertFalse(target.with_name('asset.part').exists())

    def test_multiple_providers_validate_before_accepting_archive(self):
        with tempfile.TemporaryDirectory() as directory:
            target = pathlib.Path(directory) / 'archive'
            rejected = urllib.error.HTTPError('https://primary.invalid', 404, 'missing', None, None)
            responses = [rejected, io.BytesIO(b'HTML challenge'), io.BytesIO(b'archive')]
            with patch.object(sources.urllib.request, 'urlopen', side_effect=responses) as request:
                sources.fetch('https://primary.invalid', target,
                              fallback_urls=('https://api.invalid', 'https://archive.invalid'),
                              validate=lambda p: p.read_bytes() == b'archive')
            self.assertEqual([call.args[0] for call in request.call_args_list],
                             ['https://primary.invalid', 'https://api.invalid', 'https://archive.invalid'])
            self.assertEqual(target.read_bytes(), b'archive')
            self.assertFalse(target.with_name('archive.part').exists())
