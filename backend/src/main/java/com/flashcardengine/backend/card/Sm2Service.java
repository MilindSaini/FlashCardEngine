package com.flashcardengine.backend.card;

import com.flashcardengine.backend.persistence.entity.CardSm2StateEntity;
import org.springframework.stereotype.Service;

import java.time.LocalDate;

@Service
public class Sm2Service {

    public CardSm2StateEntity applyReview(CardSm2StateEntity state,
                                          int grade,
                                          long previousReviewCount,
                                          LocalDate reviewDate) {
        if (grade < 0 || grade > 5) {
            throw new IllegalArgumentException("Grade must be between 0 and 5");
        }

        double ef = state.getEasinessFactor();
        int previousInterval = Math.max(1, state.getIntervalDays());
        int repetitionCount = Math.max(0, state.getRepetitionCount());

        double qualityPenalty = (5 - grade) * (0.08 + (5 - grade) * 0.02);
        ef = Math.max(1.3, ef + 0.1 - qualityPenalty);
        state.setEasinessFactor(ef);

        int intervalDays;
        if (grade < 3) {
            repetitionCount = 0;
            intervalDays = 1;
        } else {
            if (repetitionCount == 0) {
                intervalDays = 1;
            } else if (repetitionCount == 1) {
                intervalDays = 6;
            } else {
                intervalDays = Math.max(1, (int) Math.round(previousInterval * ef));
            }
            repetitionCount += 1;
        }

        double averageGrade = ((state.getAverageGrade() * previousReviewCount) + grade) / (previousReviewCount + 1);

        state.setAverageGrade(averageGrade);
        state.setIntervalDays(intervalDays);
        state.setRepetitionCount(repetitionCount);
        state.setNextReviewDate(reviewDate.plusDays(intervalDays));

        return state;
    }

    public boolean isMastered(CardSm2StateEntity state) {
        return state.getRepetitionCount() >= Sm2Thresholds.MASTERED_MIN_REPETITIONS
            && state.getAverageGrade() >= Sm2Thresholds.MASTERED_MIN_AVERAGE_GRADE;
    }

    public boolean isShaky(CardSm2StateEntity state) {
        return state.getAverageGrade() < Sm2Thresholds.SHAKY_MAX_AVERAGE_GRADE;
    }

    public boolean isUpcoming(CardSm2StateEntity state, LocalDate today) {
        return !state.getNextReviewDate().isAfter(today);
    }
}
