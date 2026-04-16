package com.flashcardengine.backend.deck.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record CreateDeckRequest(
    @NotBlank @Size(max = 255) String title
) {
}
