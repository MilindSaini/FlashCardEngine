package com.flashcardengine.backend.ingestion;

import java.util.List;

public interface AIExtractionService {

    List<GeneratedCardDraft> extractDefinitions(String chunk);

    List<GeneratedCardDraft> extractRelationships(String chunk);

    List<GeneratedCardDraft> extractEdgeCases(String chunk);

    List<GeneratedCardDraft> extractWorkedExamples(String chunk);

    default GeneratedCardDraft buildDeckConceptGraph(List<GeneratedCardDraft> cards) {
        return null;
    }

    default List<GeneratedCardDraft> refineDrafts(String chunk, List<GeneratedCardDraft> drafts) {
        return drafts == null ? List.of() : drafts;
    }
}
