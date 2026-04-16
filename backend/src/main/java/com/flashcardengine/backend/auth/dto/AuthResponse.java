package com.flashcardengine.backend.auth.dto;

import java.util.UUID;

public record AuthResponse(
    String token,
    UUID userId,
    String email
) {
}
