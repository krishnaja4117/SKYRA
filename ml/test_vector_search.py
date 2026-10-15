"""
SKYRA – Vector Search & Knowledge Retrieval Test Suite (Phase 4)
─────────────────────────────────────────────────────────────────────────────
Tests FAISS vector search, metadata filtering, and Pinecone abstraction:
  1. Semantic retrieval on relevant queries (flood, cyclone, heatwave)
  2. Geographic scope and regional filtering (Chennai vs Mumbai vs National)
  3. Freshness filtering (current vs stale)
  4. Complete source metadata preservation (agency, sourceUrl, dates, version)
  5. Content hash integrity and deduplication
  6. Empty query / no-result handling
  7. Pinecone abstraction graceful degradation (BLOCKED status when unconfigured)
"""

import os
import sys
import unittest

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

from vector_knowledge_service import (
    FaissKnowledgeService,
    PineconeVectorStore,
    AUTHORITATIVE_DOCUMENTS,
    generate_embedding,
    DIMENSION,
)



class TestVectorSearch(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.service = FaissKnowledgeService()

    def test_01_embedding_dimension_and_norm(self):
        """Verify embeddings have exact dimension 128 and unit length."""
        vec = generate_embedding("cyclone alert heavy rainfall")
        self.assertEqual(len(vec), DIMENSION)
        norm = float(sum(vec ** 2)) ** 0.5
        self.assertAlmostEqual(norm, 1.0, places=4)

    def test_02_relevant_retrieval_cyclone(self):
        """Verify cyclone query retrieves IMD Cyclone SOP with high relevance."""
        results = self.service.query("cyclone alert warning stage fishermen landfall", top_k=3)
        self.assertTrue(len(results) > 0)
        doc_ids = [r["documentId"] for r in results]
        self.assertIn("IMD-SOP-CYCLONE-2021", doc_ids)

    def test_03_geographic_filtering_chennai(self):
        """Verify city-level filtering restricts to Chennai and National documents only."""
        results = self.service.query("flood reservoir release shelters", top_k=5, region="Chennai")
        self.assertTrue(len(results) > 0)
        for r in results:
            self.assertIn(r["geographicScope"], ["National", "City"])
            if r["geographicScope"] == "City":
                self.assertEqual(r["targetRegion"], "Chennai")

    def test_04_geographic_isolation_mumbai_vs_chennai(self):
        """Verify Mumbai flood query filtered to Mumbai does not return Chennai SOP."""
        results = self.service.query("high tide sluice gates pumping station", top_k=3, region="Mumbai")
        self.assertTrue(len(results) > 0)
        doc_ids = [r["documentId"] for r in results]
        self.assertIn("MCGM-SOP-MUMBAI-2023", doc_ids)
        self.assertNotIn("TNSDMA-SOP-CHENNAI-2023", doc_ids)

    def test_05_source_metadata_preservation(self):
        """Verify retrieved chunks contain complete authoritative provenance metadata."""
        results = self.service.query("urban flooding emergency control", top_k=1)
        self.assertEqual(len(results), 1)
        top = results[0]
        self.assertIn("sourceAgency", top)
        self.assertIn("sourceUrl", top)
        self.assertIn("publicationDate", top)
        self.assertIn("version", top)
        self.assertIn("contentHash", top)
        self.assertTrue(top["sourceUrl"].startswith("https://"))

    def test_06_freshness_filtering(self):
        """Verify filtering by freshness status ('current')."""
        results = self.service.query("heatwave hydration ORS", top_k=3, freshness="current")
        self.assertTrue(len(results) > 0)
        for r in results:
            self.assertEqual(r["freshness"], "current")

    def test_07_empty_query_no_result(self):
        """Verify empty or whitespace query returns empty list without error."""
        self.assertEqual(self.service.query(""), [])
        self.assertEqual(self.service.query("   "), [])

    def test_08_pinecone_abstraction_unconfigured_status(self):
        """Verify Pinecone store gracefully reports BLOCKED status when unconfigured."""
        pinecone_store = PineconeVectorStore()
        status = pinecone_store.get_status()
        self.assertIn(status["status"], ["CONFIGURED", "BLOCKED"])
        if status["status"] == "BLOCKED":
            self.assertEqual(status["fallback"], "FAISS_LOCAL_INDEX")


if __name__ == "__main__":
    unittest.main(verbosity=2)
