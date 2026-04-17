package com.flashcardengine.backend.analytics.dto;

import java.util.List;
import java.util.UUID;

public record DeckAnalyticsResponse(
    UUID deckId,
    long masteredCards,
    long shakyCards,
    long dueToday,
    ConceptGraph conceptGraph
) {
    public record ConceptGraph(List<ConceptNode> nodes, List<ConceptLink> links) {
    }

    public record ConceptNode(String id) {
    }

    public record ConceptLink(String source, String target, String label) {
    }
}
