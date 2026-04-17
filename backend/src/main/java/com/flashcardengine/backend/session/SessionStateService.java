package com.flashcardengine.backend.session;

import com.flashcardengine.backend.card.CardService;
import com.flashcardengine.backend.card.dto.DueCardResponse;
import com.flashcardengine.backend.deck.DeckService;
import com.flashcardengine.backend.persistence.entity.SessionStateEntity;
import com.flashcardengine.backend.persistence.entity.SessionStateId;
import com.flashcardengine.backend.persistence.repository.SessionStateRepository;
import com.flashcardengine.backend.session.dto.SessionStateResponse;
import com.flashcardengine.backend.session.dto.UpdateSessionRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
public class SessionStateService {

    private final SessionStateRepository sessionStateRepository;
    private final DeckService deckService;
    private final CardService cardService;
    private final SessionCardProgressService sessionCardProgressService;

    public SessionStateService(SessionStateRepository sessionStateRepository,
                               DeckService deckService,
                               CardService cardService,
                               SessionCardProgressService sessionCardProgressService) {
        this.sessionStateRepository = sessionStateRepository;
        this.deckService = deckService;
        this.cardService = cardService;
        this.sessionCardProgressService = sessionCardProgressService;
    }

    @Transactional
    public SessionStateResponse getSession(UUID userId, UUID deckId) {
        deckService.getDeckForUser(deckId, userId);
        SessionStateEntity state = loadOrCreate(userId, deckId);

        List<DueCardResponse> reviewableDeckCards = cardService.deckCards(userId, deckId);
        int reviewableTotalCards = reviewableDeckCards.size();
        Set<UUID> reviewableCardIds = reviewableDeckCards.stream()
            .map(DueCardResponse::id)
            .collect(Collectors.toSet());

        Set<UUID> completedCardIds = sessionCardProgressService.completedCardIds(userId, deckId);
        completedCardIds.retainAll(reviewableCardIds);

        boolean deckCycleCompleted = reviewableTotalCards > 0 && completedCardIds.size() >= reviewableTotalCards;
        state.setCompletedCards(Math.min(completedCardIds.size(), reviewableTotalCards));

        state.setTotalCards(reviewableTotalCards);
        state.setAllCardsMode(true);
        state.setCurrentCardIndex(deckCycleCompleted
            ? 0
            : Math.min(Math.max(state.getCurrentCardIndex(), 0), Math.max(reviewableTotalCards - 1, 0)));
        state.setLastAccessed(Instant.now());
        SessionStateEntity saved = sessionStateRepository.save(state);
        return toResponse(saved, deckCycleCompleted, List.copyOf(completedCardIds));
    }

    @Transactional
    public SessionStateResponse updateSession(UUID userId, UUID deckId, UpdateSessionRequest request) {
        deckService.getDeckForUser(deckId, userId);
        SessionStateEntity state = loadOrCreate(userId, deckId);

        List<DueCardResponse> reviewableDeckCards = cardService.deckCards(userId, deckId);
        int reviewableTotalCards = reviewableDeckCards.size();
        Set<UUID> reviewableCardIds = reviewableDeckCards.stream()
            .map(DueCardResponse::id)
            .collect(Collectors.toSet());
        List<UUID> completedCardIds = sessionCardProgressService.completedCardIds(userId, deckId).stream()
            .filter(reviewableCardIds::contains)
            .toList();
        int completedCards = Math.min(completedCardIds.size(), reviewableTotalCards);

        state.setCurrentCardIndex(Math.min(Math.max(request.currentCardIndex(), 0), Math.max(reviewableTotalCards - 1, 0)));
        state.setCompletedCards(completedCards);
        state.setTotalCards(reviewableTotalCards);
        state.setAllCardsMode(request.allCardsMode());
        state.setLastAccessed(Instant.now());
        SessionStateEntity saved = sessionStateRepository.save(state);

        boolean deckCycleCompleted = reviewableTotalCards > 0 && completedCards >= reviewableTotalCards;
        return toResponse(saved, deckCycleCompleted, completedCardIds);
    }

    @Transactional
    public SessionStateResponse resetProgress(UUID userId, UUID deckId) {
        deckService.getDeckForUser(deckId, userId);
        sessionCardProgressService.clearDeckProgress(userId, deckId);

        SessionStateEntity state = loadOrCreate(userId, deckId);
        int reviewableTotalCards = cardService.deckCards(userId, deckId).size();

        state.setCurrentCardIndex(0);
        state.setCompletedCards(0);
        state.setTotalCards(reviewableTotalCards);
        state.setAllCardsMode(true);
        state.setLastAccessed(Instant.now());

        SessionStateEntity saved = sessionStateRepository.save(state);
        return toResponse(saved, false, List.of());
    }

    private SessionStateEntity loadOrCreate(UUID userId, UUID deckId) {
        SessionStateId id = new SessionStateId(userId, deckId);
        return sessionStateRepository.findById(id).orElseGet(() -> {
            SessionStateEntity entity = new SessionStateEntity();
            entity.setId(id);
            entity.setCurrentCardIndex(0);
            entity.setCompletedCards(0);
            entity.setTotalCards(0);
            entity.setAllCardsMode(true);
            entity.setLastAccessed(Instant.now());
            return entity;
        });
    }

    private SessionStateResponse toResponse(SessionStateEntity state,
                                            boolean deckCycleCompleted,
                                            List<UUID> completedCardIds) {
        return new SessionStateResponse(
            state.getId().getDeckId(),
            state.getCurrentCardIndex(),
            state.getCompletedCards(),
            state.getTotalCards(),
            state.isAllCardsMode(),
            deckCycleCompleted,
            completedCardIds,
            state.getLastAccessed()
        );
    }
}
