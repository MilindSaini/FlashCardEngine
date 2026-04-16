package com.flashcardengine.backend.auth.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record SignupRequest(
    @Email String email,
    @NotBlank @Size(min = 8, max = 128) String password
) {
}
