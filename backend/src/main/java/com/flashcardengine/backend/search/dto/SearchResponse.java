package com.flashcardengine.backend.search.dto;

import java.util.List;

public record SearchResponse(
    String mode,
    String query,
    List<SearchCardResultResponse> results
) {
}
