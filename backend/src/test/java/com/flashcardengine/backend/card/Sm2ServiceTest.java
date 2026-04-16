package com.flashcardengine.backend.card;

import com.flashcardengine.backend.persistence.entity.CardSm2StateEntity;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class Sm2ServiceTest {

    private final Sm2Service sm2Service = new Sm2Service();

    @Test
    void shouldApplyFirstSuccessfulReviewWithIntervalOne() {
        CardSm2StateEntity state = baseState(2.5, 1, 0, 0.0);

        sm2Service.applyReview(state, 5, 0, LocalDate.of(2026, 4, 14));

        assertEquals(1, state.getRepetitionCount());
        assertEquals(1, state.getIntervalDays());
        assertEquals(2.6, state.getEasinessFactor(), 0.0001);
        assertEquals(LocalDate.of(2026, 4, 15), state.getNextReviewDate());
    }

    @Test
    void shouldApplySecondSuccessfulReviewWithIntervalSix() {
        CardSm2StateEntity state = baseState(2.6, 1, 1, 5.0);

        sm2Service.applyReview(state, 4, 1, LocalDate.of(2026, 4, 14));

        assertEquals(2, state.getRepetitionCount());
        assertEquals(6, state.getIntervalDays());
        assertTrue(state.getEasinessFactor() >= 1.3);
        assertEquals(LocalDate.of(2026, 4, 20), state.getNextReviewDate());
    }

    @Test
    void shouldUsePreviousIntervalTimesEfAfterSecondRepetition() {
        CardSm2StateEntity state = baseState(2.5, 6, 2, 4.0);

        sm2Service.applyReview(state, 5, 2, LocalDate.of(2026, 4, 14));

        assertEquals(3, state.getRepetitionCount());
        assertEquals(16, state.getIntervalDays());
        assertEquals(LocalDate.of(2026, 4, 30), state.getNextReviewDate());
    }

    @Test
    void shouldResetRepetitionOnLowGrade() {
        CardSm2StateEntity state = baseState(2.0, 8, 4, 3.5);

        sm2Service.applyReview(state, 2, 4, LocalDate.of(2026, 4, 14));

        assertEquals(0, state.getRepetitionCount());
        assertEquals(1, state.getIntervalDays());
        assertEquals(LocalDate.of(2026, 4, 15), state.getNextReviewDate());
    }

    @Test
    void shouldRespectEfLowerBound() {
        CardSm2StateEntity state = baseState(1.35, 2, 1, 1.0);

        sm2Service.applyReview(state, 0, 1, LocalDate.of(2026, 4, 14));

        assertEquals(1.3, state.getEasinessFactor(), 0.0001);
    }

    @Test
    void shouldUpdateAverageGradeAsRunningAverage() {
        CardSm2StateEntity state = baseState(2.5, 1, 1, 4.0);

        sm2Service.applyReview(state, 2, 3, LocalDate.of(2026, 4, 14));

        assertEquals(3.5, state.getAverageGrade(), 0.0001);
    }

    private CardSm2StateEntity baseState(double ef, int interval, int repetitions, double averageGrade) {
        CardSm2StateEntity state = new CardSm2StateEntity();
        state.setEasinessFactor(ef);
        state.setIntervalDays(interval);
        state.setRepetitionCount(repetitions);
        state.setAverageGrade(averageGrade);
        state.setNextReviewDate(LocalDate.now());
        return state;
    }
}
