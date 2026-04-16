package com.flashcardengine.backend.card.dto;

import java.time.LocalDate;
import java.util.UUID;

public record ReviewResponse(
    UUID cardId,
    int grade,
    double easinessFactor,
    int intervalDays,
    int repetitionCount,
    double averageGrade,
    LocalDate nextReviewDate,
    boolean mastered,
    boolean shaky
) {
}
