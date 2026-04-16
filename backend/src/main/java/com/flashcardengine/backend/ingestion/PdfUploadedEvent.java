package com.flashcardengine.backend.ingestion;

import java.util.UUID;

public record PdfUploadedEvent(
    UUID userId,
    UUID deckId,
    String fileKey
) {
}
