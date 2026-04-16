package com.flashcardengine.backend.ingestion;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class GeminiExtractionServiceTest {

    private final GeminiExtractionService service = new GeminiExtractionService(
        "",
        "gemini-1.5-flash",
        new ObjectMapper()
    );

    @Test
    void shouldFallbackForDefinitionsWhenNoApiKey() {
        var cards = service.extractDefinitions("Spaced repetition optimizes long-term memory by increasing review intervals.");

        assertFalse(cards.isEmpty());
        assertTrue(cards.getFirst().back().contains("Spaced repetition"));
    }

    @Test
    void shouldFallbackGraphJsonForRelationshipsWhenNoApiKey() {
        var cards = service.extractRelationships("Concept A depends on Concept B.");

        assertFalse(cards.isEmpty());
        assertTrue(cards.getFirst().back().contains("nodes"));
        assertTrue(cards.getFirst().back().contains("links"));
    }
}
