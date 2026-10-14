import socket
import unittest
from unittest.mock import patch

from app import AppError, app, normalize_url, split_chunks


class ChunkingTests(unittest.TestCase):
    def test_chunks_respect_limit_and_overlap(self):
        text = "A " * 1200
        chunks = split_chunks(text)
        self.assertGreater(len(chunks), 1)
        self.assertTrue(all(len(chunk) <= 800 for chunk in chunks))
        self.assertTrue(set(chunks[0][-40:].split()) & set(chunks[1][:40].split()))


class UrlValidationTests(unittest.TestCase):
    def test_rejects_local_addresses(self):
        for url in ("http://localhost/", "http://127.0.0.1/", "http://[::1]/"):
            with self.subTest(url=url), self.assertRaises(AppError):
                normalize_url(url)

    @patch("app.socket.getaddrinfo")
    def test_accepts_and_normalizes_public_url(self, getaddrinfo):
        getaddrinfo.return_value = [
            (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("93.184.216.34", 0))
        ]
        self.assertEqual(
            normalize_url("HTTPS://Example.COM:443/docs#top"),
            "https://example.com/docs",
        )


class ApiTests(unittest.TestCase):
    def setUp(self):
        app.config["TESTING"] = True
        self.client = app.test_client()

    @patch("app.available_models", return_value=["llama3.2:latest"])
    def test_health_reports_local_ollama_models(self, _available_models):
        response = self.client.get("/api/health")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json["ollama"])
        self.assertIn("llama3.2:latest", response.json["models"])

    def test_chat_rejects_empty_question(self):
        response = self.client.post("/api/chat", json={"question": " "})
        self.assertEqual(response.status_code, 400)
        self.assertIn("error", response.json)

    def test_research_session_can_be_reopened_and_removed(self):
        created = self.client.post("/api/sessions")
        self.assertEqual(created.status_code, 201)
        session_id = created.json["id"]
        reopened = self.client.get(f"/api/sessions/{session_id}")
        self.assertEqual(reopened.status_code, 200)
        self.assertEqual(reopened.json["messages"], [])
        removed = self.client.delete(f"/api/sessions/{session_id}")
        self.assertEqual(removed.status_code, 200)


if __name__ == "__main__":
    unittest.main()
