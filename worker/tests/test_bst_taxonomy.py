"""Unit tests for BST's 12-class -> product 6-class taxonomy collapse.

Mirrors PRODUCT_TYPE and the classify_hits post-processing filter in
worker/detectors/stroke_classifier.py without importing that module
(which pulls in torch + detectors.bst_model and requires real weights
to instantiate, per the pattern in worker/tests/ — see CLAUDE.md).
"""

KNOWN_PRODUCT_CLASSES = {"Clear", "Drive", "Drop", "Lob", "Net", "Smash"}

ALL_BST_CLASSES = {
    "Net Drop", "Block", "Smash", "Lift", "Clear", "Drive", "Drop",
    "Push", "Net Kill", "Cross-court Net", "Short Serve", "Long Serve",
}

# Mirrors stroke_classifier.PRODUCT_TYPE.
PRODUCT_TYPE = {
    "Net Drop": "Net",
    "Block": "Net",
    "Smash": "Smash",
    "Lift": "Lob",
    "Clear": "Clear",
    "Drive": "Drive",
    "Drop": "Drop",
    "Push": "Drive",
    "Net Kill": "Net",
    "Cross-court Net": "Net",
    "Short Serve": None,
    "Long Serve": None,
}


def collapse_bst_type(bst_type):
    """Mirrors the PRODUCT_TYPE lookup in stroke_classifier.classify_hits."""
    return PRODUCT_TYPE[bst_type]


def filter_classified_hits(hits):
    """Mirrors the post-loop filter that drops serve-classified hits."""
    return [h for h in hits if h["type"] is not None]


def test_all_twelve_bst_classes_have_a_mapping():
    assert set(PRODUCT_TYPE.keys()) == ALL_BST_CLASSES


def test_directly_matching_classes_are_unchanged():
    assert collapse_bst_type("Smash") == "Smash"
    assert collapse_bst_type("Clear") == "Clear"
    assert collapse_bst_type("Drive") == "Drive"
    assert collapse_bst_type("Drop") == "Drop"


def test_net_area_classes_collapse_to_net():
    assert collapse_bst_type("Net Drop") == "Net"
    assert collapse_bst_type("Block") == "Net"
    assert collapse_bst_type("Net Kill") == "Net"
    assert collapse_bst_type("Cross-court Net") == "Net"


def test_lift_collapses_to_lob():
    assert collapse_bst_type("Lift") == "Lob"


def test_push_collapses_to_drive():
    assert collapse_bst_type("Push") == "Drive"


def test_serves_map_to_none():
    assert collapse_bst_type("Short Serve") is None
    assert collapse_bst_type("Long Serve") is None


def test_every_non_serve_mapping_is_a_known_product_class():
    for bst_type, mapped in PRODUCT_TYPE.items():
        if mapped is not None:
            assert mapped in KNOWN_PRODUCT_CLASSES, f"{bst_type} -> {mapped} not a known product class"


def test_filter_drops_serve_hits_but_keeps_others():
    hits = [
        {"frame": 1, "type": "Net"},
        {"frame": 2, "type": None},   # was a serve, already mapped to None
        {"frame": 3, "type": "Smash"},
        {"frame": 4, "type": None},
    ]

    result = filter_classified_hits(hits)

    assert [h["frame"] for h in result] == [1, 3]
    assert all(h["type"] is not None for h in result)


def test_filter_keeps_unknown_hits():
    hits = [{"frame": 1, "type": "Unknown"}, {"frame": 2, "type": None}]

    result = filter_classified_hits(hits)

    assert [h["frame"] for h in result] == [1]
    assert result[0]["type"] == "Unknown"


def test_filter_preserves_other_hit_fields():
    hits = [{"frame": 5, "type": "Net", "side": "Top", "typeConfidence": 0.9}]

    result = filter_classified_hits(hits)

    assert result[0] == {"frame": 5, "type": "Net", "side": "Top", "typeConfidence": 0.9}
