package com.flashcardengine.backend.card;

import com.flashcardengine.backend.card.dto.ReviewResponse;
import com.flashcardengine.backend.persistence.entity.CardEntity;
import com.flashcardengine.backend.persistence.entity.CardSm2StateEntity;
import com.flashcardengine.backend.persistence.entity.ReviewHistoryEntity;
import com.flashcardengine.backend.persistence.entity.UserEntity;
import com.flashcardengine.backend.persistence.repository.CardRepository;
import com.flashcardengine.backend.persistence.repository.CardSm2StateRepository;
import com.flashcardengine.backend.persistence.repository.ReviewHistoryRepository;
import com.flashcardengine.backend.persistence.repository.UserRepository;
import com.flashcardengine.backend.session.SessionCardProgressService;
import com.flashcardengine.backend.streak.UserStreakService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

import static org.springframework.http.HttpStatus.NOT_FOUND;

@Service
public class ReviewService {

    private static final Logger LOGGER = LoggerFactory.getLogger(ReviewService.class);

    private final CardRepository cardRepository;
    private final CardSm2StateRepository cardSm2StateRepository;
    private final ReviewHistoryRepository reviewHistoryRepository;
    private final UserRepository userRepository;
    private final Sm2Service sm2Service;
    private final SessionCardProgressService sessionCardProgressService;
    private final UserStreakService userStreakService;

    public ReviewService(CardRepository cardRepository,
                         CardSm2StateRepository cardSm2StateRepository,
                         ReviewHistoryRepository reviewHistoryRepository,
                         UserRepository userRepository,
                         Sm2Service sm2Service,
                         SessionCardProgressService sessionCardProgressService,
                         UserStreakService userStreakService) {
        this.cardRepository = cardRepository;
        this.cardSm2StateRepository = cardSm2StateRepository;
        this.reviewHistoryRepository = reviewHistoryRepository;
        this.userRepository = userRepository;
        this.sm2Service = sm2Service;
        this.sessionCardProgressService = sessionCardProgressService;
        this.userStreakService = userStreakService;
    }

    @Transactional
    public ReviewResponse submitReview(UUID userId, UUID cardId, int grade) {
        CardEntity card = cardRepository.findByIdAndUserId(cardId, userId)
            .orElseThrow(() -> new ResponseStatusException(NOT_FOUND, "Card not found"));

        CardSm2StateEntity state = cardSm2StateRepository.findByCardId(cardId)
            .orElseGet(() -> initializeState(card));

        long previousReviews = reviewHistoryRepository.countByCardId(cardId);
        sm2Service.applyReview(state, grade, previousReviews, LocalDate.now());
        cardSm2StateRepository.save(state);

        UserEntity user = userRepository.findById(userId)
            .orElseThrow(() -> new ResponseStatusException(NOT_FOUND, "User not found"));

        ReviewHistoryEntity review = new ReviewHistoryEntity();
        review.setCard(card);
        review.setUser(user);
        review.setGrade(grade);
        reviewHistoryRepository.save(review);

        if (grade >= 4) {
            sessionCardProgressService.markCardCompleted(userId, card.getDeck().getId(), cardId);
        } else {
            sessionCardProgressService.markCardRemaining(userId, card.getDeck().getId(), cardId);
        }
        card.getDeck().setLastReviewedAt(Instant.now());
        recordActivitySafely(userId);

        return new ReviewResponse(
            cardId,
            grade,
            state.getEasinessFactor(),
            state.getIntervalDays(),
            state.getRepetitionCount(),
            state.getAverageGrade(),
            state.getNextReviewDate(),
            sm2Service.isMastered(state),
            sm2Service.isShaky(state)
        );
    }

    private void recordActivitySafely(UUID userId) {
        try {
            userStreakService.recordActivity(userId);
        } catch (RuntimeException ex) {
            LOGGER.warn("Failed to record streak activity for user {}", userId, ex);
        }
    }

    private CardSm2StateEntity initializeState(CardEntity card) {
        CardSm2StateEntity state = new CardSm2StateEntity();
        state.setCard(card);
        state.setEasinessFactor(2.5);
        state.setIntervalDays(1);
        state.setRepetitionCount(0);
        state.setAverageGrade(0.0);
        state.setNextReviewDate(LocalDate.now());
        return state;
    }
}
