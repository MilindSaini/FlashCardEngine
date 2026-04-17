package com.flashcardengine.backend.streak.dto;

import java.time.LocalDate;

public record UserStreakResponse(
    int currentStreakDays,
    int longestStreakDays,
    long totalLogins,
    long totalActions,
    LocalDate lastLoginDate,
    LocalDate lastActivityDate
) {
}
