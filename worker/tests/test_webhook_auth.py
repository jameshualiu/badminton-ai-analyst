"""
Mirrors the webhook auth/validation helpers in worker/app.py (SEC-01).

Reimplemented locally rather than imported, per this repo's test convention:
worker/app.py has module-level modal.App()/Volume.from_name() calls that
aren't safe to trigger in a test environment. If you change the validation
logic in worker/app.py, update this mirror too.
"""
import hmac
import uuid


def _validate_webhook_secret(authorization, expected_secret):
    if not authorization or not expected_secret:
        return False
    scheme, _, token = authorization.partition(" ")
    if scheme != "Bearer" or not token:
        return False
    return hmac.compare_digest(token, expected_secret)


def _validate_video_e2_key(video_e2_key, user_id):
    return isinstance(video_e2_key, str) and video_e2_key.startswith(f"uploads/{user_id}/")


def _validate_video_id(video_id):
    try:
        uuid.UUID(video_id)
        return True
    except (ValueError, AttributeError, TypeError):
        return False


class TestValidateWebhookSecret:
    def test_matching_bearer_token_passes(self):
        assert _validate_webhook_secret("Bearer s3cr3t", "s3cr3t") is True

    def test_mismatched_token_fails(self):
        assert _validate_webhook_secret("Bearer wrong", "s3cr3t") is False

    def test_missing_header_fails(self):
        assert _validate_webhook_secret(None, "s3cr3t") is False

    def test_missing_expected_secret_fails_closed(self):
        # An unset MODAL_WEBHOOK_SECRET env var must never make the check a no-op.
        assert _validate_webhook_secret("Bearer s3cr3t", None) is False

    def test_wrong_scheme_fails(self):
        assert _validate_webhook_secret("Basic s3cr3t", "s3cr3t") is False

    def test_bearer_with_no_token_fails(self):
        assert _validate_webhook_secret("Bearer ", "s3cr3t") is False


class TestValidateVideoE2Key:
    def test_key_scoped_to_user_passes(self):
        assert _validate_video_e2_key("uploads/user-1/video-1/a.mp4", "user-1") is True

    def test_key_scoped_to_other_user_fails(self):
        assert _validate_video_e2_key("uploads/user-2/video-1/a.mp4", "user-1") is False

    def test_key_outside_uploads_prefix_fails(self):
        assert _validate_video_e2_key("outputs/user-1/video-1/analysis.json", "user-1") is False

    def test_path_traversal_attempt_fails(self):
        assert _validate_video_e2_key("uploads/../secrets.env", "user-1") is False

    def test_non_string_key_fails(self):
        assert _validate_video_e2_key(None, "user-1") is False


class TestValidateVideoId:
    def test_well_formed_uuid_passes(self):
        assert _validate_video_id(str(uuid.uuid4())) is True

    def test_path_traversal_attempt_fails(self):
        assert _validate_video_id("../../etc/passwd") is False

    def test_empty_string_fails(self):
        assert _validate_video_id("") is False

    def test_non_string_fails(self):
        assert _validate_video_id(None) is False
