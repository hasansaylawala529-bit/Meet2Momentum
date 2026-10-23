import pytest
from evals.gold_dataset import GOLD_DATASET
from evals.benchmark import evaluate_dataset


def test_gold_dataset_benchmark_metrics():
    """Verify evaluation benchmark metrics across gold dataset meets hackathon criteria."""
    metrics = evaluate_dataset(GOLD_DATASET)
    
    assert metrics["total_meetings"] == 12
    assert metrics["total_gold_actions"] >= 30
    assert metrics["total_gold_commitments"] >= 10
    
    # Assert key PS criteria thresholds
    assert metrics["action_item_f1"] >= 0.85, "Action item F1 must meet or exceed 85%"
    assert metrics["commitment_f1"] >= 0.80, "Commitment classification F1 must meet or exceed 80%"
    assert metrics["grounding_accuracy"] >= 0.95, "Verbatim evidence grounding must exceed 95%"
    assert metrics["classification_accuracy"] >= 0.85, "Overall classification must meet or exceed 85%"
    assert metrics["firewall_protection_rate"] == 1.0, "Commitment Firewall must block 100% of unapproved items"
