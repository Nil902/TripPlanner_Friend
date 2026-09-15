"""
Pytest integration test verifying that the Agent Evaluation Harness runs and meets production score thresholds.
"""

from tests.eval.run_evals import run_evaluation_suite


def test_agent_evaluation_harness_pass_rate():
    """Verify that the agent's propose-validate loop achieves >= 88% benchmark pass rate
    and outperforms the naive baseline planner."""
    summary = run_evaluation_suite()
    assert summary["total_properties"] >= 15
    assert summary["agent_rate"] >= 88.0
    # Assert agent significantly outperforms naive baseline
    assert summary["agent_rate"] > summary["baseline_rate"]
