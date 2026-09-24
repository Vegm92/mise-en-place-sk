import json
import sys
import tempfile
import types
import unittest
from pathlib import Path
from unittest import mock

import eval_match as em

FIXTURE = Path(__file__).parent / "fixtures" / "synthetic.jsonl"


class MetricsTest(unittest.TestCase):
    def test_auc_perfect_and_inverted(self):
        self.assertEqual(em.auc([0.9, 0.8, 0.1], [1, 1, 0]), 1.0)
        self.assertEqual(em.auc([0.1, 0.9], [1, 0]), 0.0)
        self.assertEqual(em.auc([0.5, 0.5], [1, 0]), 0.5)

    def test_auc_undefined_without_both_classes(self):
        self.assertIsNone(em.auc([0.9, 0.8], [1, 1]))

    def test_ece_zero_when_calibrated(self):
        self.assertAlmostEqual(em.ece([1.0, 0.0], [1, 0]), 0.0)
        self.assertAlmostEqual(em.ece([0.9, 0.9], [0, 0]), 0.9)

    def test_gate_stats(self):
        g = em.gate_stats([0.95, 0.85, 0.5, 0.9], [1, 0, 1, 0], 0.8)
        self.assertEqual(g["shown"], 3)
        self.assertAlmostEqual(g["precision"], 1 / 3)
        self.assertAlmostEqual(g["accepted_kept"], 0.5)
        self.assertAlmostEqual(g["rejected_suppressed"], 0.0)


class PipelineTest(unittest.TestCase):
    def test_stub_run_writes_report(self):
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / "report.json"
            self.assertEqual(em.main([str(FIXTURE), "--stub", "--out", str(out)]), 0)
            data = json.loads(out.read_text(encoding="utf-8"))
        groups = data["report"]["groups"]
        self.assertEqual(groups["all"]["n"], 8)
        self.assertEqual(set(groups), {"all", "llm", "fuzzy"})
        self.assertEqual(len(data["rows"]), 8)

    def test_laya_scorer_reads_noul_probability(self):
        agent = mock.Mock()
        agent.predict_batch.return_value = [
            {"answers": {"same_product": {"noul": 0.91}}},
            {"answers": {"same_product": {"noul": 0.12}}},
        ]
        fake = types.SimpleNamespace(load=mock.Mock(return_value=agent))
        with mock.patch.dict(sys.modules, {"laya": fake}):
            score = em.laya_scorer("multilingual", "cpu", 16)
            rows = em.load_rows(FIXTURE)[:2]
            self.assertEqual(score(rows), [0.91, 0.12])
        fake.load.assert_called_once_with(
            "convaiinnovations/laya", subfolder="multilingual", device="cpu"
        )
        states, questions = agent.predict_batch.call_args.args
        self.assertEqual(states[0]["producto_existente"], "Merluza filete")
        self.assertEqual(questions["same_product"]["type"], "noul")
        self.assertEqual(agent.predict_batch.call_args.kwargs, {"batch_size": 16, "lang": "es"})


if __name__ == "__main__":
    unittest.main()
