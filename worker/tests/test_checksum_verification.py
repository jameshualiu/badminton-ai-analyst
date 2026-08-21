"""
Mirrors the R2-fallback checksum verification in worker/app.py (SEC-02).

Reimplemented locally rather than imported, per this repo's test convention:
worker/app.py has module-level modal.App()/Volume.from_name() calls that
aren't safe to trigger in a test environment. If you change the checksum
logic in worker/app.py, update this mirror too.
"""
import hashlib
import tempfile
from pathlib import Path


def _verify_checksum(path, expected_sha256):
    digest = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            digest.update(chunk)
    actual = digest.hexdigest()
    if actual != expected_sha256:
        raise ValueError(f"Checksum mismatch for {path.name}: expected {expected_sha256}, got {actual}")


def _write_temp_file(tmp_path, content: bytes):
    p = tmp_path / "checkpoint.pth"
    p.write_bytes(content)
    return p


def test_matching_checksum_passes_silently():
    with tempfile.TemporaryDirectory() as d:
        path = _write_temp_file(Path(d), b"legit checkpoint bytes")
        expected = hashlib.sha256(b"legit checkpoint bytes").hexdigest()

        _verify_checksum(path, expected)  # should not raise


def test_mismatched_checksum_raises():
    with tempfile.TemporaryDirectory() as d:
        path = _write_temp_file(Path(d), b"tampered checkpoint bytes")
        expected = hashlib.sha256(b"legit checkpoint bytes").hexdigest()

        try:
            _verify_checksum(path, expected)
            assert False, "expected ValueError for checksum mismatch"
        except ValueError as e:
            assert "Checksum mismatch" in str(e)


def test_verifies_full_file_content_not_just_size():
    # Same length, different bytes -- must still be caught.
    with tempfile.TemporaryDirectory() as d:
        path = _write_temp_file(Path(d), b"AAAAAAAAAA")
        expected = hashlib.sha256(b"BBBBBBBBBB").hexdigest()

        try:
            _verify_checksum(path, expected)
            assert False, "expected ValueError for same-length content mismatch"
        except ValueError:
            pass


def test_pinned_checksums_are_real_sha256_hex_digests():
    # Regression guard: catches an accidentally truncated/malformed pin.
    pins = {
        "court_kpRCNN.pth": "5b34099870fd694bb996bab5e99559fa26fd3f14178d1d09742dece4682b69af",
        "net_kpRCNN.pth": "965149ce6eb230e76ae5682acfacbaf52df325327fc115fd2211b5b7204ed2bc",
    }
    for filename, digest_hex in pins.items():
        assert len(digest_hex) == 64, f"{filename}'s pinned checksum is not 64 hex chars: {digest_hex}"
        assert all(c in "0123456789abcdef" for c in digest_hex), f"{filename}'s pinned checksum is not lowercase hex"
