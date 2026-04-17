package com.flashcardengine.backend.deck;

import com.flashcardengine.backend.card.Sm2Thresholds;
import com.flashcardengine.backend.deck.dto.CreateDeckRequest;
import com.flashcardengine.backend.deck.dto.DeckSummaryResponse;
import com.flashcardengine.backend.persistence.entity.DeckEntity;
import com.flashcardengine.backend.persistence.entity.CardType;
import com.flashcardengine.backend.persistence.entity.UserEntity;
import com.flashcardengine.backend.persistence.repository.CardRepository;
import com.flashcardengine.backend.persistence.repository.CardSm2StateRepository;
import com.flashcardengine.backend.persistence.repository.DeckRepository;
import com.flashcardengine.backend.persistence.repository.UserRepository;
import com.flashcardengine.backend.streak.UserStreakService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import static org.springframework.http.HttpStatus.NOT_FOUND;

@Service
public class DeckService {

    private static final Logger LOGGER = LoggerFactory.getLogger(DeckService.class);

    private final DeckRepository deckRepository;
    private final UserRepository userRepository;
    private final CardRepository cardRepository;
    private final CardSm2StateRepository cardSm2StateRepository;
    private final UserStreakService userStreakService;

    public DeckService(DeckRepository deckRepository,
                       UserRepository userRepository,
                       CardRepository cardRepository,
                       CardSm2StateRepository cardSm2StateRepository,
                       UserStreakService userStreakService) {
        this.deckRepository = deckRepository;
        this.userRepository = userRepository;
        this.cardRepository = cardRepository;
        this.cardSm2StateRepository = cardSm2StateRepository;
        this.userStreakService = userStreakService;
    }

    @Transactional
    public DeckSummaryResponse createDeck(UUID userId, CreateDeckRequest request) {
        UserEntity user = userRepository.findById(userId)
            .orElseThrow(() -> new ResponseStatusException(NOT_FOUND, "User not found"));

        DeckEntity deck = new DeckEntity();
        deck.setUser(user);
        deck.setTitle(request.title().trim());

        DeckEntity saved = deckRepository.save(deck);
        recordActivitySafely(userId);
        return toSummary(saved);
    }

    @Transactional
    public void deleteDeck(UUID userId, UUID deckId) {
        DeckEntity deck = getDeckForUser(deckId, userId);
        deckRepository.delete(deck);
        recordActivitySafely(userId);
    }

    @Transactional(readOnly = true)
    public List<DeckSummaryResponse> listDecks(UUID userId) {
        return deckRepository.findAllByUserId(userId).stream()
            .map(this::toSummary)
            .toList();
    }

    @Transactional(readOnly = true)
    public DeckEntity getDeckForUser(UUID deckId, UUID userId) {
        return deckRepository.findByIdAndUserId(deckId, userId)
            .orElseThrow(() -> new ResponseStatusException(NOT_FOUND, "Deck not found"));
    }

    @Transactional
    public void updateLastReviewed(UUID deckId) {
        DeckEntity deck = deckRepository.findById(deckId)
            .orElseThrow(() -> new ResponseStatusException(NOT_FOUND, "Deck not found"));
        deck.setLastReviewedAt(Instant.now());
    }

    private DeckSummaryResponse toSummary(DeckEntity deck) {
        LocalDate today = LocalDate.now();
        long totalCards = cardRepository.countByDeckIdExcludingType(deck.getId(), CardType.RELATION);
        long masteredCards = cardSm2StateRepository.countMasteredByDeckId(
            deck.getId(),
            CardType.RELATION,
            Sm2Thresholds.MASTERED_MIN_REPETITIONS,
            Sm2Thresholds.MASTERED_MIN_AVERAGE_GRADE
        );
        long shakyCards = cardSm2StateRepository.countShakyByDeckId(
            deck.getId(),
            CardType.RELATION,
            Sm2Thresholds.SHAKY_MAX_AVERAGE_GRADE
        );
        long dueToday = cardSm2StateRepository.countUpcomingByDeckId(deck.getId(), today, CardType.RELATION);
        LocalDate nextReviewDate = cardSm2StateRepository.findNextReviewDateByDeckId(
            deck.getId(),
            today,
            CardType.RELATION
        );
        if (nextReviewDate != null && nextReviewDate.isBefore(today)) {
            nextReviewDate = today;
        }

        double masteryPercent = totalCards == 0 ? 0.0 : (masteredCards * 100.0) / totalCards;

        return new DeckSummaryResponse(
            deck.getId(),
            deck.getTitle(),
            deck.getLastReviewedAt(),
            deck.getCreatedAt(),
            totalCards,
            masteredCards,
            shakyCards,
            dueToday,
            nextReviewDate,
            masteryPercent
        );
    }

    private void recordActivitySafely(UUID userId) {
        try {
            userStreakService.recordActivity(userId);
        } catch (RuntimeException ex) {
            LOGGER.warn("Failed to record streak activity for user {}", userId, ex);
        }
    }
}
