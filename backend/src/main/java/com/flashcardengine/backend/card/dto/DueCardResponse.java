package com.flashcardengine.backend.card.dto;

import com.flashcardengine.backend.persistence.entity.CardType;

import java.util.UUID;

public record DueCardResponse(
    UUID id,
    CardType type,
    String front,
    String back
) {
}
