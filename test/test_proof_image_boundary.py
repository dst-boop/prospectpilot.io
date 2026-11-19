import copy
import importlib.util
import io
from pathlib import Path
import tarfile
import unittest

spec = importlib.util.spec_from_file_location('proof_boundary', Path(__file__).resolve().parents[1] / 'scripts/verify-proof-image-boundary.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

class ProofBoundary(unittest.TestCase):
    def fixture(self):
        parent = {'Id': 'parent', 'Config': {'Cmd': ['node', 'server.mjs'], 'User': 'node'}, 'RootFS': {'Layers': ['base']}}
        child = copy.deepcopy(parent); child['Id'] = 'proof'; child['RootFS']['Layers'].append('proof')
        files = {'etc/ssl/cert.pem': ['0', 420, 0, 0, '', 'cert'], 'usr/local/bin/node': ['0', 493, 0, 0, '', 'node'], 'app': ['5', 493, 0, 0, '', None], 'app/server.mjs': ['0', 420, 0, 0, '', 'source'], 'app/link': ['2', 511, 0, 0, 'server.mjs', None]}
        files = {key: value + [{}] for key, value in files.items()}
        proof = copy.deepcopy(files); proof['app/scripts/proof.mjs'] = ['0', 420, 0, 0, '', 'proof', {}]
        return parent, child, files, proof, {'app/scripts/proof.mjs': 'proof'}
    def test_only_exact_proof_addition(self):
        m.compare(*self.fixture())
    def test_denies_outside_app_and_metadata_drift(self):
        for path in ['etc/ssl/cert.pem', 'usr/local/bin/node', 'app/server.mjs', 'app/link', 'app']:
            for field in range(7):
                args = list(self.fixture()); args[3][path][field] = 'changed'
                with self.assertRaises(ValueError): m.compare(*args)
        for mode in ['add', 'remove', 'proof_change', 'proof_missing']:
            args = list(self.fixture())
            if mode == 'add': args[3]['etc/extra'] = ['0',420,0,0,'','extra']
            if mode == 'remove': del args[3]['etc/ssl/cert.pem']
            if mode == 'proof_change': args[3]['app/scripts/proof.mjs'][5] = 'wrong'
            if mode == 'proof_missing': del args[3]['app/scripts/proof.mjs']
            with self.assertRaises(ValueError): m.compare(*args)
    def test_denies_configuration_layers_and_volumes(self):
        for key in m.CONFIG_KEYS + ['FutureConfigProperty']:
            args = list(self.fixture()); args[1]['Config'][key] = 'changed'
            with self.assertRaises(ValueError): m.compare(*args)
        for layers in [[], ['different','proof'], ['base'], ['base','extra','proof']]:
            args = list(self.fixture()); args[1]['RootFS']['Layers'] = layers
            with self.assertRaises(ValueError): m.compare(*args)
    def test_stream_hashes_all_files_and_rejects_duplicates(self):
        def make(names):
            output = io.BytesIO()
            with tarfile.open(fileobj=output, mode='w') as archive:
                for name in names:
                    entry = tarfile.TarInfo(name); entry.size = 3; entry.mode = 0o644
                    archive.addfile(entry, io.BytesIO(b'abc'))
            output.seek(0); return output
        result = m.snapshot(make(['etc/hosts','app/server.mjs']))
        self.assertEqual(set(result), {'etc/hosts','app/server.mjs'})
        self.assertEqual(result['etc/hosts'][5], m.hashlib.sha256(b'abc').hexdigest())
        for names in [['a','a'], ['../escape']]:
            with self.assertRaises(ValueError): m.snapshot(make(names))
    def test_requires_immutable_ids_before_docker(self):
        for args in [[], ['tag','tag','runtime'], ['sha256:'+'a'*64,'sha256:'+'b'*64,'unknown']]:
            with self.assertRaises(ValueError): m.main(args)

    def test_parser_preserves_links_and_extended_attributes_without_following(self):
        output = io.BytesIO()
        with tarfile.open(fileobj=output, mode='w', format=tarfile.PAX_FORMAT) as archive:
            entry = tarfile.TarInfo('usr/bin/node'); entry.size = 3
            entry.pax_headers = {'SCHILY.xattr.security.capability': 'synthetic-capability', 'mtime': '1.5'}
            archive.addfile(entry, io.BytesIO(b'abc'))
            for name, kind in [('app/symlink',tarfile.SYMTYPE), ('app/hardlink',tarfile.LNKTYPE)]:
                entry = tarfile.TarInfo(name); entry.type = kind; entry.linkname = '../../usr/bin/node'; archive.addfile(entry)
        output.seek(0); result = m.snapshot(output)
        self.assertEqual(result['usr/bin/node'][6], {'SCHILY.xattr.security.capability':'synthetic-capability'})
        self.assertEqual(result['app/symlink'][0], '2'); self.assertEqual(result['app/hardlink'][0], '1')
        self.assertEqual(result['app/symlink'][4], '../../usr/bin/node')
        for kind in ['2','1']:
            args = list(self.fixture()); args[3]['app/scripts/proof.mjs'][0] = kind
            with self.assertRaises(ValueError): m.compare(*args)
    def test_parser_refuses_special_types_and_path_aliases(self):
        for name, kind in [('dev/special',tarfile.CHRTYPE),('dev/fifo',tarfile.FIFOTYPE),('app/./alias',tarfile.REGTYPE),('app//alias',tarfile.REGTYPE)]:
            output = io.BytesIO()
            with tarfile.open(fileobj=output, mode='w') as archive:
                entry = tarfile.TarInfo(name); entry.type = kind; archive.addfile(entry)
            output.seek(0)
            with self.assertRaises(ValueError): m.snapshot(output)
